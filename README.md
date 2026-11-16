# AniVira

AniVira is a responsive anime discovery and catalogue website with a separate Cloudflare D1-backed Studio. It has no viewer accounts and no mandatory sign-in.

## Features

### Public website
- Responsive dark streaming-inspired interface.
- Trending, seasonal and popular discovery shelves powered by Jikan.
- Search, catalogue browsing, anime detail dialogs and official trailer embeds.
- AniVira's own D1 catalogue displayed alongside discovery data.
- Anime metadata, genres, synopsis, posters and banners.
- Episode lists and official / authorized source links from D1.
- Dedicated `watch.html` page with episode selection, authorized source selection, direct MP4/WebM playback and HLS playback where the provider permits it.
- Device-local watchlist and watched-state preferences.
- Mobile navigation, lazy-loaded artwork, loading and error states.

### AniVira Studio
Open `/admin.html` and select **Settings**.
- Connect to the deployed Worker API.
- Enter the admin API key for the current browser tab.
- Dashboard and database health indicator.
- Create, edit and delete anime.
- Manage episodes and authorized viewing sources.
- Export a JSON database backup and import anime records.
- The Studio writes to Cloudflare D1, not just localStorage.

There is no user sign-in or public account system. The admin key protects database write operations. It is held in `sessionStorage` for the current tab session; it is never bundled in public website JavaScript.

## Architecture

- **Frontend hosting:** Vercel, serving the static website from the repository root.
- **Backend API:** Cloudflare Worker, `worker/index.js`.
- **Database:** Cloudflare D1, binding name `DB`.
- **D1 schema:** `database/schema.sql`.
- **Initial migration:** `database/migrations/0001_init.sql`.
- **Public API configuration:** `assets/config.js`.

Vercel hosts the website only. The Worker connects to D1 using the `DB` binding. There is no PostgreSQL database, `DATABASE_URL`, Neon service, or Vercel database dependency.

The Worker and D1 must be provisioned and deployed in your Cloudflare account. Vercel deployment does not automatically create or deploy Cloudflare resources.

## API

### Public GET endpoints
- `GET /api/health`
- `GET /api/admin/verify` (Bearer admin key required)
- `GET /api/anime?limit=24&offset=0&q=...`
- `GET /api/anime/:id`
- `GET /api/genres`
- `GET /api/seasons`
- `GET /api/featured`
- `GET /api/episodes?anime_id=...`
- `GET /api/sources?anime_id=...`

### Admin endpoints (Bearer `ADMIN_API_KEY` required)
- `POST /api/admin/anime`
- `PATCH /api/admin/anime/:id`
- `DELETE /api/admin/anime/:id`
- `POST /api/admin/episodes`
- `PATCH /api/admin/episodes/:id`
- `DELETE /api/admin/episodes/:id`
- `POST /api/admin/sources`
- `PATCH /api/admin/sources/:id`
- `DELETE /api/admin/sources/:id`

The API uses prepared SQL statements, input validation, HTTPS URL checks, request-size limits, exact-origin CORS allowlisting and protected write routes. Configure a Cloudflare WAF/rate-limiting rule for `/api/admin/*` in production; do not rely on browser-side limits. Public read routes expose catalogue metadata only. Never add private credentials or unlicensed media URLs.

## Deployment

Deploy the frontend to Vercel and the API/database to Cloudflare. These are separate deployments.

### 1. Deploy the static website to Vercel

1. Import `https://github.com/CrazeStudio/AniVira` into Vercel.
2. Select the `main` production branch.
3. Select **Other** as the framework preset if Vercel asks.
4. Leave the build command and install command empty.
5. Set the output directory to `.` (repository root) if the project settings require an output directory.
6. Deploy. Vercel serves `index.html`, `admin.html`, and `watch.html` as static pages.

No Node.js server, package installation, PostgreSQL driver, or Vercel function is required for this static frontend.

### 2. Create the Cloudflare D1 database

From the repository root in a terminal with Wrangler installed:

```bash
npx wrangler login
npx wrangler d1 create anivira
```

Copy the returned database ID into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_CLOUDFLARE_D1_DATABASE_ID`.

### 3. Apply the D1 migration

```bash
npx wrangler d1 migrations apply anivira --remote
```

Alternatively, initialize directly from the complete schema (use one initialization method, not both):

```bash
npx wrangler d1 execute anivira --remote --file=database/schema.sql
```

### 4. Configure and deploy the Cloudflare Worker

In `wrangler.toml`, set `ALLOWED_ORIGIN` to the exact Vercel production origin, for example `https://your-project.vercel.app`. Do not include a path or trailing slash. If you use a custom domain, use that origin instead. Multiple allowed origins can be comma-separated.

Keep the D1 binding exactly as follows:
- Binding type: D1 database
- Variable name: `DB`
- Database: `anivira`

Set the admin secret:

```bash
npx wrangler secret put ADMIN_API_KEY
```

Use a long, randomly generated secret. Do not commit it or put it in `assets/config.js`.

Deploy the Worker:

```bash
npx wrangler deploy
```

Copy the deployed Worker URL, for example `https://anivira-api.YOUR-SUBDOMAIN.workers.dev`.

### 5. Connect the Vercel website to the Worker

Edit `assets/config.js`:

```js
window.ANIVIRA_API_BASE = "https://YOUR-WORKER-URL.workers.dev";
```

Commit the change. Vercel will automatically rebuild and redeploy the static website from the connected GitHub repository.

The Worker URL is public API configuration, not a secret. Never put `ADMIN_API_KEY` in this file.

### 6. Verify the deployment

1. Open `https://YOUR-PROJECT.vercel.app`.
2. Open `https://YOUR-WORKER-URL.workers.dev/api/health`. Confirm the response reports `ok: true` and `database: true`.
3. Open `/admin.html` on the Vercel domain.
4. Open **Settings**, enter the Worker URL and admin key, then choose **Save and test connection**.
5. Confirm Studio reports **API + D1 + admin verified**.
6. Create a test anime and confirm it appears in the public AniVira catalogue.

## Environment and bindings

| Name | Where to configure | Type | Purpose |
|---|---|---|---|
| `ALLOWED_ORIGIN` | Cloudflare Worker | Variable | Exact Vercel website origin |
| `ADMIN_API_KEY` | Cloudflare Worker | Secret | Protects administrative writes |
| `DB` | Cloudflare Worker | D1 binding | D1 database binding name |
| `ANIVIRA_API_BASE` | `assets/config.js` | Public URL | Worker API base URL |

Do not create a `DATABASE_URL` or PostgreSQL database for this architecture.

## Important limitations

- AniVira is an anime discovery and catalogue platform. It does not host copyrighted episodes.
- Viewing sources must be official or otherwise authorized. The website opens these links externally; it does not bypass provider access controls or DRM.
- Jikan is a public metadata service and may rate-limit requests. The D1 catalogue remains the source of truth for Studio-managed records.
- Watchlists and watched-state preferences are local to the viewer's browser. There is no account or cross-device synchronization.
- The Studio can import anime records from JSON. Episode/source backup data is exported; create episode and source records through Studio after import.
- Cloudflare Worker and D1 resources must be deployed and configured separately from Vercel. A successful GitHub commit or Vercel deployment does not prove the API/database is live.
