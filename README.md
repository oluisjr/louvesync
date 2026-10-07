# LouveSync — Worship Team Management

A web application for organizing worship teams, song catalogs, events, and ordered setlists in one place.

**React 19 · JavaScript · Vite 8 · Supabase/PostgreSQL · Node.js serverless functions · Vercel**

[Application](https://louvesync.vercel.app) · [Environment configuration](ENV.md)

> **Em português:** aplicação para organizar membros, repertório, eventos, escalas e sequências de músicas de uma equipe de louvor.

## Features in the codebase

- Member and song catalog management.
- Events linked to songs and team members.
- Ordered setlists with song items, notes, assigned singers, and song sequences.
- Participation confirmation for assigned members.
- Browser storage for cached data and local fallback behavior.
- Supabase subscriptions for selected collaborative updates.
- A public read-only setlist endpoint for display operators.
- Service-worker and web-manifest files for the mobile web experience.

## How the application is organized

| Area | Responsibility | Source |
| --- | --- | --- |
| React interface | Screens, application state, user interactions, and synchronization flows | [src/App.jsx](src/App.jsx) |
| Data access | Supabase queries and mutations for members, songs, events, and assignments | [src/lib/supabase.js](src/lib/supabase.js) |
| Shared setlists | Loads an event, orders its songs, and returns a read-only HTML page | [api/setlist.js](api/setlist.js) |
| Chord import | Fetches and parses chord-page content | [api/cifra.js](api/cifra.js) |
| Startup and error handling | React mounting and a root error boundary | [src/main.jsx](src/main.jsx) |
| Development tooling | Vite and local middleware for chord/proxy routes | [vite.config.js](vite.config.js) |
| Deployment | Build output, headers, and SPA routing | [vercel.json](vercel.json) |

The browser uses Supabase through a dedicated data-access module. Serverless handlers in `api/` run in the deployment environment. The interface also stores selected data in `localStorage`; that fallback is distinct from remote persistence.

## Data relationships

The core queries reference:

- `members`: team members.
- `songs`: the song catalog.
- `events`: scheduled events.
- `event_songs`: event items, ordering, notes, singers, and sequences.
- `event_members`: member assignments and participation confirmations.

See [src/lib/supabase.js](src/lib/supabase.js) for the fields and relationships used by the application. Additional screens may require additional tables.

**Database setup:** the repository does not currently include a complete reproducible SQL schema or migration set. Configuring Supabase credentials alone does not create the required tables or access policies.

## Run locally

### Requirements

- Node.js `^20.19.0 || >=22.12.0`, as required by the locked Vite version.
- npm.
- An existing compatible Supabase project for remote persistence.

### Installation

```bash
git clone https://github.com/oluisjr/louvesync.git
cd louvesync
npm ci
cp .env.example .env.local
npm run dev
```

On Windows, copy `.env.example` to `.env.local` using your shell or file manager.

Set the browser configuration in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-project-public-anon-key
```

If either value is absent, the client logs a configuration warning and uses available local fallback behavior. This is not a seeded demonstration mode with a complete database.

Vite provides local middleware for `/api/cifra` and `/api/proxy`. It does **not** run every handler in `api/`; use a Vercel-compatible environment to exercise the other serverless routes.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development server |
| `npm run build` | Generate production frontend assets in `dist/` |
| `npm run preview` | Preview the built frontend locally |
| `npm run lint` | Run the configured ESLint checks |

These commands exist in [package.json](package.json). Their presence is not evidence that all checks currently pass. No automated test suite is included in the repository.

## Deployment

[vercel.json](vercel.json) configures the install command, `npm run build`, the `dist/` output directory, and SPA rewrites. Configure environment variables in the deployment environment as described in [ENV.md](ENV.md).

All variables beginning with `VITE_` are exposed to the browser bundle. Use only public browser configuration with that prefix. Privileged Supabase keys and internal operation tokens belong exclusively in the server environment.

## Development priorities

- Add database migrations and non-personal demonstration data.
- Cover setlist ordering, participation confirmation, and data-access failures with automated tests.
- Extract domain screens and synchronization logic from the main application component.
- Validate authorization boundaries and the mobile caching lifecycle.

[SAAS_IMPLEMENTATION_PLAN.md](SAAS_IMPLEMENTATION_PLAN.md) contains planning material. It should be read as a roadmap, rather than a list of shipped capabilities.

## Author

[Luís Ignácio Junior](https://github.com/oluisjr) · [Portfolio](https://portfoliooluisjr.vercel.app)
