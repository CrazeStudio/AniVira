# AniVira

AniVira is a responsive anime discovery and tracking website with a separate no-login content administration page.

## Public website

- Cinematic responsive homepage
- Trending, seasonal and popular anime shelves
- Search and catalogue browsing
- Anime detail dialogs, synopsis, genres and official trailer embeds when available
- Device-local watchlist
- Admin-managed anime catalogue surfaced in Explore
- Admin-managed episode lists and official/authorized source links
- Episode watched toggles stored on the current device

Anime metadata is retrieved from the public Jikan API. AniVira does not host anime episodes or bypass provider access controls.

## Admin / Studio

Open `/admin.html` (or click Studio in the website navigation).

No user registration or sign-in is required. The current Studio page provides:
- Dashboard counters
- Anime CRUD
- Episode management
- Official / authorized source management
- JSON database export and import
- Local catalogue settings

**Current admin storage mode:** Studio data is saved in the browser's localStorage. It is local to that browser/device and is not a shared database. Clearing browser site data can remove it, so export backups regularly.

## Database and API scaffold

The repository includes:
- `database/schema.sql`: normalized Cloudflare D1 schema for anime, genres, seasons, episodes, sources and featured titles.
- `worker/index.js`: Cloudflare Worker API with public read endpoints and admin-key-protected write endpoints.
- `wrangler.toml`: Worker/D1 binding template.

The D1 backend is a deployment scaffold; it is **not connected to the public website or Studio automatically yet**. To activate it:

1. Create a Cloudflare D1 database named `anivira`.
2. Replace the placeholder `database_id` in `wrangler.toml`.
3. Apply the schema: `npx wrangler d1 execute anivira --remote --file=database/schema.sql`.
4. Set Worker secret `ADMIN_API_KEY` to a long random secret.
5. Set Worker variable `ALLOWED_ORIGIN` to the exact deployed AniVira website origin.
6. Deploy with `npx wrangler deploy`.

API routes:
- `GET /api/health`
- `GET /api/anime`
- `GET /api/anime/:id`
- `POST /api/anime` (admin key)
- `PATCH /api/anime/:id` (admin key)
- `DELETE /api/anime/:id` (admin key)
- `GET /api/episodes?anime_id=...`
- `POST /api/episodes` (admin key)
- `GET /api/sources?anime_id=...`
- `POST /api/sources` (admin key)

The admin key is not a user sign-in system. Never place it in public website JavaScript or commit it to Git. The local Studio page currently does not send writes to the D1 API.

## Run and deploy

This is a static frontend. Open `index.html` locally or deploy the repository root to Cloudflare Pages, GitHub Pages or another static host. The Worker is deployed separately.

## Limitations

- Watchlists and watched episode states are browser-local; there is no account or cross-device sync.
- Jikan and other public services can rate-limit requests.
- The D1 Worker scaffold requires Cloudflare configuration and deployment before it becomes a live database.
- Only official trailers and verified authorized viewing URLs should be added. AniVira does not provide unlicensed episode streams.
