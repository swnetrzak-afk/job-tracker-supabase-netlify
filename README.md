# the hunt — personal job tracker

A self-hosted, private job application tracker. Built as a single-page app with Supabase for storage and Claude for auto-extracting fields from pasted job descriptions. Runs free on Netlify + Supabase free tiers; the only paid piece is Anthropic API usage (~$0.002 per JD extract).

Designed for personal use — one tracker per deploy. See `SETUP.md` for one-time setup (~30 min).

---

## What this is

A private, mobile-accessible web app where you track job applications. Each role has title, company, status, comp, contact, notes, JD summary, key requirements, and a status history. Pasting a job description auto-fills most fields via Claude.

---

## Architecture

```
  Browser (any device)
        │
        │  HTTPS
        ▼
  ┌─────────────────────────────┐
  │  Netlify                    │
  │  ├─ index.html (static)     │
  │  ├─ import.html (static)    │
  │  └─ /extract-jd  ◄── Netlify Function (Node)
  │         │                   │
  │         │ x-api-key         │
  │         ▼                   │
  │      Anthropic API          │
  │      (claude-haiku-4-5)     │
  └─────────────────────────────┘
        │
        │  supabase-js (REST + auth)
        ▼
  ┌─────────────────────────────┐
  │  Supabase                   │
  │  ├─ auth.users (magic link) │
  │  └─ public.jobs (Postgres)  │
  │       └─ RLS: user_id = auth.uid()
  └─────────────────────────────┘
```

Three services, all on free tiers:

| Service   | Role                                        | Cost              |
|-----------|---------------------------------------------|-------------------|
| Netlify   | Static hosting + serverless function        | Free              |
| Supabase  | Postgres database + auth (magic link)       | Free              |
| Anthropic | Claude API for JD extraction                | Pay-as-you-go (~$0.002 per extract on Haiku) |

---

## Files

```
index.html                          → main app
import.html                         → one-time migration page for old JSON backups
schema.sql                          → Postgres schema + RLS policies
netlify.toml                        → Netlify build / function routing
netlify/functions/extract-jd.js     → serverless function: POST JD → Claude → JSON
sample-data.json                    → example JSON in the import/export format
README.md                           → this file
SETUP.md                            → one-time setup instructions
```

---

## How auth works

1. Enter email → Supabase emails a magic link.
2. Click link → browser receives a session token, stored in localStorage by `supabase-js`.
3. Token includes my `user_id` (UUID).
4. Every DB query carries the token; Postgres uses RLS policies to filter rows where `user_id = auth.uid()`.

**Important properties:**
- The "anon" / "publishable" Supabase key is in the HTML and safe to publish — RLS is what actually protects data.
- The `service_role` / `secret` key is NEVER in client code. Not used by this app.
- New-user signups are **disabled** in the Supabase dashboard, so the login form is effectively sign-in only.
- Even if signups were enabled, a stranger would land in their own empty tracker (their UUID ≠ mine).

---

## How JD extraction works

1. In the "Add Role" modal, paste a job description into the top textarea.
2. Click **Extract ✨** → browser POSTs `{jd, url}` to `/extract-jd`.
3. The Netlify Function adds the system prompt and calls the Anthropic Messages API.
4. Claude returns strict JSON: `{title, company, remote, comp, url, summary, requirements}`.
5. The function returns that JSON to the browser, which fills any empty fields. Anything I've already typed is preserved.
6. The full JD text is stashed in the "Full JD" field on the record for future reference.

System prompt and field schema live in `netlify/functions/extract-jd.js`. To tune extraction quality, edit that file and push.

---

## Data model

Table `public.jobs` (Postgres). Notable columns:

| Column            | Type         | Notes                                                    |
|-------------------|--------------|----------------------------------------------------------|
| `id`              | uuid         | Primary key, auto-generated                              |
| `user_id`         | uuid         | FK to `auth.users.id`, auto-set to `auth.uid()`          |
| `title`, `company`| text         | Required                                                 |
| `status`          | text         | One of: applied, interviewing, rejected, declined, lost  |
| `remote`          | text         | Remote / Hybrid / On-site                                |
| `comp`            | text         | Free-form (range, OTE, "not listed", etc.)               |
| `summary`         | text         | Bulleted JD summary                                      |
| `requirements`    | text         | Bulleted key requirements                                |
| `jd`              | text         | Full JD text — kept for reference, never exported in CSV |
| `status_history`  | jsonb        | Array of `{status, date}` entries, appended on change    |
| `date_applied`    | date         | Set on creation                                          |
| `last_status_date`| date         | Updated when status changes                              |
| `created_at`, `updated_at` | timestamptz | Auto-maintained                                  |

The JS keeps camelCase in memory; `toDb()` / `fromDb()` in `index.html` handle the snake_case mapping.

---

## Import / export JSON format

The same JSON shape is used for both the export button and the import page. A complete example lives in `sample-data.json`.

### Envelope

```json
{
  "exportedAt": "ISO 8601 timestamp (informational, ignored on import)",
  "version":    "hunt-v4 (informational, ignored on import)",
  "count":      3,
  "jobs":       [ /* array of job objects */ ]
}
```

The import page also accepts a bare array (`[ {...}, {...} ]`) if you're producing the file from another tool and don't want to bother with the envelope.

### Job object

