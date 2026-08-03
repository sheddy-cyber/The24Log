const STORAGE_KEY = 'the24log:v1';

const defaultCategories = [
  { id: 'deep-work', name: 'Deep work', color: '#3569e8', weight: 2, icon: '✦' },
  { id: 'work', name: 'Work', color: '#7d58d8', weight: 1, icon: '▣' },
  { id: 'learning', name: 'Learning', color: '#17a38a', weight: 1, icon: '↗' },
  { id: 'exercise', name: 'Exercise', color: '#e36b4b', weight: 1, icon: '◒' },
  { id: 'life', name: 'Life admin', color: '#e3a840', weight: 0, icon: '□' },
  { id: 'social', name: 'Social', color: '#d75d89', weight: 0, icon: '○' },
  { id: 'rest', name: 'Rest', color: '#8795a8', weight: 0, icon: '☾' },
  { id: 'unplanned', name: 'Unplanned', color: '#e04e5e', weight: -1, icon: '!' }
];

const defaultState = {
  entries: {},
  categories: defaultCategories,
  goals: [
    { id: 'deep-work-weekly', label: 'Deep work', categoryId: 'deep-work', target: 12, period: 'week', comparator: 'min' },
    { id: 'unplanned-daily', label: 'Unplanned time', categoryId: 'unplanned', target: 2, period: 'day', comparator: 'max' }
  ],
  reflections: {},
  settings: { reminder: false, reminderMinutes: 60, weekStartsMonday: true }
};

let state = loadState();
let activePage = 'today';
let selectedDate = localDateString(new Date());
let editHour = null;
let activeModal = null;
let toastTimer;
let reminderTimer;

const app = document.querySelector('#app');

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || typeof parsed !== 'object') return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      categories: parsed.categories?.length ? parsed.categories : structuredClone(defaultCategories),
      entries: parsed.entries || {},
      reflections: parsed.reflections || {},
      settings: { ...defaultState.settings, ...parsed.settings }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function localDateString(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function parseDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function shiftDate(dateString, days) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function dateLabel(dateString, options = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return parseDate(dateString).toLocaleDateString('en-GB', options);
}

function isToday(dateString) { return dateString === localDateString(new Date()); }

function getDayEntries(date = selectedDate) {
  return state.entries[date] || {};
}

function categoryFor(id) {
  return state.categories.find(category => category.id === id) || state.categories[0];
}

function entryFor(date, hour) {
  return state.entries[date]?.[hour] || null;
}

function loggedCount(date) { return Object.keys(getDayEntries(date)).length; }

function hoursByCategory(dates) {
  const totals = Object.fromEntries(state.categories.map(category => [category.id, 0]));
  dates.forEach(date => Object.values(getDayEntries(date)).forEach(entry => {
    if (entry.categoryId in totals) totals[entry.categoryId] += 1;
  }));
  return totals;
}

function productivityScore(date) {
  const entries = Object.values(getDayEntries(date));
  if (!entries.length) return null;
  const weighted = entries.reduce((sum, entry) => sum + (categoryFor(entry.categoryId)?.weight ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round(50 + (weighted / entries.length) * 25)));
}

function weekDates(anchor = selectedDate) {
  const date = parseDate(anchor);
  const day = date.getDay();
  const offset = state.settings.weekStartsMonday ? (day + 6) % 7 : day;
  date.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => localDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + index)));
}

function getStreak() {
  let date = localDateString(new Date());
  let streak = 0;
  for (let index = 0; index < 365; index += 1) {
    if (loggedCount(date) >= 18) { streak += 1; date = shiftDate(date, -1); }
    else if (index === 0) date = shiftDate(date, -1);
    else break;
  }
  return streak;
}

function rangeOfHours(start, end) {
  return Array.from({ length: end - start }, (_, index) => start + index);
}

function icon(name) {
  const icons = {
    today: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M8 13h3m2 0h3m-8 3h3"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3.5 2"/></svg>',
    insights: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5m0 14h16M8 16v-4m4 4V7m4 9v-7"/></svg>',
    goals: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m15 9 5-5"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5.3v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
  };
  return icons[name] || '';
}

function render() {
  app.innerHTML = `
    <div class="app-shell">
      ${sidebar()}
      <main class="main-content">
        <header class="mobile-top"><button class="icon-button" data-action="toggle-sidebar" aria-label="Open navigation">☰</button><span class="wordmark">THE <b>24</b> LOG</span><button class="icon-button" data-action="open-quick-log" aria-label="Add entry">${icon('plus')}</button></header>
        ${activePage === 'today' ? todayPage() : ''}
        ${activePage === 'history' ? historyPage() : ''}
        ${activePage === 'insights' ? insightsPage() : ''}
        ${activePage === 'goals' ? goalsPage() : ''}
        ${activePage === 'settings' ? settingsPage() : ''}
      </main>
    </div>
    <div class="modal-root">${activeModal ? modal() : ''}</div>
    <div id="toast" class="toast" role="status"></div>
  `;
}

