const express = require('express');
const app = express();

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

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const buffer = await response.arrayBuffer();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/html');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(`Proxy error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⚡ Crown Nexus proxy running on port ${PORT}`));