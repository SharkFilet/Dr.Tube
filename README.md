# Dr. Tube

> **Rx: No Algo.** A lightweight, single-file HTML web app for browsing YouTube by categories, `#hashtags`, eras, and low view counts—without feeds, logins, API keys, or algorithm recommendations.

## Use It Live (No Install or GitHub Needed)

Open **[https://sharkfilet.github.io/Dr.Tube/](https://sharkfilet.github.io/Dr.Tube/)** straight in any desktop or mobile browser. Nothing to clone, install, or configure.

## Deploy Your Own Copy in Seconds

Because the entire frontend lives inside a single standalone [`index.html`](./index.html) file, anyone can host their own static copy without a backend:

1. **Direct HTML Download (Zero Git):** Download `index.html` (or click **⚙ → Download Standalone HTML** in the sidebar) and either open it directly in your browser or drag-and-drop it onto Netlify Drop, Cloudflare Pages, Vercel, or Neocities.
2. **GitHub Pages (Free Hosting):** Fork this repository → open **Settings → Pages → Build and deployment → Source** → select **GitHub Actions**. Pushes to `main` automatically publish to `https://<your-username>.github.io/Dr.Tube/`.

> **How Static Browser Mode Works:** When opened on GitHub Pages or directly as an HTML file (`file://`), `index.html` queries public CORS-enabled Invidious/Piped mirrors directly from the visitor's browser (with auto-failover, a custom mirror field stored only in your browser's `localStorage`, and direct anti-algorithm YouTube fallback links if public mirrors are busy).

## Features

- **22 Directory Categories & 150+ Sub-Topics:** Film & Animation, Craft & Wood, Restoration, Weird Physics, Retro Tech, Obscure History, Sound Oddities, Slow TV, Vintage TV Archives, and more.
- **90+ Curated `#Hashtags` + Any Custom `#tag`:** Browse YouTube hashtags without Shorts shelves or personalized recommendation injections.
- **Anti-Algorithm Filters:** Combine Sort (Relevance / Newest / Most Viewed), Length (<4m, 4–20m, 20m+ deep dives), Era (`2006–2011` Golden Era time machine), **Hidden Gems** (Under 100K / 25K / 5K / 1K views), and Hide Shorts.
- **Raw Upload Roulette:** Searches random camera filenames (`IMG_XXXX`, `MVI_XXXX`, `DSC_XXXX`) to surface raw, uncurated uploads.
- **Distraction-Free Theater & Local Watch Later:** Watch in a clean `youtube-nocookie.com` modal (no sidebar, no comments, no autoplay) and save videos locally in `localStorage`.

## Optional: Run Locally with Node.js (Direct Mode)

If you prefer direct parsing without relying on public community mirrors, **Node.js 18+** runs the built-in local server (`server.mjs`) with zero npm packages:

```bash
git clone https://github.com/SharkFilet/Dr.Tube.git
cd Dr.Tube
node server.mjs
```

Then open **http://localhost:3737** in your browser. On macOS, you can also double-click `Launch Dr. Tube.command`.

## Security & Privacy Notes

- **No Author ISP, IP, or Ports Exposed:** GitHub Pages serves static HTML exclusively through GitHub's CDN (`sharkfilet.github.io`) and runs queries directly from the visitor's browser—never through the repository owner's network.
- **Loopback-Only Local Server:** If you choose to run `server.mjs` on your own machine, `HOST` defaults to `127.0.0.1` (localhost loopback only, unreachable from your LAN or public internet unless you explicitly override `HOST`).
- **Zero Telemetry / API Keys:** Watch Later items and optional custom mirror URLs are stored solely in your own browser's `localStorage`.

| Env Var | Default | Description |
| --- | --- | --- |
| `PORT` | `3737` | Local HTTP port for `server.mjs` |
| `HOST` | `127.0.0.1` | Bind address (`127.0.0.1` is loopback-only; set `0.0.0.0` only for LAN/container hosting) |

## License

MIT