function sidebar() {
  const nav = [
    ['today', 'Today'], ['history', 'History'], ['insights', 'Insights'], ['goals', 'Goals'], ['settings', 'Settings']
  ];
  return `<aside class="sidebar" id="sidebar">
    <div class="brand"><span class="brand-mark">24</span><span>THE <strong>24</strong> LOG</span></div>
    <button class="quick-log" data-action="open-quick-log">${icon('plus')} Quick log</button>
    <nav>${nav.map(([page, label]) => `<button class="nav-link ${activePage === page ? 'active' : ''}" data-page="${page}">${icon(page)}<span>${label}</span></button>`).join('')}</nav>
    <div class="sidebar-bottom">
      <div class="streak-card"><span class="flame">♨</span><div><strong>${getStreak()} day streak</strong><small>18+ hours logged</small></div></div>
      <p>Your time is your life.<br/>Spend it on purpose.</p>
    </div>
  </aside>`;
}

function pageHeading(eyebrow, title, description, action = '') {
  return `<section class="page-header"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subheading">${description}</p></div>${action}</section>`;
}

function todayPage() {
  const score = productivityScore(selectedDate);
  const logged = loggedCount(selectedDate);
  const completePercent = Math.round((logged / 24) * 100);
  const todayStr = localDateString(new Date());
  const isCurrentToday = selectedDate === todayStr;
  const isFutureDate = selectedDate > todayStr;

  const eyebrow = isCurrentToday ? 'YOUR DAILY LEDGER' : isFutureDate ? 'FUTURE DAILY LEDGER' : 'PAST DAILY LEDGER';
  const headingTitle = isCurrentToday 
    ? currentGreeting() 
    : selectedDate === shiftDate(todayStr, 1) 
      ? 'Tomorrow' 
      : selectedDate === shiftDate(todayStr, -1) 
        ? 'Yesterday' 
        : dateLabel(selectedDate, { weekday: 'long', month: 'short', day: 'numeric' });

  const headingDesc = isCurrentToday 
    ? 'Log what happened. Notice what matters.' 
    : isFutureDate 
      ? `Plan ahead and outline targets for ${dateLabel(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' })}.` 
      : `Review and update ${dateLabel(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' })}.`;

  const headerAction = isCurrentToday 
    ? '<button class="button secondary" disabled style="opacity: 0.65; cursor: default;">Today</button>' 
    : '<button class="button primary" data-action="jump-today">↵ Return to Today</button>';

  return `
    <div class="page-wrap today-page">
      ${pageHeading(eyebrow, headingTitle, headingDesc, headerAction)}
      <section class="day-control">
        <div class="date-switcher"><button class="icon-button" data-action="shift-date" data-shift="-1" aria-label="Previous day">‹</button><button class="date-current" data-action="show-date-picker"><span>${dateLabel(selectedDate, { weekday: 'short' })}</span><strong>${dateLabel(selectedDate, { month: 'short', day: 'numeric' })}</strong></button><button class="icon-button" data-action="shift-date" data-shift="1" aria-label="Next day">›</button></div>
        <div class="day-meter"><div><strong>${logged}<span>/24</span></strong><small>hours logged</small></div><div class="progress-track"><i style="width:${completePercent}%"></i></div><span>${completePercent}% complete</span></div>
      </section>
      <section class="summary-grid">
        ${metricCard('Logged', `${logged}h`, logged ? `${24 - logged} still open` : 'Start with one hour', 'clock')}
        ${metricCard('Productivity', score === null ? '—' : `${score}`, score === null ? 'Log hours to calculate' : score >= 70 ? 'Strong use of time' : score >= 50 ? 'Room to improve' : 'Reset your next hour', 'score')}
        ${metricCard('Unplanned', `${hoursByCategory([selectedDate])['unplanned'] || 0}h`, goalTextFor('unplanned', 'day'), 'unplanned')}
        ${metricCard('Top focus', getTopCategory([selectedDate]), 'Your most logged category', 'focus')}
      </section>
      <section class="ledger-section">
        <div class="section-heading"><div><h2>Your 24 hours</h2><p>Keep it honest. A complete day tells the clearest story.</p></div><button class="text-button" data-action="fill-rest">Mark empty sleep hours</button></div>
        <div class="timeline">${rangeOfHours(0, 24).map(hour => hourRow(hour)).join('')}</div>
      </section>
      ${reflectionCard()}
    </div>`;
}

function metricCard(label, value, caption, type) {
  const symbol = { clock: '◷', score: '✦', unplanned: '↯', focus: '◎' }[type];
  return `<article class="metric-card metric-${type}"><span class="metric-symbol">${symbol}</span><div><p>${label}</p><strong>${value}</strong><small>${caption}</small></div></article>`;
}

function getTopCategory(dates) {
  const totals = hoursByCategory(dates);
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  return top?.[1] ? categoryFor(top[0]).name : '—';
}

function goalTextFor(categoryId, period) {
  const goal = state.goals.find(item => item.categoryId === categoryId && item.period === period);
  if (!goal) return 'No target set';
  const total = hoursByCategory(period === 'week' ? weekDates() : [selectedDate])[categoryId] || 0;
  return goal.comparator === 'max' ? `${total}h of ${goal.target}h target` : `${total}h of ${goal.target}h target`;
}

