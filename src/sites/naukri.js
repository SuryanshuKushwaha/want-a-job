const { URL } = require('url');
// Naukri minimal scraper module
function buildSearchUrl(params = {}) {
  const base = 'https://www.naukri.com/jobs';
  const qs = [];
  if (params.role) qs.push(`k=${encodeURIComponent(params.role)}`);
  if (params.location) qs.push(`l=${encodeURIComponent(params.location)}`);
  if (params.jobType) qs.push(`jobType=${encodeURIComponent(params.jobType)}`);
  return base + (qs.length ? ('?' + qs.join('&')) : '');
}

async function scrape(page, siteUrl = 'https://www.naukri.com') {
  const items = await page.evaluate(async () => {
    const results = [];
    const selectors = ['div.card', '.jobTuple', '.list', '.jobInfo', '.jobTupleHeader'];
    let nodes = [];
    for (const sel of selectors) {
      nodes = Array.from(document.querySelectorAll(sel));
      if (nodes && nodes.length) break;
    }

    function findInAncestors(node, selectors) {
      let cur = node;
      for (let i = 0; i < 4 && cur; i++) {
        for (const sel of selectors) {
          const found = cur.querySelector(sel);
          if (found) return found;
        }
        cur = cur.parentElement;
      }
      return null;
    }

    nodes.forEach(node => {
      try {
        const anchor = node.querySelector('a') || node.querySelector('h3 a') || node.querySelector('a.title');
        const titleEl = node.querySelector('a') || node.querySelector('.title') || node.querySelector('h3') || anchor;
        const companyEl = node.querySelector('.company') || node.querySelector('.companyName') || node.querySelector('.org') || node.querySelector('.companyInfo a') || findInAncestors(node, ['.company', '.companyName', '.org', '.companyInfo', '.company_info']);
        const locationEl = node.querySelector('.location') || node.querySelector('.loc') || node.querySelector('.meta') || node.querySelector('.ellipsis') || Array.from(node.querySelectorAll('[class]')).find(el => /\b(loc|location|place)\b/i.test(el.className)) || node.querySelector('[data-location]') || node.querySelector('[aria-label*="location"]') || findInAncestors(node, ['.location', '.loc', '.job-location', '.companyLocation']);

        const title = titleEl ? titleEl.innerText.trim() : (anchor ? anchor.innerText.trim() : null);
        const company = companyEl ? companyEl.innerText.trim() : null;
        const location = locationEl ? locationEl.innerText.trim() : null;
        const href = anchor ? (anchor.getAttribute('href') || null) : null;

        if (title) {
          results.push({ title, company, location, href });
        }
      } catch (e) { /* ignore */ }
    });

    // If company/location missing, try fetching detail pages to extract them
    const parser = html => new DOMParser().parseFromString(html, 'text/html');
    const detailSelectors = {
      company: ['.jd-header-comp-name', '.company', '.companyName', '.org', '.topcard__org-name'],
      location: ['.location', '.job-location', '.loc', '.locationText', '.topcard__flavor--bullet']
    };

    const fetchDetail = async (href) => {
      try {
        const res = await fetch(href, { credentials: 'omit' });
        const txt = await res.text();
        const doc = parser(txt);
        const out = {};
        for (const sel of detailSelectors.company) {
          const el = doc.querySelector(sel);
          if (el && el.textContent && el.textContent.trim()) { out.company = el.textContent.trim(); break; }
        }
        for (const sel of detailSelectors.location) {
          const el = doc.querySelector(sel);
          if (el && el.textContent && el.textContent.trim()) { out.location = el.textContent.trim(); break; }
        }
        return out;
      } catch (e) {
        return {};
      }
    };

    const limited = results.slice(0, 40);
    await Promise.all(limited.map(async (r, idx) => {
      if ((!r.company || !r.location) && r.href) {
        const detail = await fetchDetail(r.href);
        if (detail.company && !r.company) r.company = detail.company;
        if (detail.location && !r.location) r.location = detail.location;
      }
    }));

    return results;
  });

  const normalized = (items || []).map(it => {
    let link = it.href || '';
    try {
      if (link && !link.startsWith('http')) link = new URL(link, 'https://www.naukri.com').toString();
    } catch (e) {}
    return { title: it.title, company: it.company, location: it.location, link };
  });

  // If company/location still missing, open detail pages in browser to extract them.
  try {
    // Try heuristic extraction from link when detail pages are blocked.
    const extractCompanyFromLink = link => {
      try {
        const p = new URL(link).pathname.split('/').filter(Boolean).pop();
        if (!p) return null;
        let seg = p.replace(/^job-listings-/, '');
        seg = seg.replace(/-remote-.*$/i, '');
        seg = seg.replace(/-\d+$/i, '');
        const tokens = seg.split('-').filter(Boolean);
        if (!tokens.length) return null;
        let companyTokens = tokens.length >= 4 ? tokens.slice(-4) : tokens.length === 3 ? tokens.slice(-3) : tokens.slice(-2);
        let company = companyTokens.join(' ');
        company = company.replace(/\byears?\b/i, '').replace(/\bto\b/i, '').trim();
        return company || null;
      } catch (e) { return null; }
    };

    for (const it of normalized) {
      if (!it.company && it.link) {
        const c = extractCompanyFromLink(it.link);
        if (c) it.company = c;
      }
    }
    const browser = page.browser && page.browser();
    if (browser) {
      const detailCompanySelectors = ['.jd-header-comp-name', '.companyName', '.company', '.org', '.topcard__org-name'];
      const detailLocationSelectors = ['.location', '.job-location', '.loc', '.locationText', '.topcard__flavor--bullet'];
      const limit = Math.min(normalized.length, 20);
      for (let i = 0; i < limit; i++) {
        const it = normalized[i];
        if ((!it.company || !it.location) && it.link) {
          const dp = await browser.newPage();
          try {
            await dp.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
            await dp.goto(it.link, { waitUntil: 'networkidle2', timeout: 30000 });
            await dp.waitForTimeout ? dp.waitForTimeout(1000) : new Promise(r => setTimeout(r, 1000));
            if (!it.company) {
              for (const sel of detailCompanySelectors) {
                try {
                  const v = await dp.$eval(sel, el => el.innerText.trim()).catch(() => null);
                  if (v) { it.company = v; break; }
                } catch (e) {}
              }
            }
            if (!it.location) {
              for (const sel of detailLocationSelectors) {
                try {
                  const v = await dp.$eval(sel, el => el.innerText.trim()).catch(() => null);
                  if (v) { it.location = v; break; }
                } catch (e) {}
              }
            }
          } catch (e) {
            /* ignore page-level errors */
          } finally {
            await dp.close();
          }
        }
      }
    }
  } catch (e) {
    // ignore browser-level fallback errors
  }

  return normalized;
}

module.exports = { buildSearchUrl, scrape };
