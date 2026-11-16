# AniVira

AniVira is a responsive anime discovery and catalogue website with a separate Cloudflare D1-backed Studio. It has no viewer accounts and no mandatory sign-in.

## Features

### Public website
- Responsive dark streaming-inspired interface.
- Trending, seasonal and popular discovery shelves powered by Jikan.
- Search, catalogue browsing, anime detail dialogs and official trailer embeds.
- AniVira's own D1 catalogue displayed alongside discovery data.
- Anime metadata, genres, synopsis, posters and banners.
- Episode lists and official / authorized source links from D1.\n- Dedicated `watch.html` page with episode selection, authorized source selection, direct MP4/WebM playback and HLS playback where the provider permits it.
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

- Static frontend: Cloudflare Pages, repository root.
- Backend: Cloudflare Worker, `worker/index.js`.
- Database: Cloudflare D1, binding name `DB`.
- D1 schema: `database/schema.sql`.
- Initial migration: `database/migrations/0001_init.sql`.
- Public API configuration: `assets/config.js`.

The D1 database is connected by the code but must be provisioned and deployed in your Cloudflare account before it can serve real data. No deployment or database provisioning is performed automatically by committing this repository.

## API

### Public GET endpoints
- `GET /api/health`\n- `GET /api/admin/verify` (Bearer admin key required)
- `GET /api/anime?limit=24&offset=0&q=...`
- `GET /api/anime/:id`
- `GET /api/genres`
- `GET /api/seasons`
- `GET /api/featured`
- `GET /api/episodes?anime_id=...` (omit anime_id for a limited catalogue-wide result)
- `GET /api/sources?anime_id=...` (omit anime_id for a limited catalogue-wide result)

### Admin endpoints (Bearer ADMIN_API_KEY required)
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

## Cloudflare deployment

### 1. Create the D1 database

From the repository root:

```bash
npx wrangler login
npx wrangler d1 create anivira
```

Copy the returned database ID into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_CLOUDFLARE_D1_DATABASE_ID`.

### 2. Apply the database migration

```bash
npx wrangler d1 migrations apply anivira --remote
```

Alternatively, initialize directly from the complete schema (do one initialization method, not both):

```bash
npx wrangler d1 execute anivira --remote --file=database/schema.sql
```

### 3. Configure the Worker

In `wrangler.toml`, replace the Pages origin placeholder under `[vars]` with your exact deployed website origin, for example `https://your-project.pages.dev`.

The D1 binding must remain:
- Type: D1 database
- Variable name: `DB`
- Database: `anivira`

Set the admin secret:

```bash
npx wrangler secret put ADMIN_API_KEY
```

Use a long, randomly generated secret. Do not commit it or paste it into `assets/config.js`.

Deploy:

```bash
npx wrangler deploy
```

Copy the deployed Worker URL, for example `https://anivira-api.YOUR-SUBDOMAIN.workers.dev`.

### 4. Connect the public website

Edit `assets/config.js` and set:

```js
window.ANIVIRA_API_BASE = "https://YOUR-WORKER-URL.workers.dev";
```

Commit and redeploy the Pages site. This URL is public and is not a secret.

### 5. Connect Studio

Open the deployed `/admin.html` page:
1. Open Settings.
2. Enter the Worker API URL.
3. Enter the `ADMIN_API_KEY` secret.
4. Select Save and test connection.
5. Confirm the status shows API + D1 connected.

After that, create an anime in Studio and confirm it appears in the public AniVira catalogue.

### 6. Deploy the frontend

Connect the repository to Cloudflare Pages:
- Production branch: `main`
- Build command: none
- Build output directory: `/`

The site is static HTML, CSS and JavaScript. Deploy the Worker separately.

## Environment names

| Name | Cloudflare setting | Purpose |
|---|---|---|
| `ALLOWED_ORIGIN` | Worker variable | Exact Pages website origin |
| `ADMIN_API_KEY` | Worker secret | Protects administrative writes |
| `DB` | D1 binding | D1 database binding name |

## Important limitations

- AniVira is an anime discovery and catalogue platform. It does not host copyrighted episodes.
- Viewing sources must be official or otherwise authorized. The website opens these links externally; it does not bypass provider access controls or DRM.
- Jikan is a public metadata service and may rate-limit requests. The D1 catalogue remains the source of truth for Studio-managed records.
- Watchlists and watched-state preferences are local to the viewer's browser. There is no account or cross-device synchronization.
- The Studio can import anime records from JSON. Episode/source backup data is exported; create episode and source records through Studio after import.
- The Worker and D1 must be deployed and configured in Cloudflare. A successful GitHub commit is not proof of a live deployment.
