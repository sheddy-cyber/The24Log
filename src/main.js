const STORAGE_KEY = "the24log:v1";

/* ---------------------------------------------------------------------------
   Fonts
   Text and figures are always DM Sans / DM Mono (loaded in index.html).
   The display face is the one user-selectable voice and is loaded on demand.
--------------------------------------------------------------------------- */
const DISPLAY_FONTS = {
  "lobster-two": {
    name: "Lobster Two",
    family: "Lobster+Two:ital,wght@0,400;0,700;1,400",
    note: "Connected script. Warm and informal.",
  },
  raleway: {
    name: "Raleway",
    family: "Raleway:wght@500;600;700",
    note: "Geometric sans. Even and quiet.",
  },
  "libre-baskerville": {
    name: "Libre Baskerville",
    family: "Libre+Baskerville:ital,wght@0,400;0,700;1,400",
    note: "Transitional serif. Reads like print.",
  },
};

function loadDisplayFont(key) {
  const font = DISPLAY_FONTS[key];
  if (!font || document.getElementById(`font-${key}`)) return;
  const link = document.createElement("link");
  link.id = `font-${key}`;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${font.family}&display=swap`;
  document.head.append(link);
}

/* ---------------------------------------------------------------------------
   State
--------------------------------------------------------------------------- */
const defaultCategories = [
  { id: "deep-work", name: "Deep work", color: "#3569e8", weight: 2, icon: "✦" },
  { id: "work", name: "Work", color: "#7d58d8", weight: 1, icon: "▣" },
  { id: "learning", name: "Learning", color: "#17a38a", weight: 1, icon: "↗" },
  { id: "exercise", name: "Exercise", color: "#e36b4b", weight: 1, icon: "◒" },
  { id: "life", name: "Life admin", color: "#e3a840", weight: 0, icon: "□" },
  { id: "social", name: "Social", color: "#d75d89", weight: 0, icon: "○" },
  { id: "rest", name: "Rest", color: "#8795a8", weight: 0, icon: "☾" },
  { id: "unplanned", name: "Unplanned", color: "#e04e5e", weight: -1, icon: "!" },
];

const defaultSettings = {
  reminder: false,
  reminderMinutes: 60,
  weekStartsMonday: true,
  theme: "system",
  displayFont: "lobster-two",
};

const defaultState = {
  entries: {},
  categories: defaultCategories,
  goals: [
    {
      id: "deep-work-weekly",
      label: "Deep work",
      categoryId: "deep-work",
      target: 12,
      period: "week",
      comparator: "min",
    },
    {
      id: "unplanned-daily",
      label: "Unplanned time",
      categoryId: "unplanned",
      target: 2,
      period: "day",
      comparator: "max",
    },
  ],
  reflections: {},
  settings: defaultSettings,
};

function migrateFont(value) {
  if (value in DISPLAY_FONTS) return value;
  if (["fredoka", "pt-serif", "averia-serif-libre"].includes(value))
    return "libre-baskerville";
  if (["inter", "ibm-plex-sans"].includes(value)) return "raleway";
  return "lobster-two";
}

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== "object") return structuredClone(defaultState);
  const saved = parsed.settings || {};
  const theme = ["system", "light", "dark"].includes(saved.theme)
    ? saved.theme
    : "darkMode" in saved
      ? saved.darkMode
        ? "dark"
        : "light"
      : "system";
  const { darkMode, ...rest } = saved;
  const next = {
    ...structuredClone(defaultState),
    ...parsed,
    categories: Array.isArray(parsed.categories) && parsed.categories.length
      ? parsed.categories
      : structuredClone(defaultCategories),
    goals: Array.isArray(parsed.goals) ? parsed.goals : structuredClone(defaultState.goals),
    entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
    reflections: parsed.reflections && typeof parsed.reflections === "object" ? parsed.reflections : {},
    settings: {
      ...defaultSettings,
      ...rest,
      theme,
      reminderMinutes: Number(rest.reminderMinutes) || 60,
      displayFont: migrateFont(saved.displayFont),
    },
  };
  delete next.dismissedNotifications;
  return next;
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let activePage = "today";
let selectedDate = localDateString(new Date());
let calendarMonth = selectedDate.slice(0, 8) + "01";
let weekAnchor = selectedDate;
let editHour = null;
let activeModal = null;
let reminderTimer = null;
let deferredInstallPrompt = null;
let undoSnapshot = null;
let pageEntering = false;
let lastSaved = null; // { date, hours, at } — drives the little pop on save
let toastTimer = null;
let noteSaveTimer = null;
const pageScrollPositions = {};

const app = document.querySelector("#app");
const toastEl = document.createElement("div");
toastEl.className = "toast";
toastEl.setAttribute("role", "status");
toastEl.setAttribute("aria-live", "polite");
document.body.append(toastEl);

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

/* ---------------------------------------------------------------------------
   Dates & numbers
--------------------------------------------------------------------------- */
function localDateString(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function todayString() {
  return localDateString(new Date());
}
function parseDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}
function shiftDate(dateString, days) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function dateLabel(dateString, options = { weekday: "long", day: "numeric", month: "long" }) {
  return parseDate(dateString).toLocaleDateString("en-GB", options);
}
function isToday(dateString) {
  return dateString === todayString();
}
function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}
function isoWeek(dateString) {
  const d = parseDate(dateString);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}
function relativeDay(dateString) {
  const diff = daysBetween(todayString(), dateString);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return diff < 0 ? `${-diff} days ago` : `In ${diff} days`;
}
function formatWeekRange(startStr, endStr) {
  const d1 = parseDate(startStr);
  const d2 = parseDate(endStr);
  const m1 = d1.toLocaleDateString("en-GB", { month: "short" });
  const m2 = d2.toLocaleDateString("en-GB", { month: "short" });
  if (m1 === m2) return `${d1.getDate()}–${d2.getDate()} ${m2}`;
  return `${d1.getDate()} ${m1} – ${d2.getDate()} ${m2}`;
}
function rangeOfHours(start, end) {
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
}
function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char],
  );
}

/* ---------------------------------------------------------------------------
   Queries
--------------------------------------------------------------------------- */
function getDayEntries(date = selectedDate) {
  return state.entries[date] || {};
}
function categoryFor(id) {
  return state.categories.find((category) => category.id === id) || state.categories[0];
}
function entryFor(date, hour) {
  return state.entries[date]?.[hour] || null;
}
function loggedCount(date) {
  return Object.keys(getDayEntries(date)).length;
}
function hoursByCategory(dates) {
  const totals = Object.fromEntries(state.categories.map((category) => [category.id, 0]));
  dates.forEach((date) =>
    Object.values(getDayEntries(date)).forEach((entry) => {
      if (entry.categoryId in totals) totals[entry.categoryId] += 1;
    }),
  );
  return totals;
}
function productivityScore(date) {
  const entries = Object.values(getDayEntries(date));
  if (!entries.length) return null;
  const weighted = entries.reduce(
    (sum, entry) => sum + (categoryFor(entry.categoryId)?.weight ?? 0),
    0,
  );
  return Math.max(0, Math.min(100, Math.round(50 + (weighted / entries.length) * 25)));
}
function scoreTone(score) {
  if (score === null) return "none";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "low";
}
function weekDates(anchor = selectedDate) {
  const date = parseDate(anchor);
  const day = date.getDay();
  const offset = state.settings.weekStartsMonday ? (day + 6) % 7 : day;
  date.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) =>
    localDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + index)),
  );
}
function getStreak() {
  let date = todayString();
  let streak = 0;
  for (let index = 0; index < 365; index += 1) {
    if (loggedCount(date) >= 18) {
      streak += 1;
      date = shiftDate(date, -1);
    } else if (index === 0) date = shiftDate(date, -1);
    else break;
  }
  return streak;
}
function topCategory(dates) {
  const totals = hoursByCategory(dates);
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  if (!top || !top[1]) return null;
  return { ...categoryFor(top[0]), hours: top[1] };
}
function restCategory() {
  return (
    state.categories.find((c) => c.id === "rest") ||
    state.categories.find((c) => /rest|sleep/i.test(c.name)) ||
    null
  );
}
function unloggedGaps(date = todayString()) {
  const entries = getDayEntries(date);
  const end = isToday(date) ? new Date().getHours() : date < todayString() ? 24 : 0;
  const gaps = [];
  let start = null;
  for (let h = 0; h < end; h += 1) {
    if (!entries[h]) {
      if (start === null) start = h;
    } else if (start !== null) {
      gaps.push([start, h]);
      start = null;
    }
  }
  if (start !== null) gaps.push([start, end]);
  return gaps;
}
function suggestions(field) {
  const counts = new Map();
  Object.keys(state.entries)
    .sort()
    .reverse()
    .slice(0, 60)
    .forEach((date) =>
      Object.values(state.entries[date]).forEach((entry) => {
        const value = (entry[field] || "").trim();
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
      }),
    );
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([value]) => value);
}
function goalAmount(goal) {
  const today = todayString();
  const dates = goal.period === "week" ? weekDates(today) : [today];
  return hoursByCategory(dates)[goal.categoryId] || 0;
}
function goalIsHit(goal) {
  const amount = goalAmount(goal);
  return goal.comparator === "max" ? amount <= goal.target : amount >= goal.target;
}

/* ---------------------------------------------------------------------------
   Icons (stroke icons, 24 grid)
--------------------------------------------------------------------------- */
const ICONS = {
  today: '<path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M8 13h3m2 0h3m-8 3h3"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3.5 2"/>',
  insights: '<path d="M4 19V5m0 14h16M8 16v-4m4 4V7m4 9v-7"/>',
  goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  settings: '<path d="M4 7h10m4 0h2M4 17h4m4 0h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  calendar: '<path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/>',
  upload: '<path d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M20 5H9a5 5 0 0 0-5 5v1"/><path d="M7 22l-3-3 3-3"/><path d="M4 19h11a5 5 0 0 0 5-5v-1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sunrise: '<path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 4v3M4.9 8.9l1.4 1.4M19.1 8.9l-1.4 1.4M2 14h2m16 0h2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sunset: '<path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 9V4m0 5-2-2m2 2 2-2M2 14h2m16 0h2"/>',
  flame: '<path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-3.4-2.3-5.3-3.6-7.8-.6 1.6-1.6 2.6-2.6 3C12.7 7 11.6 4.5 9.5 3c.2 3-1.6 4.8-3 6.6A7.4 7.4 0 0 0 5.5 14.8C5.5 18.4 8 21 12 21Z"/>',
};
function icon(name) {
  return ICONS[name]
    ? `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`
    : "";
}

/* ---------------------------------------------------------------------------
   Theme
--------------------------------------------------------------------------- */
function daypart(hour = new Date().getHours()) {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
function resolvedTheme() {
  const theme = state.settings.theme;
  if (theme === "system") return darkQuery.matches ? "dark" : "light";
  return theme;
}
function applyAppearance() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.font = state.settings.displayFont;
  document.documentElement.dataset.daypart = daypart();
  loadDisplayFont(state.settings.displayFont);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#0c1220" : "#f7f3ea";
}
darkQuery.addEventListener?.("change", () => {
  if (state.settings.theme === "system") applyAppearance();
});

/* ---------------------------------------------------------------------------
   Navigation
--------------------------------------------------------------------------- */
const PAGES = [
  ["today", "Today"],
  ["history", "History"],
  ["insights", "Insights"],
  ["goals", "Goals"],
  ["settings", "Settings"],
];
const VALID_PAGES = PAGES.map(([page]) => page);

function getPageFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  return VALID_PAGES.includes(hash) ? hash : "today";
}

function navigateToPage(targetPage, options = {}) {
  if (!VALID_PAGES.includes(targetPage)) targetPage = "today";
  if (activePage === targetPage && !activeModal && !options.force) return;
  pageScrollPositions[activePage] = window.scrollY;
  if (targetPage === "history" && activePage !== "history")
    calendarMonth = selectedDate.slice(0, 8) + "01";
  if (targetPage === "insights" && activePage !== "insights") weekAnchor = selectedDate;
  activePage = targetPage;
  activeModal = null;
  editHour = null;
  pageEntering = true;

  const targetHash = `#${targetPage}`;
  if (window.location.hash !== targetHash && !options.skipHistory) {
    history[options.replace ? "replaceState" : "pushState"]({ page: targetPage }, "", targetHash);
  }
  render();
  const top = options.resetScroll ? 0 : pageScrollPositions[targetPage] || 0;
  window.scrollTo({ top, behavior: "instant" });
}