function hourRow(hour) {
  const entry = entryFor(selectedDate, hour);
  const current = isToday(selectedDate) && new Date().getHours() === hour;
  const label = formatHour(hour);
  if (!entry || editHour === hour) {
    return `<article class="hour-row ${current ? 'current-hour' : ''} ${editHour === hour ? 'editing' : ''}">
      <div class="hour-label"><strong>${label}</strong><small>${formatHour((hour + 1) % 24)}</small></div>
      <form class="entry-form" data-form="entry" data-hour="${hour}">
        <label class="category-select"><select name="categoryId" aria-label="Category"><option value="">Choose a category</option>${state.categories.map(category => `<option value="${category.id}" ${entry?.categoryId === category.id ? 'selected' : ''}>${category.icon} ${category.name}</option>`).join('')}</select></label>
        <input name="title" maxlength="70" placeholder="What did you do?" value="${escapeHtml(entry?.title || '')}" aria-label="What did you do?" required />
        <input name="project" maxlength="35" placeholder="Project (optional)" value="${escapeHtml(entry?.project || '')}" aria-label="Project tag" />
        <button class="save-entry" type="submit">Save</button>
      </form>
    </article>`;
  }
  const category = categoryFor(entry.categoryId);
  return `<article class="hour-row logged ${current ? 'current-hour' : ''}" style="--entry-color:${category.color}">
    <div class="hour-label"><strong>${label}</strong><small>${formatHour((hour + 1) % 24)}</small></div>
    <button class="entry-display" data-action="edit-hour" data-hour="${hour}"><span class="category-dot"></span><div><strong>${escapeHtml(entry.title)}</strong>${entry.project ? `<small>${escapeHtml(entry.project)}</small>` : ''}</div><span class="category-chip">${category.name}</span></button>
    <button class="more-button" data-action="edit-hour" data-hour="${hour}" aria-label="Edit ${label}">${icon('more')}</button>
  </article>`;
}

function reflectionCard() {
  const reflection = state.reflections[selectedDate] || '';
  return `<section class="reflection-card"><div class="reflection-icon">${icon('spark')}</div><div><p class="eyebrow">DAILY REFLECTION</p><h2>What would make tomorrow feel better?</h2><p>Turn the ledger into a small, useful promise to yourself.</p></div><textarea data-reflection="${selectedDate}" maxlength="300" placeholder="One thing I noticed today...">${escapeHtml(reflection)}</textarea><span class="saved-indicator">${reflection ? 'Saved' : 'Private to you'}</span></section>`;
}

function historyPage() {
  const shown = parseDate(selectedDate);
  const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
  const startDay = state.settings.weekStartsMonday ? (first.getDay() + 6) % 7 : first.getDay();
  const daysInMonth = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: startDay + daysInMonth }, (_, index) => index < startDay ? null : index - startDay + 1);
  const completedDays = Array.from({ length: daysInMonth }, (_, index) => localDateString(new Date(shown.getFullYear(), shown.getMonth(), index + 1))).filter(date => loggedCount(date) >= 18).length;
  return `<div class="page-wrap">
    ${pageHeading('LOOK BACK', 'Your history', 'Patterns are easier to see when the days are side by side.', '<button class="button primary" data-action="jump-today">Open today</button>')}
    <section class="history-layout">
      <article class="calendar-card card">
        <div class="calendar-head"><button class="icon-button" data-action="shift-month" data-shift="-1">‹</button><h2>${shown.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2><button class="icon-button" data-action="shift-month" data-shift="1">›</button></div>
        <div class="weekday-labels">${(state.settings.weekStartsMonday ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']).map(day => `<span>${day}</span>`).join('')}</div>
        <div class="calendar-grid">${days.map(day => calendarDay(day, shown)).join('')}</div>
        <div class="calendar-legend"><span><i class="legend-dot logged-dot"></i>18+ hours logged</span><span><i class="legend-dot partial-dot"></i>Partially logged</span><span><i class="legend-dot empty-dot"></i>Not started</span></div>
      </article>
      <aside class="history-side">
        <article class="card stat-feature"><span class="feature-number">${completedDays}</span><p>intentional days<br/>this month</p><div class="mini-ring" style="--ring:${Math.round((completedDays / new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate()) * 100)}%"><span>♨</span></div></article>
        <article class="card weekly-note"><p class="eyebrow">WEEKLY VIEW</p><h3>How did this week feel?</h3><div class="week-strip">${weekDates().map(date => dayStrip(date)).join('')}</div><button class="text-button" data-page="insights">See week insights ${icon('chevron')}</button></article>
      </aside>
    </section>
    <section class="card history-list"><div class="section-heading"><div><h2>Recent days</h2><p>Jump into any day to add detail or review your story.</p></div></div>${Array.from({ length: 7 }, (_, index) => recentDayRow(shiftDate(localDateString(new Date()), -index))).join('')}</section>
  </div>`;
}

