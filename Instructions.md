# Klyron | Testing Agent — Deployment Guide

## ⚠️ Critical: The Playwright Problem

Vercel runs on AWS Lambda. Playwright needs a full Chromium binary (~300 MB) and a real process — Lambda's sandbox blocks this by default. You have **two options**:

| Option | Effort | Cost | Reliability |
|---|---|---|---|
| **A — `@sparticuz/chromium`** (stay on Vercel) | Medium | Vercel Pro required | Good |
| **B — Deploy to Railway** (full Node server) | Low | ~$5/mo | Best |

---

## Option A — Vercel + `@sparticuz/chromium`

### Step 1 — Swap the Chromium binary

```bash
npm install @sparticuz/chromium
```

Update `lib/browser/crawler.ts` — change the browser launch block.

At the top of the file add the import:

```ts
import chromiumLambda from "@sparticuz/chromium";
```

Replace the browser launch call inside `crawlSite`:

```ts
// Replace:
browser = await chromium.launch({ args: stealthLaunchArgs(), headless: true });

// With:
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
browser = await chromium.launch({
  args: isLambda ? chromiumLambda.args : stealthLaunchArgs(),
  executablePath: isLambda
    ? await chromiumLambda.executablePath()
    : undefined,
  headless: isLambda ? chromiumLambda.headless : true,
});
```

### Step 2 — Add `vercel.json`

Create `vercel.json` at the project root:

```json
{
  "functions": {
    "app/api/crawl/route.ts": {
      "maxDuration": 300,
      "memory": 3009
    },
    "app/api/generate-scripts-bulk/route.ts": {
      "maxDuration": 300
    }
  }
}
```

> **Note:** `maxDuration: 300` and 3 GB memory require **Vercel Pro** ($20/mo).
> On the free Hobby plan, functions cap at 10s / 1 GB — crawls will time out.

---

## Option B — Railway (Recommended)

Railway runs a persistent Node.js server — Playwright works out of the box with **zero changes** to your code.

### Step 1 — Add a Dockerfile

Create `Dockerfile` at the project root:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Step 2 — Add `.dockerignore`

Create `.dockerignore` at the project root:

```
node_modules
.next
.env.local
.git
```

Railway auto-detects the Dockerfile and installs Playwright's Chromium inside the container. No code changes needed.

---

## Shared Steps (both options)

### Step 3 — Push to GitHub

```bash
git add -A
git commit -m "feat: Klyron production build"
git remote add origin https://github.com/YOUR_USERNAME/klyron.git
git push -u origin master
```

Make sure `.env.local` is in `.gitignore` before pushing — it already is by default.

### Step 4 — Set up Neon database

1. Go to [console.neon.tech](https://console.neon.tech)
2. Create a project → copy the **pooled connection string** (the one with `-pooler` in the hostname)
3. Run migrations from your local machine:

```bash
npm run db:push
```

This creates all tables in Neon. Only needs to be done once (or after schema changes).

### Step 5 — Get your OpenRouter API key

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create a new key
3. Make sure you have credits loaded — DeepSeek V3 costs ~$0.27 / 1M tokens

---

## Deploying on Vercel (Option A)

### Step 6 — Import the project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** → select your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `.` (leave as default)

### Step 7 — Add environment variables

In the Vercel dashboard → **Settings → Environment Variables**, add all of the following:

| Name | Value |
|---|---|
| `DATABASE_URL` | Your Neon pooled connection string |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` |
| `APP_URL` | `https://your-app.vercel.app` (update after first deploy) |
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat` |

### Step 8 — Deploy

Click **Deploy**. First deploy takes ~2 minutes.

After it goes live, copy the production URL (e.g. `https://klyron.vercel.app`), update `APP_URL` in environment variables, then trigger a redeploy.

---

## Deploying on Railway (Option B)

### Step 6 — Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your repo
3. Railway detects the Dockerfile automatically and starts building

### Step 7 — Add environment variables

In the Railway dashboard → your service → **Variables** tab, add:

| Name | Value |
|---|---|
| `DATABASE_URL` | Your Neon pooled connection string |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` |
| `APP_URL` | `https://your-app.up.railway.app` (update after first deploy) |
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat` |
| `PORT` | `3000` |

### Step 8 — Set the start command

Railway → your service → **Settings → Start Command**:

```
npm start
```

### Step 9 — Add a domain (optional)

Railway → your service → **Settings → Domains** → click **Generate Domain** for a free `*.up.railway.app` URL, or add your own custom domain.

---

## Post-Deployment Checklist

```
□ App loads at the live URL
□ Create a test project and verify it appears in the dashboard
□ Run a crawl on a simple site (e.g. https://example.com)
□ Generate test cases — confirm they appear in the table
□ Approve a test case and generate a script
□ Download the script and verify it is valid Playwright JS
□ Download the full .zip suite
□ Light/dark mode toggle works correctly
□ Check Vercel / Railway logs for any runtime errors
```

---

## Common Issues & Fixes

### `Error: Failed to launch browser` on Vercel
You either skipped the `@sparticuz/chromium` swap in Step 1, or you are on the Hobby plan which has a 10-second function timeout. Upgrade to Pro or switch to Railway.

### `fetch failed` connecting to Neon
Your `DATABASE_URL` is wrong or missing. Make sure you are using the **pooled** connection string from Neon — it contains `-pooler` in the hostname. The non-pooled string will also work but is less reliable under load.

### `401 Unauthorized` from OpenRouter
`OPENROUTER_API_KEY` is not set in your environment variables, or the key has no credits. Go to [openrouter.ai/credits](https://openrouter.ai/credits) to top up.

### Crawl times out on Vercel
The target site is slow to respond, or you are on the Hobby plan. Either reduce the number of pages crawled (edit `DEFAULT_MAX_PAGES` in `lib/browser/crawler.ts`) or upgrade to Vercel Pro for the 300-second limit.

### `Module not found: playwright-core` on Railway
`playwright-core` must be in `dependencies` (not `devDependencies`) in `package.json`. It already is in this project — if you see this error, run `npm install playwright-core --save` and redeploy.

### `NEXT_PUBLIC_` variables not available on client
All environment variables in this project are server-side only. If you add any client-side variables, prefix them with `NEXT_PUBLIC_` and redeploy.

### Database schema out of sync after a code change
If you update `lib/db/schema.ts`, run the following from your local machine to push the new schema to Neon:

```bash
npm run db:push
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string (pooled) |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for LLM inference |
| `APP_URL` | Yes | Full URL of the deployed app (used in OpenRouter headers) |
| `OPENROUTER_MODEL` | No | Override the default model. Default: `deepseek/deepseek-chat` |

---

## Recommendation

> Start with **Railway** — zero code changes, the $5/mo Hobby plan handles everything comfortably, and Playwright runs natively inside the Docker container without any Lambda workarounds. Move to Vercel only if you need its global edge network or are already paying for Pro.
