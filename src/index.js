const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { scrape } = require('./scraper');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/api/search', async (req, res) => {
  try {
    const params = req.body || {};
    // Expected params: role, location, salaryRange, jobType, experienceLevel, sites: [url,...]
    // `sites` is optional: when omitted scraper will use default configured sites

    const result = await scrape(params);
    res.json(result);
  } catch (err) {
    console.error('Search error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function startServer(port, attemptsLeft = 5) {
  const server = app.listen(port, () => {
    console.log(`Job scraper API listening on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      setTimeout(() => startServer(port + 1, attemptsLeft - 1), 200);
    } else {
      console.error('Server error', err);
      process.exit(1);
    }
  });

  return server;
}

startServer(PORT);
