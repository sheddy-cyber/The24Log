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

- 24-hour daily ledger with fast in-place logging and a quick-log modal
- Colour-coded, editable categories with productivity weights
- Daily productivity score, completion meter, reflections, and sleep backfilling
- Month calendar, recent-day history, weekly view, trends, category breakdown, and hourly heatmap
- Daily and weekly targets with progress indicators
- Browser reminders while the app is open
- Export and import of a complete JSON backup
- Responsive layout and installable web-app metadata

## Your data

Entries, goals, categories, and reflections stay in this browser's local storage. They are never sent to a server. Use **Settings → Export JSON** periodically if you want a portable backup.
