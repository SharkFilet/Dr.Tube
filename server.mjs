import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3737;
const HOST = process.env.HOST || '127.0.0.1';

const YT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Simple 5-minute in-memory cache so flipping tabs feels instant
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  if (cache.size > 120) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { ts: Date.now(), value });
}

/**
 * Encodes YouTube's `sp` protobuf parameter so sort, duration, and upload date
 * can be combined cleanly while restricting results to videos only.
 */
function buildSpParam({ sort = 'relevance', duration = 'any', uploaded = 'any' }) {
  const bytes = [];
  const sortMap = { relevance: 0, rating: 1, date: 2, views: 3 };
  const s = sortMap[sort] ?? 0;
  if (s > 0) {
    bytes.push(0x08, s);
  }

  const filterBytes = [];
  const uploadMap = { hour: 1, today: 2, week: 3, month: 4, year: 5 };
  if (uploadMap[uploaded]) {
    filterBytes.push(0x08, uploadMap[uploaded]);
  }
  // Always restrict to videos (excludes channels/playlists/shelves)
  filterBytes.push(0x10, 0x01);

  const durMap = { short: 1, long: 2, medium: 3 };
  if (durMap[duration]) {
    filterBytes.push(0x18, durMap[duration]);
  }

  if (filterBytes.length > 0) {
    bytes.push(0x12, filterBytes.length, ...filterBytes);
  }

  if (bytes.length === 0) return '';
  return Buffer.from(bytes).toString('base64');
}

function parseViewCount(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/,/g, '').trim().toLowerCase();
  if (cleaned.startsWith('no views')) return 0;
  const numMatch = cleaned.match(/([\d.]+)\s*([kmb])?/);
  if (!numMatch) return null;
  let val = parseFloat(numMatch[1]);
  const suffix = numMatch[2];
  if (suffix === 'k') val *= 1_000;
  else if (suffix === 'm') val *= 1_000_000;
  else if (suffix === 'b') val *= 1_000_000_000;
  return Math.round(val);
}

function parseDurationSeconds(text) {
  if (!text || text.toLowerCase().includes('live') || text.toLowerCase().includes('shorts')) {
    return null;
  }
  const parts = String(text).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || null;
}

function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.simpleText) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  return '';
}

