# AniVira

AniVira is a responsive anime discovery and catalogue website. The public website, Admin Studio, and API are deployed together on **one host: Vercel**. The database is **Cloudflare D1**. There are no viewer accounts and no viewer sign-in.

## Architecture

- **One hosting platform:** Vercel.
- **Main website:** / (index.html).
- **Admin Studio:** /admin (admin.html; /admin.html also works).
- **Watch page:** /watch (watch.html).
- **Backend API:** Vercel Serverless Function at /api/*, implemented by api/[...path].js.
- **API handler:** lib/api-handler.mjs.
- **Database:** Cloudflare D1, accessed server-to-server through Cloudflare's D1 REST API.
- **Schema:** database/schema.sql; initial migration: database/migrations/0001_init.sql.

There is **no Cloudflare Worker deployment**, no second application host, no PostgreSQL, and no Neon/Vercel database dependency. Cloudflare is used only for its D1 database service.

## Features

### Main website
- Responsive anime streaming-inspired interface.
- Trending, seasonal, and popular discovery shelves powered by Jikan.
- Search, catalogue browsing, anime details, and official trailer embeds.
- AniVira's D1 catalogue displayed alongside discovery data.
- Metadata, genres, synopsis, posters, banners, episodes, and authorized source links.
- Dedicated watch page with episode/source selection.
- Direct MP4/WebM playback and HLS playback where the provider permits it.
- Device-local watchlist and watched-state preferences.
- Mobile navigation, lazy-loaded artwork, and loading/error states.

### Admin Studio
Open /admin.
- Admin key verification using the private ADMIN_API_KEY environment variable.
- Dashboard and database health status.
- Create, edit, and delete anime.
- Manage episodes and authorized viewing sources.
- Search catalogue records.
- JSON backup export and anime import.
- No public user accounts or sign-in system.
- The admin key is entered into Studio and kept in sessionStorage for the current browser tab only.

## Vercel Environment Variables

Configure these under **Vercel → Project → Settings → Environment Variables**. Add them to Production (and Preview/Development if those environments will be used).

| Variable | Required | Purpose |
|---|---:|---|
| CLOUDFLARE_ACCOUNT_ID | Yes | Cloudflare account ID that owns the D1 database |
| CLOUDFLARE_D1_DATABASE_ID | Yes | UUID of the AniVira D1 database |
| CLOUDFLARE_API_TOKEN | Yes | Private Cloudflare API token with D1 Read and D1 Write permissions |
| ADMIN_API_KEY | Yes | Long random secret used to unlock Admin Studio and authorize write operations |

**Do not** prefix these variables with NEXT_PUBLIC_, VITE_, or any public prefix. Never put them in assets/config.js, HTML, GitHub, or browser localStorage. They are read only by the Vercel serverless function.

### Create the Cloudflare API token

1. In Cloudflare, open **My Profile → API Tokens → Create Token**.
2. Create a custom token with the minimum required permissions: **Account → D1 → Read** and **Account → D1 → Write**.
3. Restrict the token to the account that owns AniVira's D1 database where possible.
4. Copy the token once and add it to Vercel as CLOUDFLARE_API_TOKEN.

Use a separate, randomly generated value for ADMIN_API_KEY. Do not reuse the Cloudflare API token as the Studio password.

## Create and initialize D1

1. In Cloudflare Dashboard, open **Workers & Pages → D1 SQL Database**.
2. Create a database named anivira.
3. Copy the database UUID and account ID into the matching Vercel environment variables.
4. Open the D1 database's SQL console and execute the complete contents of database/schema.sql once.

The initial migration is also available at database/migrations/0001_init.sql. Do not apply the schema and initial migration twice if the tables already exist.

## Deploy to Vercel

1. Import https://github.com/CrazeStudio/AniVira into Vercel.
2. Use the main branch.
3. Select **Other** as the framework preset if prompted.
4. There is no build command and no package installation required.
5. Keep the project root as the Root Directory and deploy.
6. Add the four environment variables above, then redeploy so the serverless function receives them.

Vercel serves the public pages and runs api/[...path].js on the same deployment and domain. Browser requests use same-origin /api/* URLs; no API URL setting is required in Studio.

## First-time Admin Studio access

1. Open https://YOUR-VERCEL-DOMAIN/admin.
2. Enter the exact ADMIN_API_KEY value configured in Vercel.
3. Select **Unlock and verify**.
4. The Studio checks the Vercel API and D1 connection before loading the dashboard.
5. Add anime, episodes, and official/authorized viewing sources.

If environment variables are changed in Vercel, redeploy the project for the new values to take effect.

## API endpoints

### Public GET endpoints
- GET /api/health
- GET /api/anime?limit=24&offset=0&q=...
- GET /api/anime/:id
- GET /api/genres
- GET /api/seasons
- GET /api/featured
- GET /api/episodes?anime_id=...
- GET /api/sources?anime_id=...

### Admin endpoints (Bearer ADMIN_API_KEY required)
- GET /api/admin/verify
- POST /api/admin/anime
- PATCH /api/admin/anime/:id
- DELETE /api/admin/anime/:id
- POST /api/admin/episodes
- PATCH /api/admin/episodes/:id
- DELETE /api/admin/episodes/:id
- POST /api/admin/sources
- PATCH /api/admin/sources/:id
- DELETE /api/admin/sources/:id

The API uses parameterized SQL, server-side admin authorization, input validation, HTTPS URL checks, request-size limits, and no-store responses. Database credentials and the Cloudflare API token never leave the Vercel server.

## Important D1 REST API consideration

Vercel serverless functions access D1 through Cloudflare's D1 REST API because a Vercel function cannot use a Cloudflare Worker D1 binding directly. Cloudflare documents that the REST API is subject to Cloudflare's global API rate limits and is best suited to administrative access. This keeps the requested **single-host Vercel architecture**, but it is a potential throughput bottleneck for a high-traffic public catalogue. Monitor Cloudflare API limits and Vercel function latency as usage grows. A dedicated D1 proxy Worker would remove that constraint but would require a second deployed service, so it is intentionally not part of this design.

## Viewing and content policy

- AniVira does not host copyrighted episodes.
- Add only official or otherwise authorized viewing sources.
- The player opens provider pages when a source is not a directly playable media URL.
- It does not proxy third-party video, bypass DRM, or circumvent provider restrictions.
- Jikan is a public metadata service and may rate-limit requests.
- Watchlists and watched-state preferences are stored locally in the viewer's browser; there is no cross-device account sync.
