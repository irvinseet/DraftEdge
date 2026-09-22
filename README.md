# DraftEdge

FPL Draft waiver planner built with Next.js for Vercel.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` and enter the numeric team ID from an FPL Draft team URL.

## Production check

```bash
pnpm build
pnpm start
```

## Deploy to Vercel

Import this folder as a new Vercel project. The included `vercel.json` refreshes cached FFP projections daily at 12:00am Singapore time. Set a `CRON_SECRET` environment variable to protect the refresh endpoint; Vercel automatically sends it to cron invocations.

The user's team, league ownership and free agents are always fetched live. FFP projections and the official player reference are cached server-side and refreshed daily.