function calendarDay(day, shown) {
  if (!day) return '<span class="calendar-blank"></span>';
  const date = localDateString(new Date(shown.getFullYear(), shown.getMonth(), day));
  const logged = loggedCount(date);
  const fills = Object.values(getDayEntries(date)).slice(0, 7).map(entry => `<i style="background:${categoryFor(entry.categoryId).color}"></i>`).join('');
  return `<button class="calendar-day ${isToday(date) ? 'today' : ''} ${date === selectedDate ? 'selected' : ''}" data-action="select-date" data-date="${date}"><strong>${day}</strong><span class="day-fills">${fills || '<i class="no-fill"></i>'}</span><small>${logged ? `${logged}h` : ''}</small></button>`;
}

function dayStrip(date) {
  const day = parseDate(date);
  const score = productivityScore(date);
  return `<button data-action="select-date" data-date="${date}" class="week-day ${date === selectedDate ? 'selected' : ''}"><small>${day.toLocaleDateString('en-GB', { weekday: 'narrow' })}</small><span class="week-bar" style="--height:${Math.max(10, (loggedCount(date) / 24) * 100)}%; --color:${score === null ? '#dce1ea' : score >= 70 ? '#16a082' : score >= 50 ? '#e5a53b' : '#dc5967'}"></span><b>${day.getDate()}</b></button>`;
}

function recentDayRow(date) {
  const totals = hoursByCategory([date]);
  const leading = Object.entries(totals).filter(([, value]) => value).sort((a,b) => b[1] - a[1]).slice(0,3);
  const score = productivityScore(date);
  return `<button class="recent-day" data-action="select-date" data-date="${date}"><div><strong>${isToday(date) ? 'Today' : dateLabel(date, { weekday: 'long' })}</strong><small>${dateLabel(date, { month: 'short', day: 'numeric' })}</small></div><div class="recent-categories">${leading.length ? leading.map(([id, amount]) => `<span style="--chip:${categoryFor(id).color}">${categoryFor(id).name} <b>${amount}h</b></span>`).join('') : '<span class="muted">No hours logged yet</span>'}</div><div class="recent-score ${score === null ? '' : score >= 70 ? 'good' : score >= 50 ? 'okay' : 'low'}">${score === null ? '—' : score}<small>score</small></div>${icon('chevron')}</button>`;
}

function insightsPage() {
  const week = weekDates();
  const totals = hoursByCategory(week);
  const totalLogged = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  const scores = week.map(date => ({ date, score: productivityScore(date), count: loggedCount(date) }));
  const averageScore = scores.filter(item => item.score !== null).reduce((sum, item, _, all) => sum + item.score / all.length, 0);
  return `<div class="page-wrap">
    ${pageHeading('MAKE THE PATTERNS USEFUL', 'Your insights', 'A calm look at how your time has actually been spent.')}
    <section class="insight-topline"><article class="score-hero card"><div><p class="eyebrow">THIS WEEK</p><h2>${totalLogged}<span>h logged</span></h2><p>${totalLogged ? `${Math.round((totalLogged / 168) * 100)}% of your week accounted for` : 'Begin logging to uncover your patterns.'}</p></div><div class="score-badge"><b>${Number.isNaN(averageScore) ? '—' : Math.round(averageScore)}</b><span>avg score</span></div></article>${goalProgressCards()}</section>
    <section class="insights-grid">
      <article class="card bar-chart-card"><div class="section-heading"><div><p class="eyebrow">WEEK AT A GLANCE</p><h2>Productivity rhythm</h2></div><span class="chart-legend"><i></i>Daily score</span></div><div class="bar-chart">${scores.map(item => scoreBar(item)).join('')}</div><div class="chart-axis"><span>0</span><span>50</span><span>100</span></div></article>
      <article class="card category-card"><div class="section-heading"><div><p class="eyebrow">TIME ALLOCATION</p><h2>Where your hours went</h2></div></div><div class="category-list">${categoryBreakdown(totals, totalLogged)}</div></article>
      <article class="card heatmap-card"><div class="section-heading"><div><p class="eyebrow">HOUR BY HOUR</p><h2>Your weekly rhythm</h2></div><span class="small-note">More productive →</span></div>${heatmap(week)}</article>
      <article class="card insight-note"><div class="note-icon">${icon('spark')}</div><div><p class="eyebrow">A GENTLE NUDGE</p><h2>${insightHeadline(week)}</h2><p>${insightCopy(week)}</p></div><button class="text-button" data-page="today">Log an hour ${icon('chevron')}</button></article>
    </section>
  </div>`;
}

function goalProgressCards() {
  const goals = state.goals.slice(0, 2);
  if (!goals.length) return '<article class="goal-empty card"><p>No goals yet</p><button class="text-button" data-page="goals">Set one now</button></article>';
  return goals.map(goal => {
    const amount = hoursByCategory(goal.period === 'week' ? weekDates() : [selectedDate])[goal.categoryId] || 0;
    const percent = Math.min(100, Math.round((amount / goal.target) * 100));
    const hit = goal.comparator === 'min' ? amount >= goal.target : amount <= goal.target;
    return `<article class="goal-mini card"><div><span class="goal-color" style="background:${categoryFor(goal.categoryId).color}"></span><p>${goal.comparator === 'max' ? `Stay below ${goal.target}h` : `${goal.target}h ${goal.period} target`}</p><strong>${goal.label}</strong></div><div class="goal-meter ${hit ? 'hit' : ''}" style="--progress:${percent}%"><span>${amount}h</span></div></article>`;
  }).join('');
}

