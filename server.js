const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Root route
app.get('/', (req, res) => {
  res.send(`
    <h1>Crown Nexus Proxy</h1>
    <p>Proxy is running. Use it like this:</p>
    <code>https://your-proxy.onrender.com/proxy?url=https://example.com</code>
  `);
});

// Catch-all route for any path (handles /results, /watch, etc.)
app.get('*', async (req, res) => {
  // If path starts with /proxy, treat as explicit proxy request
  const isProxyPath = req.path === '/proxy';
  
  let targetUrl;
  
  if (isProxyPath) {
    // Explicit proxy request: /proxy?url=https://example.com
    targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');
  } else {
    // Implicit: treat the requested path as a URL to fetch from the original site
    // e.g., /results?search_query=... -> https://www.youtube.com/results?search_query=...
    // Assume the host is the referer's host or default to YouTube
    const referer = req.headers.referer || 'https://www.youtube.com';
    let baseUrl;
    try {
      baseUrl = new URL(referer).origin;
    } catch {
      baseUrl = 'https://www.youtube.com';
    }
    targetUrl = baseUrl + req.url;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': targetUrl
      }
    });

    const buffer = await response.buffer();
    let contentType = response.headers.get('content-type') || 'text/html';

    // If it's HTML, rewrite links so they go through the proxy
    if (contentType.includes('text/html')) {
      let html = buffer.toString('utf8');
      // Replace absolute URLs with proxy URLs
      html = html.replace(/href="https?:\/\/([^"]+)"/g, (match, url) => {
        return `href="/proxy?url=${encodeURIComponent('https://' + url)}"`;
      });
      html = html.replace(/src="https?:\/\/([^"]+)"/g, (match, url) => {
        return `src="/proxy?url=${encodeURIComponent('https://' + url)}"`;
      });
      html = html.replace(/action="https?:\/\/([^"]+)"/g, (match, url) => {
        return `action="/proxy?url=${encodeURIComponent('https://' + url)}"`;
      });
      // Also handle relative URLs by prefixing with the base domain
      html = html.replace(/href="\/([^"]+)"/g, (match, path) => {
        return `href="/proxy?url=${encodeURIComponent(targetUrl.split('/').slice(0,3).join('/') + '/' + path)}"`;
      });
      html = html.replace(/src="\/([^"]+)"/g, (match, path) => {
        return `src="/proxy?url=${encodeURIComponent(targetUrl.split('/').slice(0,3).join('/') + '/' + path)}"`;
      });
      html = html.replace(/action="\/([^"]+)"/g, (match, path) => {
        return `action="/proxy?url=${encodeURIComponent(targetUrl.split('/').slice(0,3).join('/') + '/' + path)}"`;
      });
      // Remove X-Frame-Options and CSP headers
      res.set('Access-Control-Allow-Origin', '*');
      res.set('X-Frame-Options', 'ALLOWALL');
      res.set('Content-Security-Policy', "frame-ancestors *");
      res.set('Content-Type', 'text/html');
      res.send(html);
      return;
    }

    // Non-HTML: just forward the data
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Frame-Options', 'ALLOWALL');
    res.set('Content-Security-Policy', "frame-ancestors *");
    res.set('Content-Type', contentType);
    res.send(buffer);

  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Crown Nexus proxy running on port ${PORT}`);
});