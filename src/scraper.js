const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());
const puppeteer = puppeteerExtra;
const { URL } = require('url');
const fs = require('fs').promises;
const fsSync = require('fs');
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

      // Evasion: remove webdriver flag and expose common navigator properties
      await page.evaluateOnNewDocument(() => {
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        } catch (e) {}
        try {
          window.navigator.languages = ['en-US', 'en'];
        } catch (e) {}
        try {
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        } catch (e) {}
      });
    } catch (e) {}

    const url = mod.buildSearchUrl(params);
    // Wait for network to be mostly idle to allow client-side rendering
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // extra wait to allow lazy-loaded content and client-side rendering
    try { await page.waitForTimeout(1500); } catch (e) {}

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
        const href = (a.getAttribute('href') || '').trim();
        const title = (a.innerText || '').trim();
        // Filter out non-job links: prefer anchors that contain job-like patterns
        const hrefLower = href.toLowerCase();
        const looksLikeJob = hrefLower.includes('job-listings') || hrefLower.includes('/job-') || hrefLower.includes('/jobs/') || /\/jobs\b/.test(hrefLower) || /job\-listings/.test(hrefLower) || title.length > 30;
        if (!href || !looksLikeJob) continue;

        // try to find surrounding company/location text
        const parent = a.closest('div') || a.parentElement || document.body;
        const companyEl = parent.querySelector('.company, .company-name, .org, .companyName, .companyInfo, .company_info') || null;
        const locationEl = parent.querySelector('.location, .loc, .job-location, .companyLocation') || null;
        const company = companyEl ? (companyEl.innerText || '').trim() : null;
        const location = locationEl ? (locationEl.innerText || '').trim() : null;

        // normalize title: sometimes anchors are company links; skip those with very short text
        if (!title || title.length < 3) continue;

        results.push({ title, company, location, href });
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
    'https://www.naukri.com',
    'https://www.linkedin.com/jobs',
    'https://www.indeed.com'
  ];
  // Whitelist - only these hostnames will be scraped
  const ALLOWED_HOST_KEYS = ['naukri.', 'linkedin.com', 'indeed.'];

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
  const chromeUserDataDir = process.env.CHROME_USER_DATA_DIR || 'C:\\Users\\surya\\AppData\\Local\\Google\\Chrome\\User Data';
  const launchOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      `--user-data-dir=${chromeUserDataDir}`,
      '--profile-directory=Default'
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  else {
    // try common Windows Chrome paths
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ];
    for (const c of candidates) {
      try { if (fsSync.existsSync(c)) { launchOpts.executablePath = c; break; } } catch (e) {}
    }
  }
  const browser = await puppeteer.launch(launchOpts);

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
