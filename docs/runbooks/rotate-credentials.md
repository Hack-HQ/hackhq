# Runbook: rotate a credential

Use this when a credential has leaked, might have leaked, or is being rotated on
schedule. It is written to be followed under pressure, so it names exact
variables, exact blast radius, and the check that proves the new value works.

**Rotate first, investigate second.** Rotation is cheap and reversible; a leaked
`service_role` key is neither. And rewriting git history does not un-leak
anything: GitHub keeps unreachable commits fetchable by SHA, forks keep their own
copies, and mirrors and clones are already gone. The only thing that actually
invalidates a leaked value is issuing a new one.

## Was it ever exposed?

Work down this list. **Any "maybe" is treated as a yes.**

- **Chat and agent logs** — LLM transcripts, Slack/Discord threads, issue
  comments, PR descriptions, anything where someone pasted "my env file".
- **CI logs** — GitHub Actions run logs (masking only covers values registered
  as secrets, and only exact matches), Cloudflare Workers Builds logs, any
  `env`/`printenv` debugging step. Logs are public on a public repo.
- **Screenshots, screen recordings, and streams** — terminal panes, editor
  sidebars, browser devtools Network tab, dashboard pages.
- **Preview and branch environments** — a value scoped to "all environments" is
  present in every preview deployment, and a preview URL is guessable and
  crawlable. Check which environments each variable is attached to.
- **Third-party tools** — error trackers or log shippers that capture
  environment or request headers, dependency bots, IDE settings sync, pastebins,
  local backups (`.env.local.bak`, `.env.save`, editor swap files).
- **Git history** — `git log -S'<partial value>' --all`, plus every fork. A file
  that was committed and then deleted is still in the history; see
  `.github/workflows/secrets-guard.yml`, whose `env-files` job fails on exactly
  that case.
- **Local machines** — shell history, `~/.netrc`, a shared or lost laptop.

If the answer anywhere is yes or maybe, rotate that credential *and* every
credential that shares its rotation (see the JWT-secret note below).

## Credentials

