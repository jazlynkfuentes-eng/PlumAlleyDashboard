# Deploy to AWS Amplify (fix 404 + empty build settings)

A **404** or **empty build command / output directory "/"** means Amplify did not detect this as a Next.js SSR app.

## Fix empty build command (output "/")

If Amplify Console shows **blank build command** and **output directory "/"**, `amplify.yml` is not being used.

### Cause A — Drag-and-drop deploy (most common)

**Drag-and-drop ignores `amplify.yml` entirely.** You must connect **GitHub** (or GitLab/Bitbucket) so Amplify reads the repo root.

### Cause B — `amplify.yml` not at repo root

The file must sit next to `package.json` in the branch Amplify builds:

```
portfolio-intel/
  amplify.yml      ← here
  package.json
  src/
  prisma/
```

### Cause C — Manual fix in console (works immediately)

1. Amplify → your app → **Hosting** → **Build settings** → **Edit**
2. Open `amplify-console-buildspec.yml` from this repo and **paste the entire contents**
3. Confirm **artifacts → baseDirectory** is `.next` (not `/` or `out`)
4. **Save** → **Redeploy this branch**

You should then see build commands like `npm ci`, `npm run build` in the build log.

### Cause D — Platform / framework wrong

**App settings → General → Platform** = **Web Compute**

**Branch settings → Framework** = **Next.js - SSR** (set manually if auto-detect failed — Next.js 16 may not auto-detect; Amplify officially lists support through Next.js 15)

AWS CLI:

```bash
aws amplify update-app --app-id YOUR_APP_ID --platform WEB_COMPUTE --region YOUR_REGION
aws amplify update-branch --app-id YOUR_APP_ID --branch-name staging --framework "Next.js - SSR" --region YOUR_REGION
```

---

## Before you deploy

### 1. Use PostgreSQL (required on Amplify)

SQLite (`file:./dev.db`) **does not work** on Amplify. Use a free Postgres database:

- [Neon](https://neon.tech) (free tier)
- [Supabase](https://supabase.com) (free tier)
- AWS RDS

Set in Amplify → **Environment variables**:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Also set:

| Variable | Example |
|----------|---------|
| `AUTH_SECRET` | long random string |
| `OWNER_EMAIL` | your login email |
| `OWNER_PASSWORD` | your login password |
| `INGEST_SECRET` | same secret you put in n8n |
| `CRON_SECRET` | any random string |

### 2. Fix the 404 — set platform to SSR

In **Amplify Console** → your app → **App settings** → **General**:

- **Platform** must be **Web Compute** (not “Web” / static only)

If you have AWS CLI:

```bash
aws amplify update-app \
  --app-id YOUR_APP_ID \
  --platform WEB_COMPUTE \
  --region us-east-1

aws amplify update-branch \
  --app-id YOUR_APP_ID \
  --branch-name staging \
  --framework "Next.js - SSR" \
  --region us-east-1
```

Replace `YOUR_APP_ID`, branch name, and region with yours.

### 3. Redeploy

After changing platform + env vars:

1. Amplify Console → **Deployments** → **Redeploy this version** (or push a new commit)
2. Wait for build to finish (all green)
3. Open your URL — you should see the **login page**, not 404

### 4. Verify n8n endpoint

```
GET  https://YOUR-APP.amplifyapp.com/api/updates/linkedin
```

Should return JSON with `"ok": true`.

```
POST https://YOUR-APP.amplifyapp.com/api/updates/linkedin
Authorization: Bearer YOUR_INGEST_SECRET
```

See `N8N.md` for the full body format.

## Build spec (`amplify.yml`)

At repo root, `amplify.yml` sets:

| Setting | Value |
|---------|-------|
| preBuild | `npm ci`, `npx prisma generate` |
| build | `prisma db push` + `db:seed` (if `DATABASE_URL` set), `npm run build` |
| **baseDirectory** | **`.next`** (not `/`) |
| Node | 20 (via `.nvmrc` + Amplify build image) |

**Do not** set output directory to `/` or `out` — that causes 404.

If the console still shows empty settings after a Git push, paste `amplify-console-buildspec.yml` manually (see above).

## Connect via Git (recommended)

1. Push this project to GitHub
2. Amplify → **New app** → **Host web app** → connect repo
3. Amplify should detect **Next.js - SSR**
4. Add environment variables (step 1)
5. Deploy

Zip-only uploads often default to static hosting and 404 — **Git connect is more reliable**.

## Check build logs

If still 404 after redeploy:

1. Open the latest build log in Amplify
2. Confirm `npm run build` succeeded
3. Confirm you see `Route (app)` listing `/api/updates/linkedin`
4. Confirm platform is **Web Compute**

## n8n URL after deploy

```
https://staging.dlnxeq8nyrko0.amplifyapp.com/api/updates/linkedin
```

(Replace with your actual Amplify domain.)
