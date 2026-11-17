# AniVira

A lightweight anime discovery site. Public anime metadata and catalogues come from AniList; administrators manage the site's anime catalogue and viewing links in a separate white admin studio. The public site is dark and restrained.

## Branch workflow
- `Development`: active work and preview deployments.
- `main`: production publishing branch. Merge tested Development changes into main to publish.

## Stack
- Static HTML, CSS and browser JavaScript.
- Vercel Node.js serverless functions under `/api`.
- Cloudflare D1 accessed through the Cloudflare REST API.
- AniList GraphQL API for anime search and catalogue metadata.

## Environment variables
Set these in Vercel (and keep them out of Git):
- `CF_ACCOUNT_ID`: Cloudflare account ID.
- `CF_DATABASE_ID`: D1 database UUID.
- `CF_API_TOKEN`: Cloudflare API token with D1 read/write permissions for this database.
- `ADMIN_PASSWORD_HASH`: PBKDF2-SHA256 password hash in the format `pbkdf2-sha256$iterations$salt_base64$hash_base64`.
- `SESSION_SECRET`: long random secret used to sign the HttpOnly admin session cookie (at least 32 random bytes recommended).

Generate a password hash locally with Node.js:

```js
const crypto = require('node:crypto');
const password = process.argv[2];
if (!password) throw new Error('Pass a password as the first argument');
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');
console.log(['pbkdf2-sha256', 310000, salt.toString('base64'), hash.toString('base64')].join('$'));
```

Run with `node hash-password.js 'your-long-password'`, then store the printed value as `ADMIN_PASSWORD_HASH`. Do not commit the generated hash or password.

Generate `SESSION_SECRET` with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.

## D1 setup
Create a Cloudflare D1 database, then execute the SQL in `schema.sql` in the D1 console. The API also creates the tables/index automatically on first request. No viewer accounts are implemented.

## Routes
- `/`: homepage and catalogues.
- `/search`: AniList search.
- `/admin`: private admin studio.
- `/api/anilist?action=home`: homepage catalogues and configured sources.
- `/api/anilist?action=search&q=...`: AniList search.
- `/api/admin`: authenticated admin actions.

## Deployment
Import this repository into Vercel. Set the environment variables for the deployment environment. Use `Development` for preview builds and set `main` as the production branch. AniList is a third-party metadata service; viewing URLs are supplied and managed by the site administrator. Only add sources you have permission to link to.

## Security notes
The admin password is never shipped to the browser. Successful login sets a signed, HttpOnly, Secure, SameSite=Strict cookie. Admin writes require the session and same-origin requests. Use HTTPS, keep Cloudflare tokens private, and rotate the session secret to invalidate existing sessions. This initial version does not include persistent login throttling or user accounts.