const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Root route (to avoid "Cannot GET /")
app.get('/', (req, res) => {
  res.send(`
    <h1>Crown Nexus Proxy</h1>
    <p>Proxy is running. Use it like this:</p>
    <code>https://your-proxy.onrender.com/proxy?url=https://example.com</code>
  `);
});

// The actual proxy endpoint
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const buffer = await response.buffer();

    // Remove security headers that block iframe loading
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Frame-Options', 'ALLOWALL');
    res.set('Content-Security-Policy', "frame-ancestors *");
    res.set('Content-Type', response.headers.get('content-type') || 'text/html');
    res.send(buffer);

  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Crown Nexus proxy running on port ${PORT}`);
});