/* ---------------------------------------------------------------------------
   Render
--------------------------------------------------------------------------- */
function render() {
  applyAppearance();
  const pages = {
    today: todayPage,
    history: historyPage,
    insights: insightsPage,
    goals: goalsPage,
    settings: settingsPage,
  };
  app.innerHTML = `
    <div class="shell">
      ${sidebar()}
      <div class="main">
        <header class="topbar">
          <span class="wordmark">THE <b>24</b> LOG</span>
          <button class="btn btn-primary btn-sm" data-action="open-quick-log">${icon("plus")}<span>Log</span></button>
        </header>
        <main class="content" id="content">${pages[activePage]()}</main>
      </div>
      ${tabbar()}
    </div>
    ${activeModal ? modal() : ""}
  `;
  if (pageEntering) {
    app.querySelector(".page")?.classList.add("is-entering");
    pageEntering = false;
  }
}

function sidebar() {
  const streak = getStreak();
  return `<aside class="sidebar">
    <div class="brand"><img src="/icon.svg" alt="" width="28" height="28" /><span class="wordmark">THE <b>24</b> LOG</span></div>
    <button class="log-button" data-action="open-quick-log">${icon("plus")}<span>Log an hour</span><kbd>N</kbd></button>
    <nav aria-label="Main">${PAGES.map(
      ([page, label]) =>
        `<button class="nav-link ${activePage === page ? "active" : ""}" data-page="${page}" ${activePage === page ? 'aria-current="page"' : ""}>${icon(page)}<span>${label}</span></button>`,
    ).join("")}</nav>
    <div class="sidebar-foot">
      <p class="streak ${streak ? "is-on" : ""}"><b>${streak ? icon("flame") : ""}${streak}</b> ${streak === 1 ? "day" : "days"} in a row with 18+ hours logged</p>
      <button class="shortcut-hint" data-action="open-shortcuts">Keyboard shortcuts <kbd>?</kbd></button>
    </div>
  </aside>`;
}

function tabbar() {
  return `<nav class="tabbar" aria-label="Main">${PAGES.map(
    ([page, label]) =>
      `<button class="${activePage === page ? "active" : ""}" data-page="${page}" ${activePage === page ? 'aria-current="page"' : ""}>${icon(page)}<span>${label}</span></button>`,
  ).join("")}</nav>`;
}

function pageHead({ kicker = "", title, sub = "", actions = "" }) {
  return `<header class="page-head">
    <div class="page-title">
      ${kicker ? `<p class="kicker">${kicker}</p>` : ""}
      <h1>${title}</h1>
      ${sub ? `<p class="page-sub">${sub}</p>` : ""}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

/* The 24-segment strip: the app's one recurring picture of a day. */
function justSaved(date, hour) {
  return lastSaved && lastSaved.date === date && lastSaved.hours.includes(hour) && Date.now() - lastSaved.at < 900;
}

function dayStrip(date, { size = "md", interactive = false } = {}) {
  const entries = getDayEntries(date);
  const nowHour = isToday(date) ? new Date().getHours() : -1;
  const future = date > todayString();
  const cells = rangeOfHours(0, 24)
    .map((hour) => {
      const entry = entries[hour];
      const category = entry ? categoryFor(entry.categoryId) : null;
      const classes = [
        "seg",
        entry ? "on" : "",
        hour === nowHour ? "now" : "",
        future || (nowHour >= 0 && hour > nowHour) ? "ahead" : "",
        entry && justSaved(date, hour) ? "pop" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const label = `${formatHour(hour)} – ${entry ? `${entry.title} (${category.name})` : "not logged"}`;
      const order = entry && justSaved(date, hour) ? `;--i:${lastSaved.hours.indexOf(hour)}` : "";
      const style = category ? ` style="--c:${category.color}${order}"` : "";
      return interactive
        ? `<button type="button" class="${classes}"${style} data-action="jump-hour" data-hour="${hour}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></button>`
        : `<i class="${classes}"${style}></i>`;
    })
    .join("");
  const aria = interactive ? 'role="group" aria-label="Hours of the day"' : `role="img" aria-label="${loggedCount(date)} of 24 hours logged"`;
  return `<div class="strip strip-${size}" ${aria}>${cells}</div>`;
}

