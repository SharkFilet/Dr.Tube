# Dr. Tube

> **Rx: No Algo.** A lightweight, zero-dependency local web app for browsing YouTube by categories, `#hashtags`, eras, and low view counts—without feeds, logins, API keys, or algorithm recommendations.

## Features
- **22 Directory Categories & 150+ Sub-Topics**: Film & Animation, Craft & Wood, Restoration, Weird Physics, Retro Tech, Obscure History, Sound Oddities, Slow TV, Vintage TV Archives, and more.
- **90+ Curated `#Hashtags` + Any Custom `#tag`**: Browse YouTube's hashtag feeds with Shorts shelves and "For You / People also watched" injections stripped out.
- **Anti-Algorithm Filters**: Combine Sort (Relevance / Newest / Most Viewed), Length (<4m, 4–20m, 20m+ deep dives), Era (`2006–2011` Golden Era time machine), **Hidden Gems** (Under 100K / 25K / 5K / 1K views), and Hide Shorts.
- **Raw Upload Roulette**: Searches random camera filenames (`IMG_XXXX`, `MVI_XXXX`, `DSC_XXXX`) to surface raw, uncurated uploads.
- **Distraction-Free Theater & Local Watch Later**: Watch in a clean `youtube-nocookie.com` modal (no sidebar, no comments, no autoplay) and save videos locally in `localStorage`.

## Quick Start

Requires **Node.js 18+** (zero npm packages to install):

```bash
git clone https://github.com/SharkFilet/Dr.Tube.git
cd Dr.Tube
node server.mjs
```

Then open **http://localhost:3737** in your browser.

On macOS, you can also double-click `Launch Dr. Tube.command`.

## Configuration

| Env Var | Default | Description |
| --- | --- | --- |
| `PORT` | `3737` | Port to listen on |
| `HOST` | `127.0.0.1` | Bind address (set `0.0.0.0` for LAN or container hosting) |

## License

MIT
