# AniVira

AniVira is a lightweight **anime discovery and authorized-video viewing website**. It is not an anime-file host, scraper, or unofficial streaming-link aggregator.

## What AniVira does

- The public homepage shows AniList-powered catalogues: Trending, Popular, This Season, Top Rated and Recently Updated.
- The homepage also shows the administrator-curated AniVira Collection and all configured viewing links.
- Search uses AniList's GraphQL API.
- Anime detail pages show AniList metadata, synopsis, genres, score and authorized viewing options.
- Viewing pages use YouTube's privacy-enhanced embedded player.
- The white \`/admin\` studio manages anime, seasons, episodes, authorized YouTube videos and playlist imports (up to 250 items per import).
- Video uploads, proxying, account registration and viewer profiles are not part of this project.

Only add official or otherwise authorized YouTube videos. A public YouTube URL is not, by itself, proof of permission to distribute or embed the content.

## Languages and architecture

| Area | Technology |
|---|---|
| Website and admin interface | HTML5, CSS3, vanilla JavaScript |
| Backend | JavaScript / Node.js Vercel serverless functions |
| Database | Cloudflare D1 (SQLite-compatible SQL) |
| Anime data | AniList GraphQL API |
| Hosting and clean routes | Vercel, configured in \`vercel.json\` |

No frontend framework or build step is required. Static pages live at the repository root, browser scripts and styles are in \`assets/\`, and serverless endpoints are in \`api/\`.

## Environment variables

Add these values in Vercel Project Settings → Environment Variables. Do not commit secrets to GitHub.

- \`CF_ACCOUNT_ID\`: Cloudflare account ID.
- \`CF_DATABASE_ID\`: Cloudflare D1 database ID.
- \`CF_API_TOKEN\`: Cloudflare API token with D1 read/write permissions for the database.
- \`ADMIN_PASSWORD_HASH\`: PBKDF2-SHA256 hash of the administrator password.
- \`SESSION_SECRET\`: random secret of at least 32 bytes, used to sign the admin session cookie.
- \`YOUTUBE_API_KEY\`: server-side YouTube Data API v3 key for playlist imports. Never expose it in browser code.

Generate the admin password hash in a trusted Node.js terminal:

\`\`\`sh
node scripts/hash-password.js
\`\`\`

The script prompts for the password without echoing it, then prints the PBKDF2 hash. Save that output as \`ADMIN_PASSWORD_HASH\`. Never put the plain password or generated hash in source code.

Generate a session secret with:

\`\`\`sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
\`\`\`

Set all five environment variables for both Preview and Production environments as appropriate. Redeploy after changing environment variables.

## Cloudflare D1 setup

1. Create a D1 database in the Cloudflare dashboard.
2. Copy its database ID and your Cloudflare account ID into Vercel.
3. Create an API token limited to D1 read/write access and add it as \`CF_API_TOKEN\`.
4. Run \`schema.sql\` in the D1 SQL console.

The API also creates missing tables and indexes on first use and migrates existing databases by adding the nullable \`sources.episode_id\` column. Existing unassigned video links remain available as legacy videos. The \`admin_attempts\` table stores HMAC-hashed network identifiers and is used to throttle repeated failed admin logins.

## Routes

- \`/\` — public homepage and catalogue sections.
- \`/search\` — anime search.
- \`/anime?id=ANILIST_ID\` — anime detail page.
- \`/watch?id=SOURCE_ID\` — YouTube embedded viewing page.
- \`/admin\` — private admin studio.
- \`/rights\` — project purpose and video-link policy.
- \`/api/anilist?action=home\` — public catalogues, managed collection and video links.
- \`/api/anilist?action=search&q=TITLE\` — AniList search.
- \`/api/anilist?action=detail&id=ANILIST_ID\` — anime metadata and available videos.
- \`/api/anilist?action=source&id=SOURCE_ID\` — validated YouTube playback information.
- \`/api/admin\` — same-origin, session-protected admin operations.

## Deployment

1. Import \`CrazeStudio/AniVira\` into Vercel.
2. Set \`main\` as the Production Branch.
3. Keep \`Development\` as the working branch and use its Preview deployment for testing.
4. Add all environment variables and redeploy.
5. Visit the Preview URL, test search and the admin flow, then verify the D1 catalogue.
6. Merge the tested \`Development\` changes into \`main\` only when ready to publish.

The repository's \`vercel.json\` configures clean routes and baseline browser security headers. Vercel automatically detects the Node.js functions in \`api/\`; no custom build command is needed.

## Security and operational notes

- Admin passwords are verified server-side using PBKDF2-SHA256.
- The admin session is signed and stored in an HttpOnly, Secure, SameSite=Strict cookie.
- Admin POST requests require a same-origin Origin header and a valid session (except login/logout).
- Repeated failed logins are throttled using D1; only an HMAC hash of the network identifier is stored.
- Viewing URLs are accepted only when they resolve to a YouTube video ID. Other hosts and playlist-only links are rejected. Admin video additions and playlist imports also verify that videos are public or unlisted, embeddable, and not region-blocked in India.
- Playlist imports map episode numbers from explicit title markers such as `Episode 12` or `S1E12`; ambiguous titles, deleted/private videos, and non-embeddable videos are skipped rather than assigned the wrong episode by playlist position.
- The admin availability cleanup removes unavailable source links and prunes empty episodes/seasons; an anime is removed only when it has no remaining video sources.
- The language field describes the linked YouTube upload. It cannot select or force an audio track inside YouTube's player.
- The embedded player uses \`youtube-nocookie.com\`; YouTube still controls playback, availability, advertising and regional restrictions.
- AniVira does not verify copyright ownership automatically. The administrator is responsible for confirming authorization before adding each video.
- Keep the Cloudflare token and session secret private. Rotating \`SESSION_SECRET\` invalidates existing admin sessions.