function scoreBar({ date, score, count }) {
  const day = parseDate(date).toLocaleDateString('en-GB', { weekday: 'short' });
  const height = score === null ? 4 : Math.max(8, score);
  const color = score === null ? '#d9dfea' : score >= 70 ? '#2b9f86' : score >= 50 ? '#e4a43d' : '#dc5967';
  return `<button class="score-bar" data-action="select-date" data-date="${date}" title="${date}: ${score ?? 'No'} score"><span class="bar-value">${score ?? ''}</span><i style="height:${height}%;background:${color}"></i><small>${day}</small><em>${count}h</em></button>`;
}

function categoryBreakdown(totals, total) {
  const entries = Object.entries(totals).filter(([, amount]) => amount).sort((a,b) => b[1] - a[1]);
  if (!entries.length) return '<p class="empty-state">No logged time yet this week.</p>';
  return entries.map(([id, amount]) => {
    const category = categoryFor(id);
    return `<div class="category-breakdown"><span style="background:${category.color}"></span><strong>${category.name}</strong><div class="breakdown-track"><i style="width:${(amount / total) * 100}%;background:${category.color}"></i></div><b>${amount}h</b><small>${Math.round((amount / total) * 100)}%</small></div>`;
  }).join('');
}

function heatmap(week) {
  const labels = [0, 3, 6, 9, 12, 15, 18, 21];
  const cells = week.map(date => `<div class="heatmap-row"><small>${parseDate(date).toLocaleDateString('en-GB', { weekday: 'short' })}</small>${rangeOfHours(0,24).map(hour => heatCell(date, hour)).join('')}</div>`).join('');
  return `<div class="heatmap-wrap"><div class="heatmap-hours"><span></span>${rangeOfHours(0,24).map(hour => `<i>${labels.includes(hour) ? `${hour}` : ''}</i>`).join('')}</div>${cells}</div>`;
}

function heatCell(date, hour) {
  const entry = entryFor(date, hour);
  const category = entry ? categoryFor(entry.categoryId) : null;
  const opacity = category ? category.weight >= 1 ? 1 : category.weight === 0 ? .53 : .9 : .08;
  return `<button data-action="select-date" data-date="${date}" title="${date}, ${formatHour(hour)}: ${entry ? `${entry.title} (${category.name})` : 'not logged'}" style="--heat:${category ? category.color : '#b8c1cf'};--heat-opacity:${opacity}"></button>`;
}

function insightHeadline(week) {
  const totals = hoursByCategory(week);
  const unplanned = totals.unplanned || 0;
  const productive = (totals['deep-work'] || 0) + (totals.learning || 0) + (totals.work || 0);
  if (!Object.values(totals).some(Boolean)) return 'Your first pattern is one honest hour away.';
  if (unplanned > productive) return 'Your unplanned time is asking for a little guardrail.';
  if ((totals['deep-work'] || 0) >= 6) return 'You’re protecting meaningful focus this week.';
  return 'Consistency is already giving your week a shape.';
}

function insightCopy(week) {
  const totals = hoursByCategory(week);
  const unplanned = totals.unplanned || 0;
  if (!Object.values(totals).some(Boolean)) return 'No need to reconstruct everything at once. Start with the current hour, then backfill when you can.';
  if (unplanned >= 3) return `You’ve logged ${unplanned}h as unplanned. Try choosing one small intention before the next open hour begins.`;
  return 'Keep giving each hour a name. The small act of noticing makes tomorrow easier to shape.';
}

function goalsPage() {
  return `<div class="page-wrap">
    ${pageHeading('DIRECTION, NOT PRESSURE', 'Your goals', 'Set a few clear guardrails for the time you want to protect.', `<button class="button primary" data-action="open-goal-modal">${icon('plus')} New goal</button>`)}
    <section class="goals-overview"><article class="card goals-quote"><div class="quote-mark">“</div><h2>A goal isn’t a verdict.<br/>It’s a compass.</h2><p>Use these targets to make your trade-offs visible—not to make yourself feel guilty.</p></article><article class="card target-summary"><p class="eyebrow">CURRENT WEEK</p><h2>${state.goals.length ? `${state.goals.filter(goal => goalIsHit(goal)).length} of ${state.goals.length}` : 'No'} <span>targets on track</span></h2><div class="target-dots">${state.goals.map(goal => `<i class="${goalIsHit(goal) ? 'hit' : ''}"></i>`).join('')}</div></article></section>
    <section class="goals-list">${state.goals.length ? state.goals.map(goalCard).join('') : emptyGoals()}</section>
  </div>`;
}

function goalIsHit(goal) {
  const dates = goal.period === 'week' ? weekDates() : [selectedDate];
  const amount = hoursByCategory(dates)[goal.categoryId] || 0;
  return goal.comparator === 'max' ? amount <= goal.target : amount >= goal.target;
}

