const express = require('express');
const { fetch } = require('undici'); // Fastest Node.js fetch
const compression = require('compression');
const cors = require('cors');
const { LRUCache } = require('lru-cache');
const app = express();

// ===== Config =====
const PORT = process.env.PORT || 3000;
const CACHE_TTL = 60 * 60; // 1 hour
const TIMEOUT = 15000; // 15 seconds

// ===== Advanced caching =====
const cache = new LRUCache({
  max: 500, // max items in cache
  ttl: CACHE_TTL * 1000,
  allowStale: false,
  updateAgeOnGet: false,
  sizeCalculation: (value, key) => value.length || 1,
  maxSize: 50 * 1024 * 1024, // 50MB cache size limit
});

// ===== Compression & CORS =====
app.use(compression({ level: 9 })); // Best compression speed/ratio
app.use(cors({ origin: true, credentials: true }));

// ===== Health check =====
app.get('/health', (req, res) => res.send('OK'));

// ===== Root route =====
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
  <head><title>Crown Nexus Proxy</title></head>
  <body style="background:#0c0c1e;color:#e0efff;font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;flex-direction:column;">
    <h1 style="font-size:2.5rem;color:#00d2ff;">⚡ Crown Nexus Proxy</h1>
    <p style="color:#888;">Ultra‑fast · Smart‑cached · Utopia‑rewrite</p>
    <code style="background:#1a1a2e;padding:12px;border-radius:6px;margin-top:12px;">/proxy?url=https://example.com</code>
  </body>
</html>`);
});

// ===== Streaming fetch wrapper =====
async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...options.headers
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ===== HTML link rewriting (Utopia‑style) =====
function rewriteHTML(html, baseUrl, targetUrl) {
  const origin = new URL(targetUrl).origin;
  
  // Rewrite standard tags
  let modified = html
    .replace(/href="((?:https?:)?\/\/[^"]+)"/g, (match, url) => {
      const full = url.startsWith('//') ? `https:${url}` : url;
      const finalUrl = new URL(full, origin).href;
      return `href="/proxy?url=${encodeURIComponent(finalUrl)}"`;
    })
    .replace(/src="((?:https?:)?\/\/[^"]+)"/g, (match, url) => {
      const full = url.startsWith('//') ? `https:${url}` : url;
      const finalUrl = new URL(full, origin).href;
      return `src="/proxy?url=${encodeURIComponent(finalUrl)}"`;
    })
    .replace(/action="((?:https?:)?\/\/[^"]+)"/g, (match, url) => {
      const full = url.startsWith('//') ? `https:${url}` : url;
      const finalUrl = new URL(full, origin).href;
      return `action="/proxy?url=${encodeURIComponent(finalUrl)}"`;
    })
    // Handle root‑relative /paths
    .replace(/href="\/([^"]+)"/g, (match, path) => {
      const finalUrl = new URL(path, origin).href;
      return `href="/proxy?url=${encodeURIComponent(finalUrl)}"`;
    })
    .replace(/src="\/([^"]+)"/g, (match, path) => {
      const finalUrl = new URL(path, origin).href;
      return `src="/proxy?url=${encodeURIComponent(finalUrl)}"`;
    })
    .replace(/action="\/([^"]+)"/g, (match, path) => {
      const finalUrl = new URL(path, origin).href;
      return `action="/proxy?url=${encodeURIComponent(finalUrl)}"`;
    })
    // Handle meta refresh redirects
    .replace(/<meta\s+http-equiv="refresh"\s+content="[^"]*url=([^"]+)"/gi, (match, url) => {
      const finalUrl = new URL(url, origin).href;
      return `<meta http-equiv="refresh" content="0;url=/proxy?url=${encodeURIComponent(finalUrl)}"`;
    });

  // Also rewrite inline scripts that set window.location
  // but we can't safely do that universally without a parser.
  return modified;
}

// ===== Catch‑all proxy handler =====
app.all('*', async (req, res) => {
  try {
    // 1. Determine target URL
    let targetUrl;
    if (req.path === '/proxy' && req.query.url) {
      targetUrl = decodeURIComponent(req.query.url);
    } else {
      // Fallback: use referer or default to Google
      const referer = req.headers.referer || 'https://www.google.com';
      const base = new URL(referer).origin;
      targetUrl = base + req.url;
    }

    // 2. Validate URL
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Unsupported protocol');
    }

    // 3. Check cache
    const cacheKey = `RESP:${targetUrl}`;
    const cached = cache.get(cacheKey);
    if (cached && req.method === 'GET') {
      res.set(cached.headers);
      res.status(cached.status);
      res.send(cached.body);
      return;
    }

    // 4. Fetch with streaming and timeout
    const response = await fetchWithTimeout(targetUrl, {
      method: req.method,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': targetUrl,
        'Origin': new URL(targetUrl).origin,
        ...(req.method === 'POST' && { 'Content-Type': 'application/x-www-form-urlencoded' })
      },
      body: req.method === 'POST' ? req.body : undefined
    });

    // 5. Read body as buffer
    const buffer = await response.arrayBuffer();
    const body = Buffer.from(buffer);

    // 6. Prepare response headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
      'Cache-Control': 'no-cache, must-revalidate, public'
    };

    const contentType = response.headers.get('content-type') || 'text/html';

    // 7. If HTML, rewrite to keep all links inside the proxy
    let finalBody = body;
    if (contentType.includes('text/html')) {
      const html = body.toString('utf8');
      finalBody = Buffer.from(rewriteHTML(html, targetUrl, targetUrl));
      headers['Content-Type'] = 'text/html; charset=utf-8';
    } else {
      headers['Content-Type'] = contentType;
    }

    // 8. Store in cache (only GET)
    if (req.method === 'GET') {
      cache.set(cacheKey, { status: response.status, headers, body: finalBody });
    }

    // 9. Send response
    res.set(headers);
    res.status(response.status);
    res.send(finalBody);

  } catch (err) {
    console.error('Proxy error:', err.message);
    
    // Try fallback to corsproxy.io if our proxy fails
    if (req.query.url) {
      try {
        const fallbackUrl = `https://corsproxy.io/?${encodeURIComponent(req.query.url)}`;
        const resp = await fetchWithTimeout(fallbackUrl, { method: req.method });
        const buf = await resp.arrayBuffer();
        res.set({
          'Access-Control-Allow-Origin': '*',
          'X-Frame-Options': 'ALLOWALL',
          'Content-Security-Policy': "frame-ancestors *",
          'Content-Type': resp.headers.get('content-type') || 'text/html'
        });
        res.status(resp.status);
        res.send(Buffer.from(buf));
        return;
      } catch (fallbackErr) {
        // fallback also failed
      }
    }

    res.status(500).send(`Proxy error: ${err.message}`);
  }
});

// ===== Start server =====
app.listen(PORT, () => {
  console.log(`⚡ Crown Nexus Proxy running on port ${PORT}`);
});