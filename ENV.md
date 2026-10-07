# Environment configuration

This guide covers variables consumed by the current LouveSync codebase. The SaaS plan describes future work and does not make billing, OAuth, or analytics services prerequisites for running the current application.

## Browser configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `src/lib/supabase.js` and selected server handlers | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js` and selected server handlers | Public Supabase anon key |

Copy `.env.example` to `.env.local` and fill in the two public values.

The public key does not grant administrative permissions. Database policies and the application's authorization design determine what a client can access. Required tables and policies must already exist; this repository does not include a complete reproducible database setup.

## Optional server configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `SCRAPERAPI_KEY` | `api/cifra.js`, `api/proxy.js`, and Vite local middleware | Optional external scraping provider |
| `INTERNAL_API_TOKEN` | `api/delete-event.js` | Authorization token for the internal deletion endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/delete-event.js` | Privileged database access for internal operations |
| `SUPABASE_SERVICE_KEY` | `api/setlist.js` and `api/delete-event.js` | Existing privileged-key configuration name |
| `SUPABASE_URL` | `api/delete-event.js` | Alternative project URL for that handler |

The deletion handler accepts either service-key name. The setlist handler currently reads only `SUPABASE_SERVICE_KEY` before falling back to the public anon key. Check the relevant handler rather than assuming both names work everywhere.

Privileged keys can bypass database row-level policies. Use a dedicated development project for internal operations and keep these values exclusively on the server. No real credentials are included in `.env.example`.

## Platform-provided values

`api/version.js` reads `VERCEL_DEPLOYMENT_ID` and `VERCEL_GIT_COMMIT_SHA`. Vercel supplies these values when available; they are not required browser configuration.

## Local and deployed environments

- Local development: use an untracked `.env.local` file.
- Vercel: configure the applicable variables in the project's environment settings and redeploy when changing browser build variables.
- Vite development middleware supports chord and proxy routes. Other `api/` handlers require a serverless-compatible runtime.

## Public values and secrets

Vite exposes **every** `VITE_` value to browser code. A prefix does not make a value safe to expose. Never give OAuth client secrets, privileged database keys, or internal tokens that prefix.

Keep environment files containing real values out of version control. The checked-in example contains placeholders only.