function goalCard(goal) {
  const dates = goal.period === 'week' ? weekDates() : [selectedDate];
  const amount = hoursByCategory(dates)[goal.categoryId] || 0;
  const progress = Math.min(100, Math.round((amount / goal.target) * 100));
  const category = categoryFor(goal.categoryId);
  const isMax = goal.comparator === 'max';
  const hit = goalIsHit(goal);
  return `<article class="goal-card card ${hit ? 'goal-hit' : ''}" style="--goal:${category.color}"><div class="goal-main"><span class="goal-icon">${category.icon}</span><div><p>${goal.period === 'week' ? 'WEEKLY TARGET' : 'DAILY TARGET'}</p><h2>${isMax ? 'Keep' : 'Spend'} <strong>${goal.target} hours ${isMax ? 'or less' : ''}</strong> on ${goal.label}</h2><small>${isMax ? `${amount}h logged · ${Math.max(0, goal.target - amount)}h remaining before limit` : `${amount}h logged · ${Math.max(0, goal.target - amount)}h to go`}</small></div></div><div class="goal-progress"><div class="goal-progress-track"><i style="width:${progress}%"></i></div><strong>${amount}<span> / ${goal.target}h</span></strong></div><div class="goal-actions"><span class="goal-status">${hit ? 'On track' : isMax ? 'Over target' : 'In progress'}</span><button class="icon-button" data-action="delete-goal" data-id="${goal.id}" aria-label="Delete goal">×</button></div></article>`;
}

function emptyGoals() { return '<article class="card empty-goals"><span>◎</span><h2>Give your time a direction.</h2><p>Choose one category and one achievable target to begin.</p><button class="button primary" data-action="open-goal-modal">Create your first goal</button></article>'; }

function settingsPage() {
  return `<div class="page-wrap settings-page">
    ${pageHeading('MAKE IT YOURS', 'Settings', 'Set up the small details that make the ledger easy to keep.')}
    <section class="settings-layout">
      <article class="card settings-card"><div class="section-heading"><div><p class="eyebrow">CATEGORIES</p><h2>Your time labels</h2><p>Each category has a colour and an impact on your score.</p></div><button class="button small" data-action="open-category-modal">${icon('plus')} Add category</button></div><div class="category-settings">${state.categories.map(categorySetting).join('')}</div></article>
      <aside class="settings-side">
        <article class="card reminder-card"><div class="setting-icon">♢</div><div><p class="eyebrow">GENTLE REMINDERS</p><h2>Remember to log</h2><p>A browser notification can nudge you while this app is open.</p></div><label class="switch"><input type="checkbox" data-setting="reminder" ${state.settings.reminder ? 'checked' : ''}/><span></span></label><div class="reminder-frequency"><label>Every <select data-setting="reminderMinutes"><option value="60" ${state.settings.reminderMinutes === 60 ? 'selected' : ''}>hour</option><option value="120" ${state.settings.reminderMinutes === 120 ? 'selected' : ''}>2 hours</option><option value="180" ${state.settings.reminderMinutes === 180 ? 'selected' : ''}>3 hours</option></select></label></div></article>
        <article class="card data-card"><div class="setting-icon">↥</div><div><p class="eyebrow">YOUR DATA</p><h2>Keep a copy</h2><p>Export your complete ledger any time. It’s all yours.</p></div><div class="data-actions"><button class="button secondary" data-action="export-data">${icon('download')} Export JSON</button><label class="button secondary import-button">Import backup<input type="file" accept="application/json" data-action="import-data" /></label></div></article>
        <article class="card preference-card"><p class="eyebrow">PREFERENCES</p><label class="check-option"><input type="checkbox" data-setting="weekStartsMonday" ${state.settings.weekStartsMonday ? 'checked' : ''}/> Start calendar weeks on Monday</label></article>
        <button class="danger-link" data-action="clear-data">Clear all local data</button>
      </aside>
    </section>
  </div>`;
}

function categorySetting(category) {
  return `<div class="category-setting"><span class="category-color" style="background:${category.color}"></span><div><strong>${category.name}</strong><small>${category.weight > 0 ? `+${category.weight}` : category.weight} score weight</small></div><span class="category-usage">${hoursByCategory(Object.keys(state.entries))[category.id] || 0}h</span><button class="icon-button slim" data-action="open-category-modal" data-id="${category.id}" aria-label="Edit ${category.name}">${icon('more')}</button></div>`;
}

function modal() {
  const type = modalType();
  if (type === 'quick-log') return quickLogModal();
  if (type === 'date-picker') return datePickerModal();
  if (type === 'goal') return goalModal();
  if (type === 'category') return categoryModal();
  if (type === 'confirm-clear') return confirmClearModal();
  return '';
}

function modalShell(title, content) {
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${title}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Close">×</button></div>${content}</section></div>`;
}

