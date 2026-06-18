# Klyron | Testing Agent

AI-powered QA tool that crawls any website with Playwright, generates structured test cases using DeepSeek, and exports runnable Playwright automation scripts.

---

## Prerequisites

Make sure you have these installed before starting:

- [Node.js 18+](https://nodejs.org) — check with `node -v`
- [Git](https://git-scm.com)
- A free [Neon](https://neon.tech) account (Postgres database)
- A free [OpenRouter](https://openrouter.ai) account (LLM API)

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

---

## Step 2 — Install dependencies

```bash
npm install
```

---

## Step 3 — Set up your Neon database

1. Go to [console.neon.tech](https://console.neon.tech) and sign in
2. Click **New Project** → give it any name → click **Create**
3. On the project dashboard, find the **Connection string** section
4. Select the **Pooled connection** tab (the URL contains `-pooler` in the hostname)
5. Copy the full connection string — it looks like:
   ```
   postgresql://user:password@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## Step 4 — Get your OpenRouter API key

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys) and sign in
2. Click **Create Key** → give it a name → copy the key (starts with `sk-or-v1-...`)
3. Go to [openrouter.ai/credits](https://openrouter.ai/credits) and add a small amount of credits — DeepSeek V3 costs ~$0.27 per 1M tokens so even $1 goes a long way

---

## Step 5 — Create your environment file

In the project root, create a file named `.env.local`:

```bash
# Windows (PowerShell)
New-Item .env.local

# Mac / Linux
touch .env.local
```

Open `.env.local` and paste in the following, filling in your values:

```env
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
OPENROUTER_API_KEY=sk-or-v1-...
APP_URL=http://localhost:3000
OPENROUTER_MODEL=deepseek/deepseek-chat
```

> **Never commit this file.** It is already in `.gitignore` by default.

---

## Step 6 — Push the database schema

This creates all the required tables in your Neon database. Only needs to be run once (or again after schema changes).

```bash
npm run db:push
```

You should see output confirming the tables were created.

---

## Step 7 — Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see the Klyron dashboard.

---

## You're all set

Here's what you can do from the dashboard:

1. **Create a project** — paste in any website URL and give it a name
2. **Crawl** — Klyron maps every page, form, and interactive element on the site
3. **Generate test cases** — DeepSeek turns the site map into structured manual test cases
4. **Review & approve** — edit titles, descriptions, and toggle cases to approved
5. **Generate scripts** — convert approved test cases into Playwright JS automation scripts
6. **Download** — grab individual scripts or the full `.zip` suite

---

## Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server at `http://localhost:3000` |
| `npm run build` | Create a production build |
| `npm run db:push` | Push schema changes to Neon |
| `npm run db:studio` | Open Drizzle Studio to browse your database |
| `npm run typecheck` | Run TypeScript type checking |

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL pooled connection string |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for LLM inference |
| `APP_URL` | Yes | Full URL of the app (`http://localhost:3000` locally) |
| `OPENROUTER_MODEL` | No | LLM model override. Default: `deepseek/deepseek-chat` |

---

## Troubleshooting

**`npm run db:push` fails with connection error**
Make sure `.env.local` exists and `DATABASE_URL` is set to the **pooled** Neon connection string (contains `-pooler` in the hostname).

**Crawl fails immediately**
The target site may be blocking headless browsers, have a slow DNS, or return a non-2xx status. Try a simpler site like `https://example.com` first to confirm the setup works.

**`401 Unauthorized` when generating test cases**
Your `OPENROUTER_API_KEY` is wrong or has no credits. Check [openrouter.ai/credits](https://openrouter.ai/credits).

**Port 3000 already in use**
Run `npm run dev -- -p 3001` to use a different port, and update `APP_URL` in `.env.local` to match.
