# Deployment

Football Science is deployed to Vercel and aliased to `footballscience.xyz`.

## Deploy

From `/Users/maklind/Documents/New project`:

```bash
npm run qa:deploy
```

Only deploy after the QA gate passes:

```bash
npx vercel deploy --prod --yes
```

Copy the deployment URL returned by Vercel.

## CI Gate

GitHub Actions runs `npm run qa` on pushes to `main` and pull requests through `.github/workflows/qa.yml`.

`npm run qa` also runs `npm run qa:supabase`, a static migration safety gate that checks ordering, destructive SQL, RLS, default grants, and `security definer` guardrails for every file in `supabase/migrations`.

Remote Supabase migration verification lives in `.github/workflows/supabase-migrations.yml`. It runs automatically when migration files are pushed to `main`, and it can be started manually from GitHub Actions. Required secure configuration:

```bash
SUPABASE_ACCESS_TOKEN  # GitHub secret
SUPABASE_DB_PASSWORD   # GitHub secret
SUPABASE_PROJECT_REF   # GitHub repository variable
```

The remote gate runs:

```bash
npm run qa:supabase
npm run qa:supabase:remote
```

`qa:supabase:remote` links the CI runner to the target Supabase project, lists local vs remote migrations, runs linked database linting, and runs `supabase db push --dry-run`. Do not put these values in source files.

Optional live smoke requires a dedicated test account and these CI/local environment variables:

```bash
LIVE_QA_USERNAME
LIVE_QA_PASSWORD
LIVE_QA_BASE_URL
```

`LIVE_QA_BASE_URL` defaults to `https://footballscience.xyz`.

## Alias To Domain

```bash
npx vercel alias set <deployment-url>.vercel.app footballscience.xyz
```

## Verify

Use a cache-busting URL:

```bash
curl -I "https://footballscience.xyz?verify=YYYYMMDD-HHMM"
```

```bash
curl https://footballscience.xyz/api/client-config
```
should now also return:

```json
{"ok":true,"url":"...","anonKey":"...","hasServiceRoleKey":true}
```

`hasServiceRoleKey` must be `true` for user creation, role lookup, and password reset to work.
If it is `false`, add `SUPABASE_SERVICE_ROLE_KEY` in Vercel and redeploy.

To compare live JavaScript with local:

```bash
curl --http1.1 -L "https://footballscience.xyz/app.js?verify=YYYYMMDD-HHMM" -o /private/tmp/live_app.js -w "%{http_code} %{size_download}\n"
shasum -a 256 /private/tmp/live_app.js app.js
```

If hashes match but the browser still shows old behavior, the cause is probably browser cache or localStorage data. Session Planner currently uses `football-session-planner-v3`.

The backup endpoint must be protected anonymously:

```bash
curl -i https://footballscience.xyz/api/app-state-backup
```

Expected without auth:

```json
{"ok":false,"reason":"Admin sign-in or Vercel cron secret required."}
```

## Daily App-State Backups

`vercel.json` schedules a daily production cron:

```json
{
  "path": "/api/app-state-backup",
  "schedule": "0 8 * * *"
}
```

Required production environment variable:

```bash
CRON_SECRET
```

When the cron runs, `/api/app-state-backup` writes timestamped Supabase Storage objects under `backups/app-state/` and updates `backups/app-state/latest.json`.

## Current Hosting Notes

- Domain: `footballscience.xyz`
- Vercel project name has been `footballscience`.
- Previous deployment/alias flow worked with Vercel CLI.

## Supabase central setup (för inloggning från alla datorer)

### 1) Lägg in miljövariabler i Vercel (obligatoriskt)

**Viktigt:** `postgresql://...`-strängen som står under *Connection string* används för SQL-klienter (psql) och går inte i frontend/JS-API:t.

Din app läser **bara** dessa variabler:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

I Vercel-projektet `footballscience`, lägg till dessa miljövariabler för **Production**, **Preview** och **Development**:

```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Värden:
- `SUPABASE_URL` = `https://<DITT_SUPABASE_PROJECT_REF>.supabase.co`
- `SUPABASE_ANON_KEY` = `anon`-nyckeln från Supabase → **Settings → API** → **Project URL** och **anon public**
- `SUPABASE_SERVICE_ROLE_KEY` = `service_role`-nyckeln från samma vy

`SUPABASE_SERVICE_ROLE_KEY` behövs för admin-funktioner (`admin-users`, användaruppslag för username-login, skicka lösenord osv.). Om den saknas kommer inloggning med användarnamn ofta att missa.

### 2) Lägg in rätt URL:er i Supabase

I Supabase → **Authentication** → **URL Configuration**:
- **Site URL**: `https://footballscience.xyz`
- **Redirect URLs**:
  - `https://footballscience.xyz`
  - `https://footballscience.xyz/*`
  - `https://footballscience-one.vercel.app`
  - `https://footballscience-one.vercel.app/*`

(Lägg gärna även `https://footballscience-one.vercel.app` under redirect om du använder preview/test-länkar också.)

### 3) Verifiera från server-sidan

```bash
curl https://footballscience.xyz/api/client-config
```

Skall svara:

```json
{"ok":true,"url":"...","anonKey":"..."}
```

Om du fortfarande får `Missing SUPABASE_URL or SUPABASE_ANON_KEY` är miljövariablerna inte rätt inlagda eller så har deployment inte uppdaterats.

### 4) Ny deployment efter ändring

Varje ändring i kod måste deployas:

```bash
npx vercel --prod --yes
```

### 5) Testa inloggning från annan dator

1. Öppna exakt samma URL som kollegan använder.
2. Logga in med `Email or Username` + lösenord (säg helst e-post först om de inte får första gången).
3. Om det fortfarande misslyckas, testa att öppna `/api/client-config` i samma webbläsare och se att det svarar `ok:true`.