/* ----------------------------- Today ------------------------------------- */
const PERIODS = [
  [0, "Night", "moon"],
  [6, "Morning", "sunrise"],
  [12, "Afternoon", "sun"],
  [18, "Evening", "sunset"],
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function todayPage() {
  const date = selectedDate;
  const logged = loggedCount(date);
  const score = productivityScore(date);
  const viewingToday = isToday(date);
  const gaps = viewingToday ? unloggedGaps(date) : [];
  const gapHours = gaps.reduce((sum, [a, b]) => sum + (b - a), 0);
  const top = topCategory([date]);
  const unplanned = hoursByCategory([date]).unplanned || 0;
  const unplannedGoal = state.goals.find((g) => g.categoryId === "unplanned" && g.period === "day");
  const rest = restCategory();
  const nightOpen = rest && date <= todayString() && rangeOfHours(0, 8).some((h) => !entryFor(date, h));

  const actions = `
    <div class="day-nav">
      <button class="btn btn-icon" data-action="shift-date" data-shift="-1" aria-label="Previous day" title="Previous day ( ← )">${icon("left")}</button>
      <button class="btn btn-icon" data-action="show-date-picker" aria-label="Pick a date" title="Pick a date">${icon("calendar")}</button>
      <button class="btn btn-icon" data-action="shift-date" data-shift="1" aria-label="Next day" title="Next day ( → )">${icon("right")}</button>
    </div>
    ${viewingToday ? "" : '<button class="btn" data-action="jump-today">Back to today</button>'}`;

  const kicker = `${viewingToday ? greeting() : relativeDay(date)} · Week ${isoWeek(date)}`;

  return `<div class="page today-page">
    ${pageHead({ kicker, title: dateLabel(date), actions })}

    <section class="day-overview" aria-label="Day overview">
      ${dayStrip(date, { size: "lg", interactive: true })}
      <div class="strip-scale" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </section>

    <dl class="stats">
      <div class="stat">
        <dt>Logged</dt>
        <dd><span class="figure">${logged}</span><span class="unit">/ 24 h</span></dd>
        <p class="stat-note">${
          viewingToday && gapHours
            ? `<button class="link" data-action="open-gaps">${plural(gapHours, "earlier hour")} open</button>`
            : logged === 24
              ? "All 24. Nicely done."
              : `${24 - logged} open`
        }</p>
      </div>
      <div class="stat">
        <dt>Score <button class="info-dot" data-action="explain-score" aria-label="How the score works">?</button></dt>
        <dd><span class="figure tone-${scoreTone(score)}">${score ?? "–"}</span>${score === null ? "" : '<span class="unit">/ 100</span>'}</dd>
        <p class="stat-note">${score === null ? "Log an hour to see it" : score >= 70 ? "A focused day" : score >= 50 ? "A good, balanced day" : "A loose day. Tomorrow's new"}</p>
      </div>
      <div class="stat">
        <dt>Unplanned</dt>
        <dd><span class="figure ${unplannedGoal && unplanned > unplannedGoal.target ? "tone-low" : ""}">${unplanned}</span><span class="unit">h</span></dd>
        <p class="stat-note">${
          unplannedGoal
            ? unplanned > unplannedGoal.target
              ? `${unplanned - unplannedGoal.target}h over your ${unplannedGoal.target}h limit`
              : `Limit ${unplannedGoal.target}h`
            : "No daily limit set"
        }</p>
      </div>
      <div class="stat">
        <dt>Most time</dt>
        <dd>${top ? `<span class="figure figure-text"><i class="dot" style="--c:${top.color}"></i>${escapeHtml(top.name)}</span>` : '<span class="figure">–</span>'}</dd>
        <p class="stat-note">${top ? `${top.hours}h · ${Math.round((top.hours / Math.max(1, logged)) * 100)}% of logged time` : "Waiting on the first hour"}</p>
      </div>
    </dl>

    ${carriedNote(date)}

    <section class="ledger" aria-labelledby="ledger-title">
      <div class="section-head">
        <h2 id="ledger-title">Hours</h2>
        ${nightOpen ? `<button class="btn btn-ghost btn-sm" data-action="fill-rest">${icon("moon")}<span>Fill 00–08 as sleep</span></button>` : ""}
      </div>
      <ol class="hours">${PERIODS.map(([start, label, glyph]) => {
        const count = rangeOfHours(start, start + 6).filter((h) => entryFor(date, h)).length;
        return `<li class="period period-${label.toLowerCase()}"><span class="period-name">${icon(glyph)}${label}</span><span class="period-count ${count === 6 ? "is-full" : ""}">${count === 6 ? "all 6 ✓" : `${count} of 6`}</span></li>${rangeOfHours(start, start + 6).map(hourRow).join("")}`;
      }).join("")}</ol>
      <datalist id="title-suggestions">${suggestions("title").map((t) => `<option value="${escapeHtml(t)}"></option>`).join("")}</datalist>
      <datalist id="project-suggestions">${suggestions("project").map((t) => `<option value="${escapeHtml(t)}"></option>`).join("")}</datalist>
    </section>

    ${noteCard(date)}
  </div>`;
}

function hourRow(hour) {
  const date = selectedDate;
  const entry = entryFor(date, hour);
  const nowHour = isToday(date) ? new Date().getHours() : -1;
  const current = hour === nowHour;
  const ahead = date > todayString() || (nowHour >= 0 && hour > nowHour);
  const time = `<span class="hour-time">${formatHour(hour)}${current ? '<span class="now-tag">now</span>' : ""}</span>`;
  const base = ["hour", current ? "current" : "", ahead ? "ahead" : "", entry && justSaved(date, hour) ? "just-saved" : ""].filter(Boolean).join(" ");

  if (editHour === hour) {
    return `<li class="${base} editing" id="hour-${hour}">${time}${entryForm(hour, entry)}</li>`;
  }

  if (entry) {
    const category = categoryFor(entry.categoryId);
    return `<li class="${base} logged" id="hour-${hour}" style="--c:${category.color}">
      ${time}
      <button class="hour-body" data-action="edit-hour" data-hour="${hour}" aria-label="Edit ${formatHour(hour)}: ${escapeHtml(entry.title)}">
        <span class="hour-title">${escapeHtml(entry.title)}</span>
        <span class="hour-meta"><i class="dot"></i>${escapeHtml(category.name)}${entry.project ? `<span class="sep">·</span>${escapeHtml(entry.project)}` : ""}</span>
      </button>
    </li>`;
  }

  const prev = hour > 0 ? entryFor(date, hour - 1) : null;
  const placeholder = current ? "What are you up to right now?" : ahead ? "" : "Not logged";
  return `<li class="${base} empty" id="hour-${hour}">
    ${time}
    <button class="hour-body" data-action="edit-hour" data-hour="${hour}" aria-label="Log ${formatHour(hour)}">
      <span class="hour-placeholder">${placeholder}</span><span class="hour-add">${icon("plus")}Log</span>
    </button>
    ${prev && !ahead ? `<button class="repeat" data-action="repeat-prev" data-hour="${hour}" title="Copy the ${formatHour(hour - 1)} entry into this hour">${icon("repeat")}<span>${escapeHtml(prev.title)}</span></button>` : ""}
  </li>`;
}

function categoryPicker(selectedId) {
  return `<fieldset class="cat-picker">
    <legend class="sr-only">Category</legend>
    ${state.categories
      .map(
        (category, index) =>
          `<label class="cat-option" style="--c:${category.color}"><input type="radio" name="categoryId" value="${category.id}" ${category.id === selectedId ? "checked" : ""} ${index === 0 ? "required" : ""} /><span><i class="dot"></i>${escapeHtml(category.name)}</span></label>`,
      )
      .join("")}
  </fieldset>`;
}

function endOptions(start, selected) {
  return rangeOfHours(start + 1, 25)
    .map(
      (end) =>
        `<option value="${end}" ${end === selected ? "selected" : ""}>${end === 24 ? "24:00" : formatHour(end)}  ·  ${end - start}h</option>`,
    )
    .join("");
}

function entryForm(hour, entry) {
  return `<form class="hour-form" data-form="entry" data-hour="${hour}">
    ${categoryPicker(entry?.categoryId)}
    <div class="hour-form-fields">
      <input name="title" maxlength="140" placeholder="What did you do?" value="${escapeHtml(entry?.title || "")}" aria-label="What did you do?" list="title-suggestions" autocomplete="off" required />
      <input name="project" maxlength="35" placeholder="Project (optional)" value="${escapeHtml(entry?.project || "")}" aria-label="Project" list="project-suggestions" autocomplete="off" />
    </div>
    <div class="hour-form-foot">
      <label class="until">Until <select name="until" aria-label="Ends at">${endOptions(hour, hour + 1)}</select></label>
      <div class="hour-form-buttons">
        ${entry ? `<button type="button" class="btn btn-ghost btn-sm danger-text" data-action="clear-hour" data-hour="${hour}">${icon("trash")}<span>Clear</span></button>` : ""}
        <button type="button" class="btn btn-sm" data-action="cancel-edit">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">Save</button>
      </div>
    </div>
  </form>`;
}

function carriedNote(date) {
  const prevDate = shiftDate(date, -1);
  const note = state.reflections[prevDate];
  if (!note) return "";
  return `<aside class="carried-note">
    <p class="carried-label">Note from ${daysBetween(prevDate, todayString()) === 1 ? "yesterday" : dateLabel(prevDate, { weekday: "long", day: "numeric", month: "short" })}</p>
    <p class="carried-text">${escapeHtml(note)}</p>
  </aside>`;
}

function noteCard(date) {
  const note = state.reflections[date] || "";
  const next = shiftDate(date, 1);
  return `<section class="note-card" id="reflection-section" aria-labelledby="note-title">
    <div class="note-intro">
      <h2 id="note-title">Note for ${isToday(date) ? "tomorrow" : dateLabel(next, { weekday: "long" })}</h2>
      <p>One thing to do differently, or to keep doing. It shows at the top of the next day.</p>
    </div>
    <div class="note-field">
      <textarea data-note="${date}" maxlength="300" rows="3" placeholder="e.g. Start the proposal before checking email">${escapeHtml(note)}</textarea>
      <p class="note-status" data-note-status>${note ? "Saved" : "Saves as you type"}</p>
    </div>
  </section>`;
}

/* ----------------------------- History ----------------------------------- */
function historyPage() {
  const shown = parseDate(calendarMonth);
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const first = new Date(year, month, 1);
  const startDay = state.settings.weekStartsMonday ? (first.getDay() + 6) % 7 : first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthDates = rangeOfHours(1, daysInMonth + 1).map((d) => localDateString(new Date(year, month, d)));
  const pastDates = monthDates.filter((d) => d <= todayString());
  const fullDays = monthDates.filter((d) => loggedCount(d) >= 18).length;
  const totalHours = monthDates.reduce((sum, d) => sum + loggedCount(d), 0);
  const scored = monthDates.map(productivityScore).filter((s) => s !== null);
  const avgScore = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const top = topCategory(monthDates);
  const weekdays = state.settings.weekStartsMonday
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [
    ...Array.from({ length: startDay }, () => '<span class="cal-blank"></span>'),
    ...monthDates.map(calendarDay),
  ];
  const monthName = shown.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const isCurrentMonth = calendarMonth === todayString().slice(0, 8) + "01";

  return `<div class="page">
    ${pageHead({ title: "History", sub: "Every day you have logged, by month. Pick a day to open its ledger." })}
    <div class="history-layout">
      <section class="panel calendar" aria-label="${monthName}">
        <div class="calendar-head">
          <h2>${monthName}</h2>
          <div class="day-nav">
            <button class="btn btn-icon" data-action="shift-month" data-shift="-1" aria-label="Previous month">${icon("left")}</button>
            ${isCurrentMonth ? "" : '<button class="btn btn-sm" data-action="current-month">This month</button>'}
            <button class="btn btn-icon" data-action="shift-month" data-shift="1" aria-label="Next month">${icon("right")}</button>
          </div>
        </div>
        <div class="cal-weekdays">${weekdays.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="cal-grid">${cells.join("")}</div>
      </section>
      <aside class="panel month-summary">
        <h2>${shown.toLocaleDateString("en-GB", { month: "long" })} so far</h2>
        <dl class="summary-list">
          <div><dt>Hours logged</dt><dd>${totalHours}<small> of ${pastDates.length * 24}</small></dd></div>
          <div><dt>Days with 18+ hours</dt><dd>${fullDays}<small> of ${pastDates.length}</small></dd></div>
          <div><dt>Average score</dt><dd class="tone-${scoreTone(avgScore)}">${avgScore ?? "–"}</dd></div>
          <div><dt>Most time</dt><dd>${top ? `<i class="dot" style="--c:${top.color}"></i>${escapeHtml(top.name)} <small>${top.hours}h</small>` : "–"}</dd></div>
        </dl>
      </aside>
    </div>
    <section class="panel recent">
      <div class="section-head"><h2>Last 14 days</h2></div>
      <ol class="recent-list">${rangeOfHours(0, 14).map((i) => recentDayRow(shiftDate(todayString(), -i))).join("")}</ol>
    </section>
  </div>`;
}

function calendarDay(date) {
  const logged = loggedCount(date);
  const classes = [
    "cal-day",
    isToday(date) ? "is-today" : "",
    date === selectedDate ? "is-selected" : "",
    date > todayString() ? "is-future" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<button class="${classes}" data-action="select-date" data-date="${date}" aria-label="${dateLabel(date)}, ${logged} hours logged">
    <span class="cal-num">${parseDate(date).getDate()}</span>
    ${date <= todayString() ? dayStrip(date, { size: "xs" }) : ""}
    <span class="cal-hours">${logged ? `${logged}h` : ""}</span>
  </button>`;
}

function recentDayRow(date) {
  const score = productivityScore(date);
  const logged = loggedCount(date);
  return `<li><button class="recent-day" data-action="select-date" data-date="${date}">
    <span class="recent-date"><b>${isToday(date) ? "Today" : dateLabel(date, { weekday: "short" })}</b> ${dateLabel(date, { day: "numeric", month: "short" })}</span>
    ${dayStrip(date, { size: "sm" })}
    <span class="recent-hours">${logged}<small>h</small></span>
    <span class="recent-score tone-${scoreTone(score)}">${score ?? "–"}</span>
  </button></li>`;
}

/* ----------------------------- Insights ---------------------------------- */
function insightsPage() {
  const week = weekDates(weekAnchor);
  const elapsed = week.filter((d) => d <= todayString()).length;
  // Compare like with like: a half-finished week against the same days of the previous one.
  const prevWeek = week.slice(0, Math.max(1, elapsed)).map((d) => shiftDate(d, -7));
  const totals = hoursByCategory(week);
  const prevTotals = hoursByCategory(prevWeek);
  const totalLogged = Object.values(totals).reduce((a, b) => a + b, 0);
  const scores = week.map((date) => ({ date, score: productivityScore(date), count: loggedCount(date) }));
  const scored = scores.filter((s) => s.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length) : null;
  const best = scored.slice().sort((a, b) => b.score - a.score)[0];
  const thisWeek = weekDates(todayString())[0] === week[0];

  const actions = `<div class="day-nav">
    <button class="btn btn-icon" data-action="shift-week" data-shift="-7" aria-label="Previous week">${icon("left")}</button>
    <span class="nav-label">${formatWeekRange(week[0], week[6])}</span>
    <button class="btn btn-icon" data-action="shift-week" data-shift="7" aria-label="Next week">${icon("right")}</button>
  </div>${thisWeek ? "" : '<button class="btn" data-action="this-week">This week</button>'}`;

  return `<div class="page">
    ${pageHead({ kicker: `${thisWeek ? "This week" : `Week ${isoWeek(week[0])}`}`, title: "Insights", actions })}

    <dl class="stats">
      <div class="stat"><dt>Hours logged</dt><dd><span class="figure">${totalLogged}</span><span class="unit">/ ${elapsed * 24} h</span></dd><p class="stat-note">${elapsed ? `${Math.round((totalLogged / (elapsed * 24)) * 100)}% of the hours so far` : "Week hasn't started"}</p></div>
      <div class="stat"><dt>Average score</dt><dd><span class="figure tone-${scoreTone(avg)}">${avg ?? "–"}</span></dd><p class="stat-note">${scored.length ? `Across ${plural(scored.length, "logged day")}` : "No logged days"}</p></div>
      <div class="stat"><dt>Best day</dt><dd><span class="figure figure-text">${best ? dateLabel(best.date, { weekday: "long" }) : "–"}</span></dd><p class="stat-note">${best ? `Scored ${best.score}` : "–"}</p></div>
      <div class="stat"><dt>Versus last week</dt><dd><span class="figure">${signed(totalLogged - Object.values(prevTotals).reduce((a, b) => a + b, 0))}</span><span class="unit">h logged</span></dd><p class="stat-note">${prevWeek.length < 7 ? `Same days, ${formatWeekRange(prevWeek[0], prevWeek.at(-1))}` : formatWeekRange(prevWeek[0], prevWeek.at(-1))}</p></div>
    </dl>

    <div class="insights-grid">
      <section class="panel">
        <div class="section-head"><h2>Daily score</h2><span class="section-note">Bar height is the score; the number under it is hours logged</span></div>
        <div class="score-chart">${scores.map(scoreBar).join("")}</div>
      </section>

      <section class="panel">
        <div class="section-head"><h2>Where the hours went</h2><span class="section-note">Change vs. the same days last week</span></div>
        ${categoryTable(totals, prevTotals, totalLogged)}
      </section>

      <section class="panel span-2">
        <div class="section-head"><h2>Hour by hour</h2><span class="section-note">Lighter cells are neutral or negative categories</span></div>
        ${heatmap(week)}
      </section>

      <section class="panel span-2">
        <div class="section-head"><h2>Observations</h2></div>
        ${observationList(week, prevTotals)}
      </section>
    </div>
  </div>`;
}

function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

function scoreBar({ date, score, count }) {
  const day = parseDate(date).toLocaleDateString("en-GB", { weekday: "short" });
  const height = score === null ? 0 : Math.max(4, score);
  return `<button class="score-col ${date === selectedDate ? "is-selected" : ""}" data-action="select-date" data-date="${date}" aria-label="${dateLabel(date)}: score ${score ?? "none"}, ${count} hours logged">
    <span class="score-val">${score ?? ""}</span>
    <span class="score-track"><i class="tone-bg-${scoreTone(score)}" style="height:${height}%"></i></span>
    <span class="score-day ${isToday(date) ? "is-today" : ""}">${day}</span>
    <span class="score-hours">${count}h</span>
  </button>`;
}

function categoryTable(totals, prevTotals, total) {
  const rows = state.categories
    .map((c) => ({ ...c, hours: totals[c.id] || 0, prev: prevTotals[c.id] || 0 }))
    .filter((c) => c.hours || c.prev)
    .sort((a, b) => b.hours - a.hours);
  if (!rows.length) return '<p class="empty-note">Nothing logged this week or last.</p>';
  const max = Math.max(...rows.map((r) => r.hours), 1);
  return `<table class="cat-table">
    <thead><tr><th scope="col">Category</th><th scope="col" class="sr-only">Share</th><th scope="col" class="num">Hours</th><th scope="col" class="num">Change</th></tr></thead>
    <tbody>${rows
      .map((r) => {
        const diff = r.hours - r.prev;
        return `<tr style="--c:${r.color}">
          <th scope="row"><i class="dot"></i>${escapeHtml(r.name)}</th>
          <td class="bar-cell"><span class="hbar"><i style="width:${(r.hours / max) * 100}%"></i></span></td>
          <td class="num">${r.hours}<small>h</small> <span class="share">${total ? Math.round((r.hours / total) * 100) : 0}%</span></td>
          <td class="num delta ${diff > 0 ? "up" : diff < 0 ? "down" : ""}">${signed(diff)}</td>
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function heatmap(week) {
  const head = `<div class="heat-row heat-head"><span></span>${rangeOfHours(0, 24)
    .map((h) => `<i>${h % 3 === 0 ? String(h).padStart(2, "0") : ""}</i>`)
    .join("")}</div>`;
  const rows = week
    .map(
      (date) =>
        `<div class="heat-row"><button class="heat-day" data-action="select-date" data-date="${date}">${parseDate(date).toLocaleDateString("en-GB", { weekday: "short" })}</button>${rangeOfHours(0, 24)
          .map((hour) => {
            const entry = entryFor(date, hour);
            if (!entry) return `<i class="heat-cell" title="${date} ${formatHour(hour)} – not logged"></i>`;
            const c = categoryFor(entry.categoryId);
            const level = c.weight >= 1 ? "strong" : c.weight === 0 ? "soft" : "neg";
            return `<i class="heat-cell is-${level}" style="--c:${c.color}" title="${date} ${formatHour(hour)} – ${escapeHtml(entry.title)} (${escapeHtml(c.name)})"></i>`;
          })
          .join("")}</div>`,
    )
    .join("");
  return `<div class="heatmap" role="img" aria-label="Logged hours for each day of the week">${head}${rows}</div>`;
}

function observationList(week, prevTotals) {
  const items = [];
  const past = week.filter((d) => d <= todayString());
  if (!past.some((d) => loggedCount(d))) {
    return '<p class="empty-note">Observations appear once a few days have entries.</p>';
  }
  const productiveIds = new Set(state.categories.filter((c) => c.weight >= 1).map((c) => c.id));
  const negativeIds = new Set(state.categories.filter((c) => c.weight < 0).map((c) => c.id));
  const hourCount = (ids) =>
    rangeOfHours(0, 24)
      .map((h) => [h, past.filter((d) => ids.has(entryFor(d, h)?.categoryId)).length])
      .sort((a, b) => b[1] - a[1])[0];

  const [focusHour, focusDays] = hourCount(productiveIds);
  if (focusDays >= 2)
    items.push(`Focused work happened at <b>${formatHour(focusHour)}</b> on ${focusDays} of ${past.length} days, more than any other hour.`);

  const [driftHour, driftDays] = hourCount(negativeIds);
  if (driftDays >= 2)
    items.push(`Unplanned time showed up at <b>${formatHour(driftHour)}</b> on ${driftDays} days. That hour may need a plan.`);

  const totals = hoursByCategory(week);
  const changes = state.categories
    .map((c) => [c, (totals[c.id] || 0) - (prevTotals[c.id] || 0)])
    .filter(([, diff]) => diff !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (changes.length) {
    const [c, diff] = changes[0];
    items.push(`<b>${escapeHtml(c.name)}</b> changed the most against the same days last week: ${diff > 0 ? `${diff}h more` : `${-diff}h less`}.`);
  }

  const gapHours = past.reduce((sum, d) => sum + unloggedGaps(d).reduce((s, [a, b]) => s + b - a, 0), 0);
  if (gapHours)
    items.push(`${plural(gapHours, "hour")} so far this week ${gapHours === 1 ? "has" : "have"} no entry.`);

  goalsWithStatus(week).forEach((line) => items.push(line));

  return items.length
    ? `<ul class="observations">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`
    : '<p class="empty-note">Not enough of a pattern yet.</p>';
}

function goalsWithStatus(week) {
  return state.goals
    .filter((g) => g.period === "week")
    .map((g) => {
      const amount = hoursByCategory(week)[g.categoryId] || 0;
      const label = escapeHtml(g.label || categoryFor(g.categoryId).name);
      if (g.comparator === "min")
        return amount >= g.target
          ? `Weekly goal met: <b>${label}</b>, ${amount} of ${g.target}h.`
          : `<b>${label}</b> is at ${amount} of ${g.target}h for the week.`;
      return amount > g.target
        ? `<b>${label}</b> went ${amount - g.target}h past its ${g.target}h weekly limit.`
        : `<b>${label}</b> stayed under its ${g.target}h weekly limit (${amount}h).`;
    });
}

/* ----------------------------- Goals ------------------------------------- */
function goalsPage() {
  const today = todayString();
  const week = weekDates(today);
  const hit = state.goals.filter(goalIsHit).length;
  return `<div class="page">
    ${pageHead({
      kicker: `Week of ${formatWeekRange(week[0], week[6])}`,
      title: "Goals",
      sub: state.goals.length
        ? `${hit} of ${state.goals.length} on track. Daily goals are measured against today.`
        : "Targets for the time you want to protect, or limit.",
      actions: `<button class="btn btn-primary" data-action="open-goal-modal">${icon("plus")}<span>New goal</span></button>`,
    })}
    ${
      state.goals.length
        ? `<ul class="goal-list">${state.goals.map(goalRow).join("")}</ul>`
        : `<section class="panel empty-state">
            <h2>No goals yet</h2>
            <p>Pick one category and a number of hours. For example, at least 10 hours of deep work a week, or no more than 2 hours of unplanned time a day.</p>
            <button class="btn btn-primary" data-action="open-goal-modal">Create a goal</button>
          </section>`
    }
  </div>`;
}

function goalRow(goal) {
  const amount = goalAmount(goal);
  const category = categoryFor(goal.categoryId);
  const isMax = goal.comparator === "max";
  const hit = goalIsHit(goal);
  const scale = Math.max(goal.target, amount) * (isMax ? 1.25 : 1);
  const fill = Math.min(100, (amount / scale) * 100);
  const marker = (goal.target / scale) * 100;
  const status = isMax
    ? hit
      ? `${goal.target - amount}h left before the limit`
      : `${amount - goal.target}h over the limit`
    : hit
      ? "Done ✓"
      : `${goal.target - amount}h to go`;
  const week = goal.period === "week" ? weekDates(todayString()) : null;
  return `<li class="goal ${hit ? "is-hit" : "is-miss"} ${isMax ? "is-limit" : ""}" style="--c:${category.color}">
    <div class="goal-info">
      <p class="goal-rule">${isMax ? "At most" : "At least"} ${goal.target}h ${goal.period === "week" ? "a week" : "a day"}</p>
      <h2 class="goal-name"><i class="dot"></i>${escapeHtml(goal.label || category.name)}</h2>
    </div>
    <div class="goal-progress">
      <div class="goal-bar"><i style="width:${fill}%"></i><span class="goal-target" style="left:${marker}%"></span></div>
      <p class="goal-figures"><b>${amount}h</b> of ${goal.target}h <span class="goal-status">${status}</span></p>
      ${week ? `<div class="goal-days" aria-hidden="true">${week.map((d) => `<span class="${d > todayString() ? "ahead" : ""}"><i style="height:${Math.min(100, ((hoursByCategory([d])[goal.categoryId] || 0) / 8) * 100)}%"></i><small>${parseDate(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</small></span>`).join("")}</div>` : ""}
    </div>
    <div class="goal-actions">
      <button class="btn btn-icon btn-ghost" data-action="open-goal-modal" data-id="${goal.id}" aria-label="Edit goal">${icon("edit")}</button>
      <button class="btn btn-icon btn-ghost" data-action="delete-goal" data-id="${goal.id}" aria-label="Delete goal">${icon("trash")}</button>
    </div>
  </li>`;
}

/* ----------------------------- Settings ---------------------------------- */
function settingsPage() {
  Object.keys(DISPLAY_FONTS).forEach(loadDisplayFont);
  const s = state.settings;
  const allDates = Object.keys(state.entries);
  const usage = hoursByCategory(allDates);
  const sample = dateLabel(todayString());

  return `<div class="page settings-page">
    ${pageHead({ title: "Settings" })}

    <section class="setting-group">
      <div class="setting-intro"><h2>Heading typeface</h2><p>Used for page titles and section headings. Times and figures always stay in DM Sans and DM Mono so numbers line up.</p></div>
      <div class="setting-body">
        <div class="specimens" role="radiogroup" aria-label="Heading typeface">
          ${Object.entries(DISPLAY_FONTS)
            .map(
              ([key, font]) => `<label class="specimen ${s.displayFont === key ? "is-active" : ""}" data-font="${key}">
                <input type="radio" name="displayFont" value="${key}" data-setting="displayFont" ${s.displayFont === key ? "checked" : ""} />
                <span class="specimen-sample">${sample}</span>
                <span class="specimen-meta"><b>${font.name}</b> ${font.note}</span>
              </label>`,
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="setting-group">
      <div class="setting-intro"><h2>Appearance</h2><p>System follows your device's light or dark setting.</p></div>
      <div class="setting-body">
        <div class="segmented" role="radiogroup" aria-label="Theme">
          ${[
            ["system", "System"],
            ["light", "Light"],
            ["dark", "Dark"],
          ]
            .map(
              ([value, label]) =>
                `<label><input type="radio" name="theme" value="${value}" data-setting="theme" ${s.theme === value ? "checked" : ""} /><span>${label}</span></label>`,
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="setting-group">
      <div class="setting-intro"><h2>Categories</h2><p>The weight sets how an hour counts toward the daily score: +2 for your best work, −1 for time you'd rather not spend that way.</p></div>
      <div class="setting-body">
        <ul class="category-list">${state.categories
          .map(
            (c) => `<li style="--c:${c.color}">
              <i class="swatch"></i>
              <span class="category-name">${escapeHtml(c.name)}</span>
              <span class="category-weight">${c.weight > 0 ? `+${c.weight}` : c.weight < 0 ? `−${Math.abs(c.weight)}` : "0"}</span>
              <span class="category-usage">${usage[c.id] || 0}h total</span>
              <button class="btn btn-icon btn-ghost" data-action="open-category-modal" data-id="${c.id}" aria-label="Edit ${escapeHtml(c.name)}">${icon("edit")}</button>
            </li>`,
          )
          .join("")}</ul>
        <button class="btn btn-sm" data-action="open-category-modal">${icon("plus")}<span>Add category</span></button>
      </div>
    </section>

    <section class="setting-group">
      <div class="setting-intro"><h2>Calendar</h2></div>
      <div class="setting-body">
        <label class="toggle-row"><span><b>Weeks start on Monday</b><small>${s.weekStartsMonday ? "Monday to Sunday" : "Sunday to Saturday"}</small></span><span class="switch"><input type="checkbox" data-setting="weekStartsMonday" ${s.weekStartsMonday ? "checked" : ""} /><i></i></span></label>
      </div>
    </section>

    <section class="setting-group">
      <div class="setting-intro"><h2>Reminders</h2><p>A browser notification at the top of the hour if the hour that just ended is empty. Works while the app is open in a tab or installed.</p></div>
      <div class="setting-body">
        <label class="toggle-row"><span><b>Remind me to log</b><small>${s.reminder ? "On" : "Off"}${"Notification" in window && Notification.permission === "denied" ? " · notifications are blocked for this site" : ""}</small></span><span class="switch"><input type="checkbox" data-setting="reminder" ${s.reminder ? "checked" : ""} /><i></i></span></label>
        <label class="field-inline">Check
          <select data-setting="reminderMinutes" ${s.reminder ? "" : "disabled"}>
            <option value="60" ${s.reminderMinutes === 60 ? "selected" : ""}>every hour</option>
            <option value="120" ${s.reminderMinutes === 120 ? "selected" : ""}>every 2 hours</option>
            <option value="180" ${s.reminderMinutes === 180 ? "selected" : ""}>every 3 hours</option>
          </select>
        </label>
      </div>
    </section>

    <section class="setting-group">
      <div class="setting-intro"><h2>Your data</h2><p>Everything is stored in this browser only. Export a backup now and then; the CSV opens in any spreadsheet.</p></div>
      <div class="setting-body">
        <div class="button-row">
          <button class="btn" data-action="export-data">${icon("download")}<span>Backup (JSON)</span></button>
          <button class="btn" data-action="export-csv">${icon("download")}<span>Entries (CSV)</span></button>
          <label class="btn">${icon("upload")}<span>Restore backup</span><input type="file" accept="application/json,.json" data-action="import-data" class="sr-only" /></label>
        </div>
        <p class="fine-print">${Object.values(state.entries).reduce((n, d) => n + Object.keys(d).length, 0)} entries across ${allDates.filter((d) => loggedCount(d)).length} days.</p>
        <button class="btn btn-ghost danger-text" data-action="clear-data">Delete all data…</button>
      </div>
    </section>

    ${
      isStandalone
        ? ""
        : `<section class="setting-group">
      <div class="setting-intro"><h2>Install</h2><p>Adds the app to your home screen or dock and lets it open offline.</p></div>
      <div class="setting-body">
        ${
          deferredInstallPrompt
            ? '<button class="btn" data-action="install-pwa">Install The 24 Log</button>'
            : '<p class="fine-print">In Safari on iPhone: Share, then Add to Home Screen. In Chrome or Edge: the install icon in the address bar.</p>'
        }
      </div>
    </section>`
    }
  </div>`;
}

/* ----------------------------- Modals ------------------------------------ */
function modal() {
  const views = {
    "quick-log": quickLogModal,
    "date-picker": datePickerModal,
    goal: goalModal,
    category: categoryModal,
    "confirm-clear": confirmClearModal,
    gaps: gapsModal,
    shortcuts: shortcutsModal,
    score: scoreModal,
  };
  return views[activeModal.type]?.() || "";
}

function modalShell(title, content, { wide = false } = {}) {
  return `<div class="modal-backdrop" data-action="close-modal-backdrop">
    <section class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-head"><h2 id="modal-title">${title}</h2><button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Close">${icon("x")}</button></header>
      ${content}
    </section>
  </div>`;
}

function hourOptions(selected, { from = 0, to = 24, end = false } = {}) {
  return rangeOfHours(from, to)
    .map((h) => {
      const label = end && h === 24 ? "24:00" : formatHour(h);
      return `<option value="${h}" ${h === selected ? "selected" : ""}>${label}</option>`;
    })
    .join("");
}

function defaultQuickHour(date) {
  if (!isToday(date)) return 9;
  // The hour that just ended, if it's still empty; otherwise the current one.
  const now = new Date().getHours();
  return now > 0 && !entryFor(date, now - 1) ? now - 1 : now;
}

function quickLogModal() {
  const date = activeModal.date || selectedDate;
  const start = Number.isInteger(activeModal.hour) ? activeModal.hour : defaultQuickHour(date);
  const end = Number.isInteger(activeModal.end) ? activeModal.end : start + 1;
  const existing = entryFor(date, start);
  return modalShell(
    "Log time",
    `<form class="modal-form" data-form="quick-entry">
      <div class="field-row three">
        <label class="field">Date<input type="date" name="date" value="${date}" required /></label>
        <label class="field">From<select name="hour">${hourOptions(start)}</select></label>
        <label class="field">Until<select name="until">${hourOptions(end, { from: 1, to: 25, end: true })}</select></label>
      </div>
      <div class="field"><span class="field-label">Category</span>${categoryPicker(existing?.categoryId)}</div>
      <label class="field">What did you do?<input name="title" value="${escapeHtml(existing?.title || "")}" placeholder="e.g. Drafted the project proposal" maxlength="140" list="title-suggestions-modal" autocomplete="off" required data-autofocus /></label>
      <label class="field"><span class="field-label">Project <span class="optional">optional</span></span><input name="project" value="${escapeHtml(existing?.project || "")}" placeholder="e.g. Portfolio" maxlength="35" list="project-suggestions-modal" autocomplete="off" /></label>
      <p class="fine-print" data-overwrite-note></p>
      <datalist id="title-suggestions-modal">${suggestions("title").map((t) => `<option value="${escapeHtml(t)}"></option>`).join("")}</datalist>
      <datalist id="project-suggestions-modal">${suggestions("project").map((t) => `<option value="${escapeHtml(t)}"></option>`).join("")}</datalist>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
    </form>`,
  );
}

function datePickerModal() {
  return modalShell(
    "Go to a day",
    `<form class="modal-form" data-form="date-picker">
      <label class="field">Date<input type="date" name="date" value="${selectedDate}" required data-autofocus /></label>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary">Open</button></div>
    </form>`,
  );
}

function goalModal() {
  const goal = state.goals.find((g) => g.id === activeModal.id);
  const g = goal || { categoryId: state.categories[0].id, comparator: "min", target: 6, period: "week", label: "" };
  return modalShell(
    goal ? "Edit goal" : "New goal",
    `<form class="modal-form" data-form="goal" data-id="${goal?.id || ""}">
      <label class="field">Category<select name="categoryId" required>${state.categories
        .map((c) => `<option value="${c.id}" ${c.id === g.categoryId ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
        .join("")}</select></label>
      <div class="field-row">
        <label class="field">Rule<select name="comparator"><option value="min" ${g.comparator === "min" ? "selected" : ""}>At least</option><option value="max" ${g.comparator === "max" ? "selected" : ""}>At most</option></select></label>
        <label class="field">Hours<input type="number" name="target" min="1" max="168" value="${g.target}" required /></label>
        <label class="field">Per<select name="period"><option value="week" ${g.period === "week" ? "selected" : ""}>week</option><option value="day" ${g.period === "day" ? "selected" : ""}>day</option></select></label>
      </div>
      <label class="field"><span class="field-label">Name <span class="optional">optional</span></span><input name="label" maxlength="40" value="${escapeHtml(g.label || "")}" placeholder="Defaults to the category name" /></label>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary">${goal ? "Save" : "Create goal"}</button></div>
    </form>`,
  );
}

function categoryModal() {
  const editing = activeModal.id ? state.categories.find((c) => c.id === activeModal.id) : null;
  const c = editing || { name: "", color: "#3569e8", weight: 0, icon: "" };
  return modalShell(
    editing ? "Edit category" : "New category",
    `<form class="modal-form" data-form="category" data-id="${editing?.id || ""}">
      <label class="field">Name<input name="name" maxlength="24" value="${escapeHtml(c.name)}" placeholder="e.g. Reading" required data-autofocus /></label>
      <div class="field-row">
        <label class="field field-color">Colour<input type="color" name="color" value="${c.color}" /></label>
        <label class="field">Weight<select name="weight">
          <option value="2" ${c.weight === 2 ? "selected" : ""}>+2  best work</option>
          <option value="1" ${c.weight === 1 ? "selected" : ""}>+1  useful</option>
          <option value="0" ${c.weight === 0 ? "selected" : ""}>0  neutral</option>
          <option value="-1" ${c.weight === -1 ? "selected" : ""}>−1  would rather avoid</option>
        </select></label>
      </div>
      <div class="modal-actions">
        ${editing ? `<button type="button" class="btn btn-ghost danger-text push-left" data-action="delete-category" data-id="${editing.id}">Delete</button>` : ""}
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary">${editing ? "Save" : "Add category"}</button>
      </div>
    </form>`,
  );
}

function confirmClearModal() {
  return modalShell(
    "Delete all data?",
    `<div class="modal-copy"><p>This removes every entry, goal, note and custom category stored in this browser. It can't be undone.</p><p>Export a backup first if you might want it later.</p></div>
    <div class="modal-actions"><button class="btn" data-action="export-data">Export backup</button><button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-danger" data-action="confirm-clear">Delete everything</button></div>`,
  );
}

function gapsModal() {
  const gaps = unloggedGaps();
  return modalShell(
    "Unlogged hours today",
    gaps.length
      ? `<ul class="gap-list">${gaps
          .map(
            ([a, b]) =>
              `<li><span class="gap-range">${formatHour(a)} – ${b === 24 ? "24:00" : formatHour(b)}</span><span class="gap-len">${b - a}h</span><button class="btn btn-sm" data-action="log-gap" data-hour="${a}" data-end="${b}">Log</button></li>`,
          )
          .join("")}</ul><p class="fine-print">Logging a range fills every hour in it with the same entry. You can edit single hours afterwards.</p>`
      : '<p class="modal-copy">Every hour so far today has an entry.</p>',
  );
}

function shortcutsModal() {
  const rows = [
    ["<kbd>N</kbd>", "Log time"],
    ["<kbd>T</kbd>", "Go to today"],
    ["<kbd>←</kbd> <kbd>→</kbd>", "Previous or next day"],
    ["<kbd>1</kbd>–<kbd>5</kbd>", "Switch page"],
    ["<kbd>Esc</kbd>", "Close a dialog or cancel an edit"],
    ["<kbd>?</kbd>", "Show this list"],
  ];
  return modalShell(
    "Keyboard shortcuts",
    `<dl class="shortcut-list">${rows.map(([k, d]) => `<div><dt>${k}</dt><dd>${d}</dd></div>`).join("")}</dl>`,
  );
}

function scoreModal() {
  return modalShell(
    "How the score works",
    `<div class="modal-copy">
      <p>Each category has a weight from −1 to +2. The score averages the weights of the hours you logged that day and maps it onto 0–100, where 50 means neutral.</p>
      <ul class="weight-list">${state.categories
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .map((c) => `<li style="--c:${c.color}"><i class="dot"></i>${escapeHtml(c.name)}<span>${c.weight > 0 ? `+${c.weight}` : c.weight < 0 ? `−${Math.abs(c.weight)}` : "0"}</span></li>`)
        .join("")}</ul>
      <p>Unlogged hours don't count either way. Change weights in Settings.</p>
    </div>`,
  );
}

function openModal(type, extra = {}) {
  if (!activeModal) history.pushState({ page: activePage, modal: true }, "", window.location.hash);
  activeModal = { type, ...extra };
  render();
  const focusTarget =
    app.querySelector(".modal [data-autofocus]") ||
    app.querySelector(".modal input, .modal select, .modal button:not([data-action='close-modal'])");
  focusTarget?.focus({ preventScroll: true });
}

function closeModal() {
  const hadModal = Boolean(activeModal);
  activeModal = null;
  render();
  if (hadModal && history.state?.modal) history.back();
}

/* ---------------------------------------------------------------------------
   Toast + undo
--------------------------------------------------------------------------- */
function rememberForUndo() {
  undoSnapshot = JSON.stringify(state);
}
function undo() {
  if (!undoSnapshot) return;
  state = normalizeState(JSON.parse(undoSnapshot));
  undoSnapshot = null;
  saveState();
  render();
  showToast("Undone");
}
function showToast(message, { undoable = false, color = "" } = {}) {
  toastEl.innerHTML = `${color ? `<i class="dot" style="--c:${color}"></i>` : ""}<span>${escapeHtml(message)}</span>${undoable ? '<button type="button" data-toast-undo>Undo</button>' : ""}`;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), undoable ? 6000 : 2800);
}
toastEl.addEventListener("click", (event) => {
  if (event.target.closest("[data-toast-undo]")) {
    toastEl.classList.remove("visible");
    undo();
  }
});

/* ---------------------------------------------------------------------------
   Mutations
--------------------------------------------------------------------------- */
function saveEntry(date, hour, values) {
  if (!state.entries[date]) state.entries[date] = {};
  state.entries[date][hour] = {
    categoryId: values.categoryId,
    title: values.title.trim(),
    project: (values.project || "").trim(),
    updatedAt: new Date().toISOString(),
  };
}

function saveRange(date, start, end, values) {
  const overwritten = rangeOfHours(start, end).filter((h) => h !== start && entryFor(date, h)).length;
  const wasComplete = loggedCount(date) === 24;
  rememberForUndo();
  rangeOfHours(start, end).forEach((h) => saveEntry(date, h, values));
  saveState();
  lastSaved = { date, hours: rangeOfHours(start, end), at: Date.now() };
  const span = end - start;
  const label = span > 1 ? `${formatHour(start)}–${end === 24 ? "24:00" : formatHour(end)}` : formatHour(start);
  const message =
    !wasComplete && loggedCount(date) === 24
      ? "That's all 24 hours. A full ledger!"
      : overwritten
        ? `Saved ${label}, replacing ${plural(overwritten, "entry", "entries")}`
        : `Saved ${label}`;
  showToast(message, { undoable: true, color: categoryFor(values.categoryId)?.color });
}

function removeCategory(id) {
  if (state.categories.length <= 1) {
    showToast("Keep at least one category.");
    return false;
  }
  rememberForUndo();
  const fallback = restCategory()?.id !== id && restCategory() ? restCategory() : state.categories.find((c) => c.id !== id);
  Object.values(state.entries).forEach((day) =>
    Object.values(day).forEach((entry) => {
      if (entry.categoryId === id) entry.categoryId = fallback.id;
    }),
  );
  state.categories = state.categories.filter((c) => c.id !== id);
  state.goals = state.goals.filter((g) => g.categoryId !== id);
  saveState();
  showToast(`Category deleted. Its hours moved to ${fallback.name}.`, { undoable: true });
  return true;
}

/* ---------------------------------------------------------------------------
   Reminders
--------------------------------------------------------------------------- */
function msUntilNextTopOfHour() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 5, 0);
  return next - now;
}

async function onHourEndCheck() {
  const now = new Date();
  const nowHour = now.getHours();
  const every = Math.max(1, Math.round(state.settings.reminderMinutes / 60));
  if (nowHour % every !== 0) return;
  const endedHour = (nowHour - 1 + 24) % 24;
  const date = nowHour === 0 ? shiftDate(todayString(), -1) : todayString();
  const missing = rangeOfHours(0, every)
    .map((i) => (endedHour - i + 24) % 24)
    .filter((h) => !entryFor(date, h));
  if (!missing.length || !("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) {
    render();
    return;
  }
  const body =
    missing.length === 1
      ? `${formatHour(endedHour)}–${formatHour(nowHour)} has no entry yet.`
      : `${plural(missing.length, "hour")} before ${formatHour(nowHour)} have no entry yet.`;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification("The 24 Log", { body, icon: "/icon.svg", tag: "hour-reminder" });
    else new Notification("The 24 Log", { body, icon: "/icon.svg", tag: "hour-reminder" });
  } catch {
    /* notifications unavailable */
  }
}

function startReminder() {
  clearTimeout(reminderTimer);
  if (!state.settings.reminder) return;
  const schedule = () => {
    reminderTimer = setTimeout(() => {
      onHourEndCheck();
      schedule();
    }, msUntilNextTopOfHour());
  };
  schedule();
}

/* ---------------------------------------------------------------------------
   Import / export
--------------------------------------------------------------------------- */
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportData() {
  download(`the-24-log-backup-${todayString()}.json`, JSON.stringify(state, null, 2), "application/json");
  showToast("Backup downloaded");
}

function exportCsv() {
  const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["date", "start", "end", "category", "weight", "title", "project"].join(",")];
  Object.keys(state.entries)
    .sort()
    .forEach((date) =>
      Object.keys(state.entries[date])
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((hour) => {
          const e = state.entries[date][hour];
          const c = categoryFor(e.categoryId);
          rows.push(
            [date, formatHour(hour), hour === 23 ? "24:00" : formatHour(hour + 1), quote(c.name), c.weight, quote(e.title), quote(e.project)].join(","),
          );
        }),
    );
  download(`the-24-log-${todayString()}.csv`, rows.join("\n"), "text/csv");
  showToast(`Exported ${plural(rows.length - 1, "entry", "entries")}`);
}

/* ---------------------------------------------------------------------------
   Events
--------------------------------------------------------------------------- */
function scrollToHour(hour) {
  requestAnimationFrame(() => {
    const row = document.getElementById(`hour-${hour}`);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 80)
      row.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}

function openEditor(hour) {
  editHour = hour;
  render();
  scrollToHour(hour);
  const row = document.getElementById(`hour-${hour}`);
  const firstControl = row?.querySelector("input[name=categoryId]:checked") || row?.querySelector("input[name=categoryId]");
  firstControl?.focus({ preventScroll: true });
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], [data-page]");
  if (!target) return;
  const { action, page } = target.dataset;

  if (page) return navigateToPage(page);

  switch (action) {
    case "open-quick-log": {
      const hour = target.dataset.hour !== undefined ? Number(target.dataset.hour) : undefined;
      return openModal("quick-log", { hour });
    }
    case "log-gap":
      return openModal("quick-log", {
        date: todayString(),
        hour: Number(target.dataset.hour),
        end: Number(target.dataset.end),
      });
    case "open-gaps":
      return openModal("gaps");
    case "open-shortcuts":
      return openModal("shortcuts");
    case "explain-score":
      return openModal("score");
    case "close-modal":
      return closeModal();
    case "close-modal-backdrop":
      if (event.target === target) closeModal();
      return;
    case "show-date-picker":
      return openModal("date-picker");
    case "open-goal-modal":
      return openModal("goal", { id: target.dataset.id });
    case "open-category-modal":
      return openModal("category", { id: target.dataset.id });
    case "shift-date":
      selectedDate = shiftDate(selectedDate, Number(target.dataset.shift));
      editHour = null;
      return render();
    case "shift-week":
      weekAnchor = shiftDate(weekAnchor, Number(target.dataset.shift));
      return render();
    case "this-week":
      weekAnchor = todayString();
      return render();
    case "jump-today":
      if (activeModal) closeModal();
      selectedDate = todayString();
      editHour = null;
      if (activePage === "today") return render();
      return navigateToPage("today", { resetScroll: true });
    case "shift-month": {
      const date = parseDate(calendarMonth);
      date.setDate(1);
      date.setMonth(date.getMonth() + Number(target.dataset.shift));
      calendarMonth = localDateString(date).slice(0, 8) + "01";
      return render();
    }
    case "current-month":
      calendarMonth = todayString().slice(0, 8) + "01";
      return render();
    case "select-date":
      selectedDate = target.dataset.date;
      editHour = null;
      if (activePage === "today") return render();
      return navigateToPage("today", { resetScroll: true });
    case "edit-hour":
    case "jump-hour":
      return openEditor(Number(target.dataset.hour));
    case "cancel-edit":
      editHour = null;
      return render();
    case "clear-hour": {
      const hour = Number(target.dataset.hour);
      rememberForUndo();
      delete state.entries[selectedDate]?.[hour];
      if (state.entries[selectedDate] && !Object.keys(state.entries[selectedDate]).length)
        delete state.entries[selectedDate];
      saveState();
      editHour = null;
      render();
      return showToast(`Cleared ${formatHour(hour)}`, { undoable: true });
    }
    case "repeat-prev": {
      const hour = Number(target.dataset.hour);
      const prev = entryFor(selectedDate, hour - 1);
      if (!prev) return;
      rememberForUndo();
      saveEntry(selectedDate, hour, prev);
      saveState();
      lastSaved = { date: selectedDate, hours: [hour], at: Date.now() };
      render();
      return showToast(`Copied ${formatHour(hour - 1)} into ${formatHour(hour)}`, { undoable: true });
    }
    case "fill-rest": {
      const rest = restCategory();
      if (!rest) return;
      const empty = rangeOfHours(0, 8).filter((h) => !entryFor(selectedDate, h));
      if (!empty.length) return;
      rememberForUndo();
      empty.forEach((h) => saveEntry(selectedDate, h, { categoryId: rest.id, title: "Sleep", project: "" }));
      saveState();
      lastSaved = { date: selectedDate, hours: empty, at: Date.now() };
      render();
      return showToast(`Marked ${plural(empty.length, "hour")} as sleep`, { undoable: true });
    }
    case "delete-goal":
      rememberForUndo();
      state.goals = state.goals.filter((g) => g.id !== target.dataset.id);
      saveState();
      render();
      return showToast("Goal deleted", { undoable: true });
    case "delete-category":
      if (removeCategory(target.dataset.id)) {
        activeModal = null;
        render();
        if (history.state?.modal) history.back();
      }
      return;
    case "export-data":
      return exportData();
    case "export-csv":
      return exportCsv();
    case "clear-data":
      return openModal("confirm-clear");
    case "confirm-clear":
      state = structuredClone(defaultState);
      undoSnapshot = null;
      saveState();
      selectedDate = todayString();
      closeModal();
      startReminder();
      return showToast("All data deleted");
    case "install-pwa":
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.finally(() => {
        deferredInstallPrompt = null;
        render();
      });
      return;
    default:
  }
});

app.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));

  switch (form.dataset.form) {
    case "entry": {
      if (!data.categoryId) return showToast("Pick a category first");
      const start = Number(form.dataset.hour);
      const end = Math.max(start + 1, Number(data.until) || start + 1);
      saveRange(selectedDate, start, end, data);
      editHour = null;
      return render();
    }
    case "quick-entry": {
      if (!data.categoryId) return showToast("Pick a category first");
      const start = Number(data.hour);
      const end = Number(data.until);
      if (end <= start) return showToast("The end time needs to be after the start");
      const fromModalEntry = Boolean(history.state?.modal);
      activeModal = null;
      selectedDate = data.date;
      editHour = null;
      saveRange(data.date, start, end, data);
      if (activePage !== "today") {
        navigateToPage("today", { resetScroll: true, force: true, replace: fromModalEntry });
      } else {
        render();
        if (fromModalEntry) history.back();
      }
      return scrollToHour(start);
    }
    case "date-picker":
      selectedDate = data.date;
      editHour = null;
      return closeModal();
    case "goal": {
      const category = categoryFor(data.categoryId);
      const goal = {
        id: form.dataset.id || `${data.categoryId}-${Date.now()}`,
        label: (data.label || "").trim() || category.name,
        categoryId: data.categoryId,
        target: Math.max(1, Number(data.target) || 1),
        period: data.period,
        comparator: data.comparator,
      };
      const index = state.goals.findIndex((g) => g.id === goal.id);
      if (index >= 0) state.goals[index] = goal;
      else state.goals.push(goal);
      saveState();
      closeModal();
      return showToast(index >= 0 ? "Goal updated" : "Goal created");
    }
    case "category": {
      const name = data.name.trim();
      if (!name) return;
      let id = form.dataset.id;
      if (!id) {
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "category";
        id = base;
        let n = 2;
        while (state.categories.some((c) => c.id === id)) id = `${base}-${n++}`;
      }
      const existing = state.categories.find((c) => c.id === id);
      const category = { ...(existing || { icon: "" }), id, name, color: data.color, weight: Number(data.weight) };
      if (existing) state.categories[state.categories.indexOf(existing)] = category;
      else state.categories.push(category);
      saveState();
      closeModal();
      return showToast(existing ? "Category updated" : "Category added");
    }
    default:
  }
});

app.addEventListener("input", (event) => {
  const el = event.target;
  if (el.matches?.("textarea[data-note]")) {
    const status = app.querySelector("[data-note-status]");
    if (status) status.textContent = "Saving…";
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => {
      const value = el.value.trim();
      if (value) state.reflections[el.dataset.note] = value;
      else delete state.reflections[el.dataset.note];
      saveState();
      if (status) status.textContent = value ? "Saved" : "Saves as you type";
    }, 450);
  }
});

app.addEventListener("change", async (event) => {
  const input = event.target;

  // Keep the quick-log range valid while the user edits it.
  const quickForm = input.closest?.('[data-form="quick-entry"]');
  if (quickForm && (input.name === "hour" || input.name === "until" || input.name === "date")) {
    const start = Number(quickForm.hour.value);
    if (input.name === "hour" && Number(quickForm.until.value) <= start) quickForm.until.value = String(start + 1);
    if (input.name === "until" && Number(quickForm.until.value) <= start) quickForm.hour.value = String(Number(quickForm.until.value) - 1);
    const s = Number(quickForm.hour.value);
    const e = Number(quickForm.until.value);
    const taken = rangeOfHours(s, e).filter((h) => entryFor(quickForm.date.value, h)).length;
    const note = quickForm.querySelector("[data-overwrite-note]");
    if (note) note.textContent = taken ? `${plural(taken, "hour")} in this range already ${taken === 1 ? "has an entry" : "have entries"} and will be replaced.` : "";
    return;
  }

  if (input.dataset.setting) {
    const key = input.dataset.setting;
    if (key === "reminder") {
      if (input.checked && "Notification" in window && Notification.permission === "default")
        await Notification.requestPermission();
      const allowed = "Notification" in window && Notification.permission === "granted";
      state.settings.reminder = input.checked && allowed;
      if (input.checked && !allowed) showToast("Notifications are blocked for this site, so reminders can't be sent");
    } else if (input.type === "checkbox") {
      state.settings[key] = input.checked;
    } else if (key === "reminderMinutes") {
      state.settings[key] = Number(input.value);
    } else {
      state.settings[key] = input.value;
    }
    saveState();
    startReminder();
    render();
    return;
  }

  if (input.dataset.action === "import-data" && input.files?.[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported || typeof imported.entries !== "object" || !Array.isArray(imported.categories))
          throw new Error("shape");
        rememberForUndo();
        state = normalizeState(imported);
        saveState();
        startReminder();
        render();
        showToast("Backup restored", { undoable: true });
      } catch {
        showToast("That file isn't a 24 Log backup");
      }
    };
    reader.readAsText(input.files[0]);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (activeModal) {
      event.preventDefault();
      return closeModal();
    }
    if (editHour !== null) {
      const hour = editHour;
      editHour = null;
      render();
      document.querySelector(`#hour-${hour} .hour-body`)?.focus({ preventScroll: true });
      return;
    }
  }
  const typing = event.target.closest?.("input, textarea, select, [contenteditable]");
  if (typing || event.metaKey || event.ctrlKey || event.altKey || activeModal) return;

  const key = event.key;
  if (key === "n" || key === "N") {
    event.preventDefault();
    return openModal("quick-log");
  }
  if (key === "?") return openModal("shortcuts");
  if (key === "t" || key === "T") {
    selectedDate = todayString();
    editHour = null;
    return activePage === "today" ? render() : navigateToPage("today", { resetScroll: true });
  }
  if (/^[1-5]$/.test(key)) return navigateToPage(VALID_PAGES[Number(key) - 1]);
  if (activePage === "today" && (key === "ArrowLeft" || key === "ArrowRight") && editHour === null) {
    selectedDate = shiftDate(selectedDate, key === "ArrowLeft" ? -1 : 1);
    return render();
  }
});

window.addEventListener("popstate", () => {
  if (activeModal) {
    activeModal = null;
    render();
    return;
  }
  const targetPage = getPageFromHash();
  if (activePage !== targetPage) navigateToPage(targetPage, { skipHistory: true });
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (activePage === "settings") render();
});

// Re-render at the top of each hour so "now" moves and gaps update.
function scheduleHourTick() {
  setTimeout(() => {
    if (!activeModal && editHour === null && !document.activeElement?.matches?.("textarea, input")) render();
    scheduleHourTick();
  }, msUntilNextTopOfHour());
}

activePage = getPageFromHash();
history.replaceState({ page: activePage }, "", `#${activePage}`);
startReminder();
scheduleHourTick();
render();
