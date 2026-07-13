# ⚠️ Do NOT use Amplify "Drag and drop" for this app

The screen you are on says:

> *"Zip the contents of your **build output**, not the top level folder"*

That flow is for **static websites** (HTML/CSS/JS only). Examples: Create React App `build/`, Next.js static export `out/`.

## This app is NOT static

Portfolio Intel needs:

- **Next.js SSR** (server-rendered pages)
- **API route** `POST /api/updates/linkedin` (for n8n)
- **Database** (Prisma)
- **Login** (Auth.js)

A zip of source code or `.next` folder **will 404** on drag-and-drop deploy.

---

## What to do instead (Amplify)

### Option A — Connect GitHub (recommended)

1. Push this project to a GitHub repo
2. Amplify → **Host web app** → connect that repo (not drag-and-drop)
3. Set **Platform: Web Compute**
4. Add env vars (see `DEPLOY-AMPLIFY.md`) — **Postgres `DATABASE_URL` required**
5. Deploy — Amplify runs `amplify.yml` and builds SSR automatically

### Option B — Easier hosting for Node.js apps

If Amplify is frustrating, these work with the **source zip** + env vars:

| Platform | Why |
|----------|-----|
| [Render](https://render.com) | Connect repo, add Postgres, `npm run build && npm start` |
| [Railway](https://railway.app) | Same — Node + Postgres in minutes |
| [Vercel](https://vercel.com) | Built for Next.js (use Vercel Postgres or Neon) |

Local setup still works: `.\setup.ps1` then `npm start`.

---

## n8n after deploy

Once the app is live (not 404):

```
POST https://YOUR-DOMAIN/api/updates/linkedin
Authorization: Bearer <INGEST_SECRET>
```

See `N8N.md` for the JSON body.

---

## If you already uploaded a zip via drag-and-drop

That explains the 404. Delete that deployment method and use **Git connect + Web Compute** instead.
