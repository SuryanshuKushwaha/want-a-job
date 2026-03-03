const puppeteer = require('puppeteer');
const { URL } = require('url');
const fs = require('fs').promises;
const path = require('path');

// Map hostname keywords to local site modules
const SITE_MODULES = [
  { key: 'indeed.', module: './sites/indeed' },
  { key: 'internshala', module: './sites/internshala' },
  { key: 'naukri.', module: './sites/naukri' },
  { key: 'linkedin.com', module: './sites/linkedin' },
  { key: 'workindia.', module: './sites/workindia' }
];

function findModuleForSite(siteUrl) {
  try {
    const u = new URL(siteUrl);
    const host = u.hostname.toLowerCase();
    for (const m of SITE_MODULES) {
      if (host.includes(m.key)) return require(m.module);
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function scrapeSite(browser, siteUrl, params) {
  const mod = findModuleForSite(siteUrl);
  if (!mod) return { site: siteUrl, error: 'No scraper module for this site. Add one in src/sites.' };

  const page = await browser.newPage();
  try {
    // basic page hardening to reduce bot blocking
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1200, height: 900 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      page.setDefaultNavigationTimeout(60000);
    } catch (e) {}

    const url = mod.buildSearchUrl(params);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // attempt to load lazy content by scrolling
    try { await autoScroll(page); } catch (e) {}
    // Try site-specific scraper first
    let items = [];
    try {
      items = await mod.scrape(page, siteUrl, params);
    } catch (e) {
      // ignore site scraper errors and try generic fallback
    }

    // If site-specific scraper returned nothing, try a generic heuristic scraper
    if (!items || !items.length) {
      try {
        items = await genericScrape(page, url);
      } catch (e) { /* ignore fallback errors */ }
    }

    try { await page.close(); } catch (e) {}
    return { site: siteUrl, url, items };
  } catch (err) {
    try { await page.close(); } catch (e) {}
    return { site: siteUrl, error: err.message || String(err) };
  }
}

async function genericScrape(page, siteUrl) {
  const items = await page.evaluate(() => {
    const results = [];
    // Broad heuristics for job links/titles on many sites
    const anchorSelectors = ['a[href]', 'a.job', 'a[href*="/job" i]', 'a[href*="/jobs" i]'];
    const anchors = new Set();
    for (const sel of anchorSelectors) {
      const nodes = Array.from(document.querySelectorAll(sel));
      for (const n of nodes) anchors.add(n);
      if (anchors.size > 50) break;
    }

    const candidates = Array.from(anchors).slice(0, 200);
    for (const a of candidates) {
      try {
        const title = (a.innerText || '').trim();
        // try to find surrounding company/location text
        const parent = a.closest('div') || a.parentElement || document.body;
        const companyEl = parent.querySelector('.company, .company-name, .org, .companyName') || null;
        const locationEl = parent.querySelector('.location, .loc, .job-location') || null;
        const company = companyEl ? (companyEl.innerText || '').trim() : null;
        const location = locationEl ? (locationEl.innerText || '').trim() : null;
        const href = a.getAttribute('href') || null;
        if (title) results.push({ title, company, location, href });
      } catch (e) { /* ignore element errors */ }
    }

    return results;
  });

  const normalized = (items || []).map(it => {
    let link = it.href || '';
    try { if (link && !link.startsWith('http')) link = new URL(link, siteUrl).toString(); } catch (e) {}
    return { title: it.title, company: it.company, location: it.location, link };
  });

  return normalized;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight || document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        total += distance;
        if (total >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  });
}

async function scrape(params) {
  const defaultSites = [
    'https://internshala.com',
    'https://www.naukri.com',
    'https://www.linkedin.com/jobs',
    'https://www.workindia.in'
  ];
  // Whitelist - only these hostnames will be scraped
  const ALLOWED_HOST_KEYS = ['indeed.', 'internshala', 'naukri.', 'linkedin.com', 'workindia.'];

  // Helper to normalize an entry into a full URL string when possible
  function normalizeToUrlString(s) {
    if (!s || typeof s !== 'string') return null;
    try {
      // if it's already an absolute URL
      const u = new URL(s);
      return u.toString();
    } catch (e) {
      // try prefixing https://
      try {
        const u2 = new URL('https://' + s.replace(/^\/+/, ''));
        return u2.toString();
      } catch (e2) {
        return null;
      }
    }
  }

  function isAllowedSite(urlStr) {
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      return ALLOWED_HOST_KEYS.some(k => h.includes(k));
    } catch (e) { return false; }
  }

  const candidateSites = (params && Array.isArray(params.sites) && params.sites.length) ? params.sites : defaultSites;
  const sites = [];
  const rejected = [];
  for (const s of candidateSites) {
    const n = normalizeToUrlString(s);
    if (n && isAllowedSite(n)) sites.push(n);
    else rejected.push(s);
  }

  // If no allowed sites after filtering, return a structured response rather than proceeding
  if (!sites.length) {
    return { results: [], siteErrors: [{ error: 'No allowed sites selected. Allowed hosts: ' + ALLOWED_HOST_KEYS.join(', '), rejected }], savedFile: null };
  }
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  // simple concurrency pool (avoid p-limit ESM warnings)
  const concurrency = 3;
  const results = [];
  const queue = sites.slice();

  async function worker() {
    while (queue.length) {
      const site = queue.shift();
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await scrapeSite(browser, site, params);
        results.push(r);
      } catch (e) {
        results.push({ site, error: e && e.message ? e.message : String(e) });
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  await browser.close();

  const aggregated = [];
  const errors = [];
  for (const r of results) {
    if (r.error) errors.push(r);
    else aggregated.push(...(r.items || []));
  }

  const out = { results: aggregated, siteErrors: errors };

  // Persist the scrape to a timestamped JSON file in data/
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `scrape-${ts}.json`;
    const filePath = path.join(dataDir, fileName);
    await fs.writeFile(filePath, JSON.stringify({ params, results: aggregated, siteErrors: errors }, null, 2), 'utf8');

    // Remove previous scrape files, keep only the newly created file
    try {
      const files = await fs.readdir(dataDir);
      for (const f of files) {
        if (f === fileName) continue;
        if (f.startsWith('scrape-') && f.endsWith('.json')) {
          try { await fs.unlink(path.join(dataDir, f)); } catch (e) { /* ignore individual unlink errors */ }
        }
      }
    } catch (e) {
      // ignore cleanup errors
    }

    out.savedFile = filePath;
  } catch (e) {
    // ignore persistence errors but don't fail the scrape
  }

  return out;
}

module.exports = { scrape };
