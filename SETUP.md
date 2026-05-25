# the hunt — setup

One-time setup to wire everything together. Estimated time: ~30 minutes, mostly clicking.

## What you have

```
index.html                          → the main app (replaces job_tracker.html)
import.html                         → one-time migration from your JSON backup
schema.sql                          → run once in Supabase
netlify.toml                        → Netlify config
netlify/functions/extract-jd.js     → serverless function that calls Claude
job_tracker.html                    → original; safe to delete after migration works
jd-extract.skill                    → original skill; safe to delete (now baked into extract-jd.js)
```

## 1. Supabase — create the table (5 min)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the contents of `schema.sql`. Click **Run**.
3. Verify: **Table Editor** → you should see a `jobs` table with RLS enabled (lock icon).

## 2. Supabase — enable magic-link email (2 min)

1. **Authentication** → **Providers** → **Email**.
2. Ensure "Enable Email provider" is on. "Confirm email" can stay on (default).
3. **Authentication** → **URL Configuration** → set **Site URL** to your Netlify URL (e.g. `https://hunt-yourname.netlify.app`). Add `http://localhost:8888` to Redirect URLs if you'll run Netlify Dev locally.
4. **Project Settings** → **API**. Copy two values, keep this tab open:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **publishable** key (long string starting with `sb_publishable...`)

## 3. Create your local config (2 min)

Copy `config.example.js` to `config.js` and fill in the values from step 2:

```bash
cp config.example.js config.js
```

Then edit `config.js`:

```js
window.HUNT_CONFIG = {
  SUPABASE_URL: 'https://abcdefg.supabase.co',
  SUPABASE_KEY: 'sb_publishable_...',
};
```

`config.js` is in `.gitignore` so your keys won't be committed. The publishable key is technically safe to publish (RLS is what guards data), but keeping it out of git keeps your auth logs clean of randos.

**For Netlify**: `config.js` won't be in your repo, so Netlify won't have it either. Two options:
- **Easy**: commit `config.js` anyway (remove it from `.gitignore` in your private deploy repo). The publishable key is designed to be safe in client code.
- **Cleaner**: use Netlify's "snippet injection" or a build step to write `config.js` from environment variables at deploy time. Overkill for personal use.

Most people pick the easy path. If you're publishing your code to a public repo separately, keep `config.js` gitignored *there*.

## 4. Netlify — add the Anthropic key (2 min)

1. Netlify dashboard → your site → **Site settings** → **Environment variables**.
2. Add `ANTHROPIC_API_KEY` with your Anthropic key (`sk-ant-...`).
3. **Save**. (No redeploy needed yet — happens on next push.)

## 5. Commit & push (5 min)

```
git add index.html import.html config.js schema.sql netlify.toml netlify/functions/extract-jd.js SETUP.md
git commit -m "Migrate to Supabase + Netlify Functions"
git push
```

Netlify auto-deploys. Watch the **Deploys** tab; first deploy installs the function and should finish in 1–2 min. If the function fails to build, check that `netlify/functions/extract-jd.js` is in that exact path.

## 6. Migrate your existing data (5 min)

1. Open `https://your-site.netlify.app/import.html`.
2. Sign in via magic link (check email — first time may go to spam).
3. Pick your most recent `job-tracker-backup-*.json`. Click **Import to Supabase**.
4. Watch the log. Once done, open the main app at `/` and verify your rows are there.

## Daily use

- **Add a role**: click "+ add role" → paste JD → **Extract ✨** → review & save.
- **Mobile**: same URL works in any browser, including phone.
- **Backups**: the JSON export button still works — keep using it occasionally for belt-and-suspenders.

## Gotchas

- **Free tier auto-pause**: if you don't use the Supabase project for 7 days it pauses. One login wakes it up (~30s). No data loss.
- **Magic link redirect**: if you ever change your Netlify URL, update **Site URL** in Supabase Auth settings or the magic link will bounce you to the old URL.
- **Function errors**: visit `https://your-site/.netlify/functions/extract-jd` directly in browser — should say "Method not allowed" (it's POST-only). If it 404s, the function didn't deploy. Check Netlify's Functions tab.
- **Cost watch**: each JD extraction is ~1500 input tokens + ~500 output ≈ $0.002 on Haiku. 100 extractions = $0.20. Set a usage alert in the Anthropic console if you want a safety net.
- **Publishable key is public — that's fine**: it only grants what RLS policies allow. Do NOT commit the `service_role` key (you won't need it for this app).

## Local development (optional)

If you want to test locally before pushing:

```
npm install -g netlify-cli
netlify dev
```

This serves the site at `http://localhost:8888` AND runs the Function locally. You'll need `ANTHROPIC_API_KEY` in a `.env` file at the project root (gitignored).

## When something breaks

- **Login works but rows don't appear**: open browser devtools console. Most likely the SQL in step 1 didn't run cleanly — re-run `schema.sql`.
- **"Extract" button fails**: check Netlify → Functions → extract-jd logs. Usually a missing env var.
- **Phone shows a cramped table**: known; the original CSS assumes desktop. Once you've used it a bit and know what's awkward on mobile, ask for a responsive-CSS pass.
