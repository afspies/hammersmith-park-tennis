# Court Booker

A simple court booking app for Hammersmith Park tennis courts. Residents can book 30-minute or 1-hour slots up to 14 days ahead. No accounts, no enforcement — just community coordination.

Live at **[tennis.afspies.com](https://tennis.afspies.com)**

## Tech stack

- **Frontend:** React 19 + Vite
- **Backend:** Express + better-sqlite3
- **Realtime:** Server-Sent Events (SSE)
- **Deployment:** Docker, hosted on Coolify

Everything runs in a single container. SQLite persists to a mounted volume.

## Local development

```bash
npm install

# Terminal 1: API server
npm run dev:server

# Terminal 2: Vite dev server (proxies /api to localhost:3000)
npm run dev
```

## Production

```bash
docker build -t court-booker .
docker run -p 3000:3000 -v court-data:/app/data court-booker
```

## Contributing

PRs welcome! When you open a PR, Coolify automatically spins up a **preview deployment** with its own database, so you can test changes live before merging.

1. Fork the repo and create a branch
2. Make your changes
3. Open a PR against `main`
4. A preview deploy will be created automatically — check the PR for the preview URL
5. Once reviewed and merged, changes deploy to production automatically