| Variable | Where it is set | Blast radius if leaked | Rotation | Verification |
| -------- | --------------- | ---------------------- | -------- | ------------ |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime env (Cloudflare Worker → Settings → Variables and Secrets). Locally `web/.env.local`. | **Total.** Bypasses RLS — see below. | Supabase dashboard → Project Settings → JWT Keys: rotate the JWT secret (this reissues `anon` *and* `service_role` together). Update the runtime env, redeploy, then update `SUPABASE_ANON_KEY` and the `SUPABASE_SERVICE_KEY` Actions secret in the same window. | Sign in, add a hackathon on `/my`, reload in a fresh session: the row comes back and `/api/tracker` does not report `synced: false`. |
| `SUPABASE_SERVICE_KEY` | **GitHub Actions secret** (repo → Settings → Secrets and variables → Actions). Read only by `.github/workflows/sync_supabase.yml:55` → `.github/scripts/seed_supabase.py`. | Same as above — it holds a `service_role` key too. | Same rotation as `SUPABASE_SERVICE_ROLE_KEY`; paste the new value into the Actions secret. | Run **Sync Supabase** via `workflow_dispatch` and confirm the seed step succeeds. |
| `SUPABASE_ANON_KEY` | Runtime env; locally `web/.env.local`. | Low on its own: it identifies the project, it does not authenticate. Tracker writes in token mode are authorised by the caller's Clerk JWT and RLS. It does expose the project ref and whatever the `anon` role is granted. | Reissued by the same JWT-secret rotation as the service role key — they cannot be rotated independently. | `/my` still saves and reloads a tracker row for a signed-in user. |
| `DATABASE_URL` (or its alias `SUPABASE_DATABASE_URL`) | Locally `web/.env.local` for `npm run db:*`. Not needed at runtime. | **Total, and worse than it looks.** The string embeds the Postgres password and connects as the table owner, so RLS does not apply at all: read, write, and DDL over every table including `public.user_hackathons`. | Supabase dashboard → Project Settings → Database → reset the database password, then update every consumer (local `.env.local`, any pooler string, any teammate's copy). | `npm run db:generate` (or `npm run db:studio`) connects without an auth error. |
| `CLERK_SECRET_KEY` | Runtime env; locally `web/.env.local`. | High. Full Clerk Backend API access: enumerate, modify, and delete users, and mint sessions — i.e. become any user, and from there reach that user's tracker rows through the app itself. | Clerk dashboard → API keys: create a new secret key, deploy it, then delete the old one (in that order — deleting first breaks `/my` and `/api/tracker`). | Sign out and sign in again; `/my` loads instead of redirecting to `/auth/sign-in`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Build-time env; locally `web/.env.local`. | None by disclosure — it is inlined into the client bundle by design. Its safety comes from Clerk's allowed-origins list, so audit that instead of rotating. | Only rotates with the whole Clerk instance. If you do: Clerk dashboard → API keys, then rebuild (build-time value, so a redeploy is required, not just an env change). | `/my` shows the Clerk sign-in UI rather than the "setup instructions" fallback. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Build-time env; locally `web/.env.local`. | Billing. It ships in the client bundle, so anyone can lift it and bill map loads to this account. Not a data breach. | Mapbox account → Access tokens: create a new public token with URL restrictions and only `styles:read`/`tiles:read`, deploy, delete the old token. | `/globe` renders the Mapbox map instead of the placeholder. |
| `OPEN_AI` | **GitHub Actions secret** (exposed to the scripts as `OPENAI_API_KEY`). Read by `.github/workflows/auto_extract.yml` and `.github/workflows/deadline_watch.yml`. | Billing, plus access to whatever OpenAI project the key is scoped to. | platform.openai.com → API keys: revoke the key, create a replacement scoped to one project, update the Actions secret. | Run **Deadline watch** via `workflow_dispatch`; the scan step completes instead of failing with an auth error. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Build-time env. | None meaningful — a write-only ingest key, public by design. Worst case is junk events. | PostHog project settings → rotate the project API key, then rebuild. | Analytics events appear in PostHog after a page view. |
| Sentry DSN (hardcoded, not an env var) | `web/instrumentation-client.ts`, `web/sentry.server.config.ts`, `web/sentry.edge.config.ts`. | None. A DSN is a public write-only ingest endpoint; it cannot read issues. It is allowlisted in `/.gitleaks.toml` for that reason. | Sentry project settings → Client Keys (DSN): create a new key, replace the literal in all three files, deactivate the old one. | An error in each runtime (browser, server, edge) still shows up in Sentry. |

`secrets.GITHUB_TOKEN` is not on this list: GitHub mints it per workflow run and
expires it when the run ends, so there is nothing to rotate.

### Why the service role key is the emergency

`SUPABASE_SERVICE_ROLE_KEY` (and the identical-in-kind `SUPABASE_SERVICE_KEY`
used by CI) authenticates as the `service_role`, which **bypasses row level
security entirely**. Every policy in `supabase/migrations/` — the ownership
policies on `public.user_hackathons` from `20260725154500_user_hackathons.sql`,
the hardened write policies on `public.hackathons`, the submitter-read
restrictions — is simply not consulted. A holder of that key can read, rewrite,
and delete every user's tracker rows and the entire listings mirror, through the
public REST endpoint, from anywhere.

Two consequences worth being blunt about:

1. **Rotation is the only mitigation.** The key is a JWT whose `exp` is around
   the year 2099, so waiting it out is not a strategy, and there is no
   per-request revocation. Tightening policies does nothing, because policies do
   not apply to this role.
2. **Removing the file is not mitigation.** If it reached a commit, a log, or a
   screenshot, treat it as public from that moment.

The standing reduction in exposure is token mode: with `SUPABASE_ANON_KEY` set,
`web/lib/tracker-store.ts` authenticates each write with the caller's Clerk JWT
and RLS enforces ownership in Postgres, and the service role key can then be
removed from the runtime environment altogether (see "Tracker sync modes" in
`web/README.md`). A key that is not deployed cannot leak.

### Note on rotating Supabase legacy keys

The `anon` and `service_role` keys are JWTs signed with the project's JWT secret,
so they are not individually revocable: rotating the secret reissues both at
once. Plan for that — update `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
and the `SUPABASE_SERVICE_KEY` Actions secret in one window, or CI and the app
will disagree about which key is valid. Supabase's newer publishable/secret API
keys are revocable one at a time; migrating to them removes this coupling.

## After rotating

1. Redeploy. Build-time values (`NEXT_PUBLIC_*`) do not change on a running
   deployment; they are baked into the bundle.
2. Check which environments the new value is attached to. A value set only for
   Production leaves previews broken; a value set for all environments is present
   in every preview URL.
3. Delete the old value everywhere, including `web/.env.local` on every machine
   that has one. A superseded key left in a file is still a key.
4. Run the verification step from the table. "It deployed" is not verification.
5. If the leak was in git history, leave the history alone and say so in the
   incident note. Rewriting it invalidates every open PR and fork for no
   security benefit — the value is already rotated, which is what mattered.

## Preventing the next one

- `git config core.hooksPath .githooks` — one-time, per clone. `.githooks/pre-commit`
  refuses to stage any `.env` / `.env.*` file except `.env.example`.
- `.github/workflows/secrets-guard.yml` enforces the same rule on the server, so
  `git commit --no-verify` and a clone with no hook configured do not get through,
  and runs gitleaks over the full history.
- `/.gitleaks.toml` holds the allowlist. Every entry is scoped to a path and a
  content pattern, with the reason it is a false positive. Widening one of those
  entries to make a build green is how this runbook gets used again.
