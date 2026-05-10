const express = require('express');
const { fetch } = require('undici'); // ✅ undici is the fastest fetch
const compression = require('compression');
const cors = require('cors');
const { LRUCache } = require('lru-cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Caching config
const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });

app.use(compression());
app.use(cors({ origin: true, credentials: true }));

app.get('/', (req, res) => res.send('Crown Nexus Proxy running.'));

app.all('*', async (req, res) => {
  try {
    let targetUrl;
    if (req.path === '/proxy' && req.query.url) {
      targetUrl = decodeURIComponent(req.query.url);
    } else {
      const referer = req.headers.referer || 'https://www.bing.com';
      targetUrl = new URL(referer).origin + req.url;
    }

    // Check cache
    const cacheKey = `resp:${targetUrl}`;
    const cached = cache.get(cacheKey);
    if (cached && req.method === 'GET') {
      return res.set(cached.headers).status(cached.status).send(cached.body);
    }

    // Fetch with undici
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': targetUrl,
        'Origin': new URL(targetUrl).origin
      }
    });

    const buffer = await response.arrayBuffer();
    const body = Buffer.from(buffer);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
      'Content-Type': response.headers.get('content-type') || 'text/html'
    };

    if (req.method === 'GET') {
      cache.set(cacheKey, { status: response.status, headers, body });
    }

    res.set(headers).status(response.status).send(body);
  } catch (err) {
    res.status(500).send(`Proxy error: ${err.message}`);
  }
});

app.listen(PORT, () => console.log(`⚡ Crown Nexus proxy on port ${PORT}`));