# Plum Alley · Portfolio Intel

Private dashboard for LinkedIn company-page posts. **n8n scrapes; this app stores and displays.**

## First-time setup (Windows)

1. Unzip this folder anywhere (e.g. `C:\portfolio-intel`)
2. Open PowerShell in that folder
3. Run:

```powershell
./setup.ps1
```

4. Edit `.env` — set **`INGEST_SECRET`** to a long random string
5. Start: `npm start` (or `npm run dev` for development)
6. Open http://localhost:3000 — sign in with `OWNER_EMAIL` / `OWNER_PASSWORD` from `.env`

## Connect n8n

**Read `N8N.md`** — it has the exact HTTP Request node settings.

Quick reference:

- **URL:** `http://localhost:3000/api/updates/linkedin` (or your deployed URL)
- **Header:** `Authorization: Bearer <INGEST_SECRET>`
- **Body:** `company_name`, `post_content`, `post_url`, `published_at`, `raw_source` (required)

Health check: `GET http://localhost:3000/api/updates/linkedin`

Test without n8n: `npm run test:linkedin-endpoint`

## Environment variables

Copy `.env.example` → `.env`. Minimum to run:

| Variable | Purpose |
|----------|---------|
| `INGEST_SECRET` | **n8n bearer token** — required for ingest |
| `DATABASE_URL` | `file:./dev.db` (SQLite) or Postgres URL |
| `AUTH_SECRET` | Session encryption |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | Dashboard login |

Optional: `ANTHROPIC_API_KEY` (AI summaries), `APIFY_TOKEN` (in-app scrape — n8n preferred)

## Production

```bash
npm install
npx prisma db push
npm run db:seed
npm run build
npm start
```

Use PostgreSQL in production: set `DATABASE_URL` to a Postgres connection string before `prisma db push`.

**AWS Amplify:** see **`DEPLOY-AMPLIFY.md`** — fixes the common 404 (must use Web Compute + Postgres).


