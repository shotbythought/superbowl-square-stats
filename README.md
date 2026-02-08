# Super Bowl Squares Live EV

A Next.js app that:

- Accepts a Super Bowl squares board via paste-from-Excel.
- Pulls live DraftKings squares odds for:
  - Squares - Any Quarter
  - Squares - Final Result
- Computes EV using your workbook logic:
  - Convert American odds to implied non-normalized probability.
  - Blend probabilities as `80% Final Result + 20% Any Quarter`.
  - Normalize and multiply by total pool value.
- Shows leaderboard, top squares, and board heatmap.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data assumptions

- The board is a 10x10 grid of owners.
- Digits are interpreted as home-team columns and away-team rows.
- Default square price is `$3`, editable in the UI.
- Paste can include just the 10x10 owner grid, or the header-digit rows/columns from your Bets sheet.

## API endpoint

The app exposes `/api/draftkings-squares`, which fetches DraftKings live squares markets and returns parsed 10x10 odds matrices.
