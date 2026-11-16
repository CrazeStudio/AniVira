# AniVira

AniVira is a responsive anime discovery and watchlist website. It is designed as a cinematic anime-catalogue experience with a dark interface, featured anime, discovery shelves, search, seasonal browsing, details and a device-local watchlist.

## Features

- Responsive desktop and mobile layout
- Featured anime hero
- Trending, seasonal and popular anime shelves
- Anime search with debounced requests
- Explore filters and catalogue pagination
- Anime detail dialog with synopsis, metadata, genres and available official trailer embed
- Local watchlist stored in the browser
- Loading and error states

## Run locally

This is a static website. No build step or package installation is required.

1. Clone the repository.
2. Open `index.html` in a browser, or serve the directory with any static HTTP server.
3. Internet access is required to retrieve catalogue data and artwork.

## Data source

Anime catalogue metadata is retrieved from the public Jikan API (MyAnimeList data). The site does not host or proxy anime episodes. Trailer embeds are shown only when the catalogue provides an embed URL. Users should use official, licensed providers for full episodes.

## Deployment

The repository can be deployed as a static site using GitHub Pages, Cloudflare Pages, Netlify or another static hosting provider. Set the publish directory to the repository root.

## Notes

- The watchlist is stored in the current browser using localStorage; it is not synchronized between devices.
- The public catalogue API has rate limits and may occasionally be unavailable.
- No API key or secret is required for the current static version.
