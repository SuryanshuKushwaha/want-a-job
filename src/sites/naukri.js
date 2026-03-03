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
  const items = await page.evaluate(() => {
    const results = [];
    const selectors = ['div.card', '.jobTuple', '.list', '.jobInfo', '.jobTupleHeader'];
    let nodes = [];
    for (const sel of selectors) {
      nodes = Array.from(document.querySelectorAll(sel));
      if (nodes && nodes.length) break;
    }

    nodes.forEach(node => {
      try {
        const anchor = node.querySelector('a') || node.querySelector('h3 a') || node.querySelector('a.title');
        const titleEl = node.querySelector('a') || node.querySelector('.title') || node.querySelector('h3') || anchor;
        const companyEl = node.querySelector('.company') || node.querySelector('.companyName') || node.querySelector('.org') || node.querySelector('.companyInfo a');
        const locationEl = node.querySelector('.location') || node.querySelector('.loc') || node.querySelector('.meta') || node.querySelector('.ellipsis') || Array.from(node.querySelectorAll('[class]')).find(el => /\b(loc|location|place)\b/i.test(el.className)) || node.querySelector('[data-location]') || node.querySelector('[aria-label*="location"]');

        const title = titleEl ? titleEl.innerText.trim() : (anchor ? anchor.innerText.trim() : null);
        const company = companyEl ? companyEl.innerText.trim() : null;
        const location = locationEl ? locationEl.innerText.trim() : null;
        const href = anchor ? (anchor.getAttribute('href') || null) : null;

        if (title) {
          results.push({ title, company, location, href });
        }
      } catch (e) { /* ignore */ }
    });

    return results;
  });

  const normalized = (items || []).map(it => {
    let link = it.href || '';
    try {
      if (link && !link.startsWith('http')) link = new URL(link, 'https://www.naukri.com').toString();
    } catch (e) {}
    return { title: it.title, company: it.company, location: it.location, link };
  });

  return normalized;
}

module.exports = { buildSearchUrl, scrape };