| Field             | Type     | Required | Notes                                                                 |
|-------------------|----------|----------|-----------------------------------------------------------------------|
| `title`           | string   | yes      | Job title                                                             |
| `company`         | string   | yes      | Company name                                                          |
| `status`          | string   | yes      | One of: `applied`, `interviewing`, `rejected`, `declined`, `lost`     |
| `remote`          | string   | no       | `Remote`, `Hybrid`, or `On-site`                                      |
| `comp`            | string   | no       | Free-form (e.g. `"$180-220k"`, `"not listed"`)                        |
| `contact`         | string   | no       | Network contact / referrer                                            |
| `url`             | string   | no       | Source URL for the JD                                                 |
| `notes`           | string   | no       | Free-form notes                                                       |
| `summary`         | string   | no       | What the role does — bullet lines separated by `\n`                   |
| `requirements`    | string   | no       | What they're screening for — bullet lines separated by `\n`           |
| `jd`              | string   | no       | Full JD text. Kept locally; never exported in CSV.                    |
| `dateApplied`     | string   | no       | ISO date (`YYYY-MM-DD`)                                               |
| `lastStatusDate`  | string   | no       | ISO date — when status last changed                                   |
| `statusHistory`   | array    | no       | `[{"status": "...", "date": "YYYY-MM-DD"}, ...]`                      |
| `id`              | string   | no       | Ignored on import (Postgres generates a new UUID)                     |
| `createdAt`       | string   | no       | Ignored on import                                                     |
| `updatedAt`       | string   | no       | Ignored on import                                                     |

Missing fields become `null`/empty in the database. Invalid `status` values fall back to `applied`.

### Migrating from another tool

The fastest path: open the other tool, export to CSV or JSON, then paste both that file and `sample-data.json` into Claude or ChatGPT with a prompt like *"convert the first file into the format of the second, output a single JSON array of jobs."* Save the result, then drop it into the import page.

---

## Daily use

- **Add a role:** click "+ add role", paste JD, hit **Extract ✨**, review, save.
- **Edit a role:** click the row → Edit, or hover the row → "edit" button.
- **Change status:** edit → change status dropdown → save. Adds an entry to status history automatically.
- **Search / filter:** toolbar above the table.
- **Mobile:** same URL, works in any browser.
- **Backup:** JSON export button in the header. Save to Google Drive occasionally as belt-and-suspenders (Supabase free tier doesn't have point-in-time recovery).

---

## When something breaks

| Symptom                                          | Likely cause / fix                                                       |
|--------------------------------------------------|--------------------------------------------------------------------------|
| Login email never arrives                        | Check spam. Verify Supabase Auth → URL Configuration → Site URL matches live URL. |
| Logged in but tracker is empty                   | RLS sees a different user_id (e.g. signed in with a different email). Sign out / sign in with the right email. |
| Extract button hangs or errors                   | Netlify Functions tab → check `extract-jd` logs. Usually a missing/expired `ANTHROPIC_API_KEY`. |
| Function returns `{error: "Claude returned non-JSON"}` | Claude wrapped its response in prose. Tweak the system prompt to reinforce "JSON only." |
| Supabase project paused                          | Free tier pauses after 7 days idle. Log in → it resumes in ~30s. No data loss. |
| Costs creeping up                                | Anthropic console → set a monthly usage cap. Each extract is ~$0.002 on Haiku. |

---

## How to change things

| Change                          | Where                                                                              |
|---------------------------------|------------------------------------------------------------------------------------|
| Add a new field                 | `schema.sql` (alter table) → `index.html` (form + toDb/fromDb + render) → push     |
| Tune JD extraction quality      | `netlify/functions/extract-jd.js` → edit `SYSTEM_PROMPT`                            |
| Switch Claude model             | `netlify/functions/extract-jd.js` → change `model:` field                          |
| Add a new status                | `schema.sql` (update CHECK constraint) → `index.html` (status options + badges)    |
| Restyle / make mobile-friendly  | `<style>` block in `index.html`                                                    |
| Restrict signups                | Supabase dashboard → Authentication → Sign-Ups toggle (already off)                |

---

## Environment variables

Set in Netlify dashboard → Site settings → Environment variables. **Never** in the repo.

| Var                  | Used by                              | Value                              |
|----------------------|--------------------------------------|------------------------------------|
| `ANTHROPIC_API_KEY`  | `netlify/functions/extract-jd.js`    | `sk-ant-...`                       |

Supabase URL + publishable key live in `index.html` and `import.html` directly — those are safe to commit.

---

## Local development

```bash
npm install -g netlify-cli
netlify dev
```

Serves the site at `http://localhost:8888` and runs the function locally. Requires a `.env` file at the project root (gitignored) with `ANTHROPIC_API_KEY=...`.

---

## Deployment

Git push to main → Netlify auto-deploys (~1 min). Function changes take effect on the same push.

To roll back: Netlify dashboard → Deploys → pick a previous deploy → **Publish deploy**.

---

## Notes on the design

- **Magic-link auth + RLS** is the simplest way to put a personal tool on the internet safely. Auth proves who you are; RLS controls what you see. Two separate layers.
- **The "anon" key being public is a feature, not a bug** — it's the doorbell, not the front-door key. RLS is the lock.
- **Serverless functions are the right home for API keys.** Browser code can't be trusted with secrets; functions can.
- **Free tiers are wildly generous** for personal-scale apps. This whole thing costs me pennies per month, mostly to Anthropic for extractions.
