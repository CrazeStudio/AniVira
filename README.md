# AniVira

AniVira is a responsive anime discovery and catalogue website with a Vercel-hosted API and PostgreSQL database. It has no viewer accounts and no mandatory viewer sign-in.

## Features

- Responsive anime discovery website with Jikan-powered trending, seasonal and popular shelves.
- Search, catalogue browsing, anime details, trailers and a device-local watchlist.
- AniVira catalogue records, genres, episodes and authorized viewing sources stored in PostgreSQL.
- Dedicated watch page with episode selection and authorized source selection. Direct MP4/WebM and HLS playback are browser/provider dependent.
- AniVira Studio at \`/admin.html\`: anime, episode and source CRUD, database health, JSON export and anime import.
- No public user accounts. Admin write endpoints require a private bearer key.

## Architecture

- Frontend: static HTML/CSS/JavaScript served by Vercel.
- Backend: Vercel Serverless Function at \`api/[...path].js\`.
- Database: PostgreSQL, recommended provider Neon via Vercel Marketplace.
- SQL schema: \`database/schema.postgres.sql\`.
- Public API base: same Vercel origin, configured in \`assets/config.js\`.

There are no Cloudflare Worker or D1 dependencies in the Vercel deployment.

## Deploy on Vercel

1. Import \`CrazeStudio/AniVira\` into Vercel.
2. Keep the project root as the repository root. No frontend build command is required.
3. Add a PostgreSQL database integration. In Vercel, open **Storage / Marketplace Integrations** and provision a Neon PostgreSQL database, then connect it to this project.
4. Add these environment variables in **Project → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| \`DATABASE_URL\` | Neon PostgreSQL connection string (pooled connection string recommended) |
| \`ADMIN_API_KEY\` | Long, random private admin secret |

5. Redeploy after adding environment variables.
6. Open the Neon SQL Editor and execute the complete contents of \`database/schema.postgres.sql\` once.
7. Test \`https://YOUR-PROJECT.vercel.app/api/health\`. A successful response reports \`"database": true\` and \`"provider": "postgresql"\`.
8. Open \`https://YOUR-PROJECT.vercel.app/admin.html\`. In Settings, leave the API base URL as the current Vercel origin and enter the same \`ADMIN_API_KEY\` configured in Vercel. Save and test the connection.

## API

Public GET endpoints:
- \`GET /api/health\`
- \`GET /api/anime?limit=24&offset=0&q=...\`
- \`GET /api/anime/:id\`
- \`GET /api/genres\`
- \`GET /api/seasons\`
- \`GET /api/featured\`
- \`GET /api/episodes?anime_id=...\`
- \`GET /api/sources?anime_id=...\`

Admin endpoints require \`Authorization: Bearer ADMIN_API_KEY\`:
- \`GET /api/admin/verify\`
- \`POST /api/admin/anime\`, \`PATCH /api/admin/anime/:id\`, \`DELETE /api/admin/anime/:id\`
- \`POST /api/admin/episodes\`, \`PATCH /api/admin/episodes/:id\`, \`DELETE /api/admin/episodes/:id\`
- \`POST /api/admin/sources\`, \`PATCH /api/admin/sources/:id\`, \`DELETE /api/admin/sources/:id\`

## Environment variable security

- \`DATABASE_URL\` must exist only in Vercel server-side Environment Variables. Never expose it through \`NEXT_PUBLIC_*\`, frontend JavaScript, or Git.
- \`ADMIN_API_KEY\` must exist only as a Vercel server-side Environment Variable and as a value entered into the Studio's session-only key field. Never commit it.
- The database connection is performed only inside the serverless API function.
- API writes use parameterized SQL, bounded input lengths, URL validation, and authenticated admin routes. Add Vercel Firewall/WAF rate limiting for \`/api/admin/*\` before public production use.

## Important limitations

- AniVira is a catalogue/discovery application; it does not host copyrighted episodes, scrape streaming sites, bypass DRM, or proxy third-party streams. Add only official or otherwise authorized source URLs.
- Browser playback of third-party HLS/media may be blocked by provider CORS, authentication, or playback policy. The official provider link remains available.
- Watchlists and watched-state preferences are stored locally in the viewer's browser; there is no viewer account or cross-device sync.
- Jikan is an external metadata service and may rate-limit requests.
- The repository changes do not provision a Neon database or configure Vercel environment variables automatically. Complete the deployment steps above before expecting live database features.
