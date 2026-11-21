# The 24 Log

A private, local-first 24-hour time ledger. Log the major thing you did in each hour, then use the history, goals, and insights pages to notice the patterns.

## Start it

From this folder, run:

```powershell
npm run dev
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173) in your browser. No `npm install` step is needed; Python 3 is used only as a tiny local server.

To stop the server, press `Ctrl+C` in the terminal.

## What it includes

- 24-hour ledger grouped into night, morning, afternoon and evening, with a 24-segment strip of the day
- Log one hour or a whole range at once, copy the previous hour in one tap, clear an hour, and undo
- Title and project suggestions taken from what you've logged before
- "Unlogged hours today" list for catching up on gaps
- Colour-coded, editable categories with score weights (−1 to +2) and an explanation of the score
- A note for tomorrow that saves as you type and shows at the top of the next day
- Month calendar with a strip per day, month summary, and the last 14 days
- Weekly insights: daily score, hours per category compared with the same days last week, hour-by-hour heatmap, and plain-language observations
- Daily and weekly goals (at least / at most) that can be edited
- Light, dark, or follow-the-system theme, and a choice of heading typeface
- Keyboard shortcuts: `N` log, `T` today, `←` `→` change day, `1`–`5` pages, `?` list
- Browser reminders, JSON backup and restore, CSV export, installable as an app

## Your data

Entries, goals, categories, and reflections stay in this browser's local storage. They are never sent to a server. Use **Settings → Your data → Backup (JSON)** periodically if you want a portable backup.