function extractVideosFromInitialData(data) {
  const seen = new Set();
  const videos = [];

  function addVideo(v) {
    if (!v || !v.videoId || seen.has(v.videoId)) return;
    seen.add(v.videoId);

    const title = extractText(v.title);
    if (!title) return;

    const channel =
      extractText(v.ownerText) ||
      extractText(v.longBylineText) ||
      extractText(v.shortBylineText) ||
      'Unknown channel';

    const viewsText =
      extractText(v.viewCountText) || extractText(v.shortViewCountText) || '';
    const published = extractText(v.publishedTimeText) || '';
    let duration = extractText(v.lengthText) || '';
    if (!duration && Array.isArray(v.thumbnailOverlays)) {
      for (const ov of v.thumbnailOverlays) {
        const t = extractText(ov?.thumbnailOverlayTimeStatusRenderer?.text);
        if (t) {
          duration = t;
          break;
        }
      }
    }

    const durationSeconds = parseDurationSeconds(duration);
    const isShort =
      duration.toLowerCase() === 'shorts' ||
      (v.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '').includes('/shorts/') ||
      (durationSeconds !== null && durationSeconds <= 61 && title.includes('#shorts'));

    const thumbList = v.thumbnail?.thumbnails || [];
    const thumbnail =
      thumbList[thumbList.length - 1]?.url ||
      `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

    videos.push({
      id: v.videoId,
      title,
      channel,
      views: viewsText,
      viewCount: parseViewCount(viewsText),
      published,
      duration: duration || (isShort ? 'SHORTS' : ''),
      durationSeconds,
      isShort,
      thumbnail,
    });
  }

  function walk(node, skipShelf = false) {
    if (!node || typeof node !== 'object') return;
    // Skip algorithmically injected "For You" / "People also watched" / "Previously watched" shelves
    if (node.shelfRenderer) {
      const shelfTitle = extractText(node.shelfRenderer.title).toLowerCase();
      if (
        shelfTitle.includes('for you') ||
        shelfTitle.includes('people also watched') ||
        shelfTitle.includes('previously watched') ||
        shelfTitle.includes('channels new to you')
      ) {
        return;
      }
    }
    if (node.reelShelfRenderer) return; // Skip Shorts recommendation shelves

    if (node.videoRenderer) {
      addVideo(node.videoRenderer);
      return;
    }
    if (node.gridVideoRenderer) {
      addVideo(node.gridVideoRenderer);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, skipShelf);
      return;
    }
    for (const key of Object.keys(node)) {
      walk(node[key], skipShelf);
    }
  }

  walk(data);
  return videos;
}

async function fetchYouTubePage(url) {
  const cached = getCached(url);
  if (cached) return cached;

  const res = await fetch(url, { headers: YT_HEADERS });
  if (!res.ok) {
    throw new Error(`YouTube returned HTTP ${res.status}`);
  }
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
  if (!match) {
    throw new Error('Could not parse YouTube page data');
  }
  const data = JSON.parse(match[1]);
  const videos = extractVideosFromInitialData(data);
  setCached(url, videos);
  return videos;
}

const RAW_PREFIXES = ['IMG_', 'DSC_', 'MVI_', 'MOV_', 'VID_', '100_', 'CLIP', 'PICT'];

function randomRawQuery() {
  const prefix = RAW_PREFIXES[Math.floor(Math.random() * RAW_PREFIXES.length)];
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}${digits}`;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (reqUrl.pathname === '/' || reqUrl.pathname === '/index.html') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (reqUrl.pathname === '/api/browse') {
      let q = (reqUrl.searchParams.get('q') || '').trim();
      const mode = reqUrl.searchParams.get('mode') || 'search';
      const sort = reqUrl.searchParams.get('sort') || 'relevance';
      const duration = reqUrl.searchParams.get('duration') || 'any';
      const era = reqUrl.searchParams.get('era') || 'any';
      const maxViews = Number(reqUrl.searchParams.get('maxViews') || 0);
      const hideShorts = reqUrl.searchParams.get('hideShorts') !== 'false';

      if (!q) {
        sendJson(res, 400, { error: 'Missing query parameter' });
        return;
      }

      let videos = [];
      let sourceUrl = '';

      const mergeUnique = (lists) => {
        const seen = new Set();
        const merged = [];
        for (const list of lists) {
          for (const v of list) {
            if (!seen.has(v.id)) {
              seen.add(v.id);
              merged.push(v);
            }
          }
        }
        return merged;
      };

      const buildSearchUrl = (queryStr, spOpts) => {
        const sp = buildSpParam(spOpts);
        return `https://www.youtube.com/results?search_query=${encodeURIComponent(queryStr)}${sp ? `&sp=${encodeURIComponent(sp)}` : ''}`;
      };

      if (mode === 'hashtag' && sort === 'relevance' && duration === 'any' && era === 'any' && maxViews === 0) {
        const cleanTag = q.replace(/^#/, '').replace(/[^a-zA-Z0-9_]/g, '');
        const tagUrl = `https://www.youtube.com/hashtag/${encodeURIComponent(cleanTag)}`;
        const searchUrl = buildSearchUrl(`#${cleanTag}`, { sort: 'relevance', duration: 'any' });
        sourceUrl = tagUrl;
        const [tagVids, searchVids] = await Promise.all([
          fetchYouTubePage(tagUrl).catch(() => []),
          fetchYouTubePage(searchUrl).catch(() => []),
        ]);
        videos = mergeUnique([tagVids, searchVids]);
      } else {
        let effectiveQuery = mode === 'hashtag' ? `#${q.replace(/^#/, '')}` : q;
        let uploaded = 'any';
        const isHistoricalEra = era === '2006-2011' || era === '2012-2016' || era === '2017-2020';

        if (era === '2006-2011') effectiveQuery += ' before:2012';
        else if (era === '2012-2016') effectiveQuery += ' after:2011 before:2017';
        else if (era === '2017-2020') effectiveQuery += ' after:2016 before:2021';
        else if (era === 'month') uploaded = 'month';
        else if (era === 'week') uploaded = 'week';

        sourceUrl = buildSearchUrl(effectiveQuery, { sort, duration, uploaded });

        // When filtering for low-view hidden gems, YouTube's default top-20 relevance results
        // are heavily biased toward viral videos. Fan out across upload-date windows in parallel
        // so we build a rich pool of genuine low-view videos before filtering.
        if (maxViews > 0 && sort !== 'views') {
          const urls = [sourceUrl];
          if (!isHistoricalEra) {
            if (maxViews <= 5000) {
              urls.push(buildSearchUrl(effectiveQuery, { sort: 'date', duration, uploaded: 'today' }));
              urls.push(buildSearchUrl(effectiveQuery, { sort: 'date', duration, uploaded: 'week' }));
              urls.push(buildSearchUrl(effectiveQuery, { sort: 'date', duration, uploaded: 'month' }));
            } else {
              urls.push(buildSearchUrl(effectiveQuery, { sort: 'date', duration, uploaded: 'week' }));
              urls.push(buildSearchUrl(effectiveQuery, { sort: 'date', duration, uploaded: 'month' }));
              urls.push(buildSearchUrl(effectiveQuery, { sort: 'date', duration, uploaded: 'year' }));
            }
          } else {
            urls.push(buildSearchUrl(effectiveQuery, { sort: 'date', duration, uploaded: 'any' }));
          }
          const batches = await Promise.all(urls.map((u) => fetchYouTubePage(u).catch(() => [])));
          videos = mergeUnique(batches);
        } else {
          videos = await fetchYouTubePage(sourceUrl);
        }
      }

      if (hideShorts) {
        videos = videos.filter((v) => !v.isShort);
      }
      if (maxViews > 0) {
        videos = videos.filter((v) => v.viewCount !== null && v.viewCount <= maxViews);
      }

      sendJson(res, 200, {
        query: q,
        mode,
        count: videos.length,
        sourceUrl,
        videos,
      });
      return;
    }

    if (reqUrl.pathname === '/api/roulette') {
      const hideShorts = reqUrl.searchParams.get('hideShorts') !== 'false';
      // Try up to 3 random raw camera filenames until we get real results
      let query = '';
      let videos = [];
      for (let i = 0; i < 3; i++) {
        query = randomRawQuery();
        const sp = buildSpParam({ sort: 'relevance', duration: 'any' });
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(`"${query}"`)}&sp=${encodeURIComponent(sp)}`;
        const found = await fetchYouTubePage(url).catch(() => []);
        const filtered = hideShorts ? found.filter((v) => !v.isShort) : found;
        if (filtered.length >= 3) {
          videos = filtered;
          break;
        }
      }
      sendJson(res, 200, {
        query,
        mode: 'roulette',
        count: videos.length,
        videos,
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dr. Tube running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