function quickLogModal() {
  const now = new Date();
  const defaultDate = selectedDate;
  const defaultHour = isToday(defaultDate) ? now.getHours() : 9;
  const existing = entryFor(defaultDate, defaultHour);
  return modalShell('Quick log an hour', `<form class="modal-form" data-form="quick-entry"><label>Date<input type="date" name="date" value="${defaultDate}" required /></label><label>Hour<select name="hour">${rangeOfHours(0,24).map(hour => `<option value="${hour}" ${hour === defaultHour ? 'selected' : ''}>${formatHour(hour)} – ${formatHour((hour + 1) % 24)}</option>`).join('')}</select></label><label>Category<select name="categoryId" required><option value="">Choose a category</option>${state.categories.map(category => `<option value="${category.id}" ${existing?.categoryId === category.id ? 'selected' : ''}>${category.icon} ${category.name}</option>`).join('')}</select></label><label>What did you do?<input autofocus name="title" value="${escapeHtml(existing?.title || '')}" placeholder="e.g. Wrote project proposal" maxlength="70" required /></label><label>Project / tag <span>optional</span><input name="project" value="${escapeHtml(existing?.project || '')}" placeholder="e.g. Portfolio" maxlength="35" /></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button type="submit" class="button primary">Save hour</button></div></form>`);
}

function datePickerModal() { return modalShell('Choose a day', `<form class="modal-form" data-form="date-picker"><label>Date<input type="date" name="date" value="${selectedDate}" required /></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary">View day</button></div></form>`); }

function goalModal() { return modalShell('Create a goal', `<form class="modal-form" data-form="goal"><label>Category<select name="categoryId" required>${state.categories.map(category => `<option value="${category.id}">${category.icon} ${category.name}</option>`).join('')}</select></label><label>Goal type<select name="comparator"><option value="min">Spend at least this much time</option><option value="max">Stay under this much time</option></select></label><div class="two-fields"><label>Target hours<input type="number" name="target" min="1" max="168" value="6" required /></label><label>Period<select name="period"><option value="week">Each week</option><option value="day">Each day</option></select></label></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary">Create goal</button></div></form>`); }

function categoryModal() {
  const editing = activeModal.id ? categoryFor(activeModal.id) : null;
  const category = editing || { name: '', color: '#3569e8', weight: 0, icon: '✦' };
  return modalShell(editing ? 'Edit category' : 'Add a category', `<form class="modal-form" data-form="category" data-id="${editing?.id || ''}"><label>Name<input name="name" maxlength="24" value="${escapeHtml(category.name)}" placeholder="e.g. Creative work" required /></label><div class="two-fields"><label>Colour<input type="color" name="color" value="${category.color}" /></label><label>Score weight<select name="weight"><option value="2" ${category.weight === 2 ? 'selected' : ''}>+2 Highly productive</option><option value="1" ${category.weight === 1 ? 'selected' : ''}>+1 Productive</option><option value="0" ${category.weight === 0 ? 'selected' : ''}>0 Neutral</option><option value="-1" ${category.weight === -1 ? 'selected' : ''}>−1 Unhelpful</option></select></label></div><label>Icon <input name="icon" maxlength="2" value="${escapeHtml(category.icon)}" placeholder="✦" /></label><div class="modal-actions">${editing ? `<button type="button" class="button danger" data-action="delete-category" data-id="${editing.id}">Delete</button>` : '<span></span>'}<button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary">${editing ? 'Save changes' : 'Add category'}</button></div></form>`);
}

function confirmClearModal() { return modalShell('Clear all your data?', `<div class="confirm-copy"><p>This permanently removes every entry, goal, reflection, and custom category stored in this browser.</p><p>Export a backup first if you may want it later.</p></div><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button danger" data-action="confirm-clear">Clear everything</button></div>`); }

function currentGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return 'A quiet start to your day';
  if (hour >= 9 && hour < 12) return 'How will you spend today?';
  if (hour >= 12 && hour < 15) return 'How are your hours unfolding?';
  if (hour >= 15 && hour < 18) return 'In the rhythm of the afternoon';
  if (hour >= 18 && hour < 22) return 'Taking stock of your day';
  return 'Quiet night reflection';
}
function formatHour(hour) { return `${String(hour).padStart(2, '0')}:00`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function openModal(type, id = null) { activeModal = id ? { type, id } : type; render(); }
function modalType() { return typeof activeModal === 'object' ? activeModal.type : activeModal; }
function closeModal() { activeModal = null; render(); }

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function saveEntry(date, hour, values) {
  if (!state.entries[date]) state.entries[date] = {};
  state.entries[date][hour] = { categoryId: values.categoryId, title: values.title.trim(), project: values.project.trim(), updatedAt: new Date().toISOString() };
  saveState();
}

function removeCategory(id) {
  if (state.categories.length <= 1) return showToast('Keep at least one category available.');
  const fallback = state.categories.find(category => category.id !== id);
  Object.values(state.entries).forEach(day => Object.values(day).forEach(entry => { if (entry.categoryId === id) entry.categoryId = fallback.id; }));
  state.categories = state.categories.filter(category => category.id !== id);
  state.goals = state.goals.filter(goal => goal.categoryId !== id);
  saveState();
}

function startReminder() {
  clearInterval(reminderTimer);
  if (!state.settings.reminder) return;
  reminderTimer = setInterval(() => {
    if (document.hidden && Notification.permission === 'granted') new Notification('The 24 Log', { body: 'Take a moment to name your last hour.' });
  }, Number(state.settings.reminderMinutes) * 60 * 1000);
}

function exportData() {
  const file = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `the-24-log-backup-${localDateString(new Date())}.json`; anchor.click();
  URL.revokeObjectURL(url);
  showToast('Your backup download has started.');
}

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action], [data-page]');
  if (!target) return;
  const { action, page } = target.dataset;
  if (page) { activePage = page; activeModal = null; render(); return; }
  if (action === 'toggle-sidebar') { document.querySelector('#sidebar').classList.toggle('open'); return; }
  if (action === 'open-quick-log') return openModal('quick-log');
  if (action === 'close-modal') return closeModal();
  if (action === 'show-date-picker') return openModal('date-picker');
  if (action === 'open-goal-modal') return openModal('goal');
  if (action === 'open-category-modal') return openModal('category', target.dataset.id);
  if (action === 'shift-date') { selectedDate = shiftDate(selectedDate, Number(target.dataset.shift)); editHour = null; render(); return; }
  if (action === 'jump-today') { selectedDate = localDateString(new Date()); activePage = 'today'; editHour = null; render(); return; }
  if (action === 'shift-month') { const date = parseDate(selectedDate); date.setMonth(date.getMonth() + Number(target.dataset.shift)); selectedDate = localDateString(date); render(); return; }
  if (action === 'select-date') { selectedDate = target.dataset.date; activePage = 'today'; editHour = null; render(); return; }
  if (action === 'edit-hour') { editHour = Number(target.dataset.hour); render(); return; }
  if (action === 'fill-rest') { rangeOfHours(0, 8).forEach(hour => { if (!entryFor(selectedDate, hour)) saveEntry(selectedDate, hour, { categoryId: 'rest', title: 'Sleep', project: '' }); }); render(); showToast('Empty overnight hours marked as sleep.'); return; }
  if (action === 'delete-goal') { state.goals = state.goals.filter(goal => goal.id !== target.dataset.id); saveState(); render(); showToast('Goal removed.'); return; }
  if (action === 'delete-category') { removeCategory(target.dataset.id); closeModal(); showToast('Category removed and its hours moved safely.'); return; }
  if (action === 'export-data') return exportData();
  if (action === 'clear-data') return openModal('confirm-clear');
  if (action === 'confirm-clear') { state = structuredClone(defaultState); saveState(); activeModal = null; selectedDate = localDateString(new Date()); render(); showToast('All local data has been cleared.'); return; }
});

app.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const data = Object.fromEntries(new FormData(form));
  if (form.dataset.form === 'entry') {
    event.preventDefault();
    if (!data.categoryId) return showToast('Choose a category before saving.');
    saveEntry(selectedDate, Number(form.dataset.hour), data); editHour = null; render(); showToast('Hour saved.');
  }
  if (form.dataset.form === 'quick-entry') {
    event.preventDefault();
    saveEntry(data.date, Number(data.hour), data); selectedDate = data.date; activeModal = null; activePage = 'today'; render(); showToast('Hour saved to your ledger.');
  }
  if (form.dataset.form === 'date-picker') { event.preventDefault(); selectedDate = data.date; activeModal = null; render(); }
  if (form.dataset.form === 'goal') {
    event.preventDefault(); const category = categoryFor(data.categoryId); state.goals.push({ id: `${data.categoryId}-${Date.now()}`, label: category.name, categoryId: data.categoryId, target: Number(data.target), period: data.period, comparator: data.comparator }); saveState(); activeModal = null; render(); showToast('New target is ready.');
  }
  if (form.dataset.form === 'category') {
    event.preventDefault(); const id = form.dataset.id || data.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `category-${Date.now()}`; const category = { id, name: data.name.trim(), color: data.color, weight: Number(data.weight), icon: data.icon.trim() || '✦' }; const index = state.categories.findIndex(item => item.id === id); if (index >= 0) state.categories[index] = category; else state.categories.push(category); saveState(); activeModal = null; render(); showToast(index >= 0 ? 'Category updated.' : 'Category added.');
  }
});

app.addEventListener('change', async event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
  if (input.dataset.reflection) { state.reflections[input.dataset.reflection] = input.value.trim(); saveState(); return; }
  if (input.dataset.setting) {
    if (input.dataset.setting === 'reminder') {
      if (input.checked && 'Notification' in window && Notification.permission !== 'granted') await Notification.requestPermission();
      state.settings.reminder = input.checked && (!('Notification' in window) || Notification.permission === 'granted');
      if (input.checked && !state.settings.reminder) showToast('Notification permission is needed for reminders.');
    } else if (input.type === 'checkbox') state.settings[input.dataset.setting] = input.checked;
    else state.settings[input.dataset.setting] = Number(input.value);
    saveState(); startReminder(); render();
  }
  if (input.dataset.action === 'import-data' && input.files?.[0]) {
    const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(reader.result); if (!imported.entries || !imported.categories) throw new Error(); state = { ...structuredClone(defaultState), ...imported, settings: { ...defaultState.settings, ...imported.settings } }; saveState(); startReminder(); render(); showToast('Backup imported successfully.'); } catch { showToast('That backup file could not be read.'); } }; reader.readAsText(input.files[0]);
  }
});

startReminder();
render();
