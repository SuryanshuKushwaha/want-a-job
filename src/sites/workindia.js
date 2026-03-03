const { URL } = require('url');
// WorkIndia minimal scraper module
function buildSearchUrl(params = {}) {
  const base = 'https://www.workindia.in/jobs';
  const qs = [];
  if (params.role) qs.push(`q=${encodeURIComponent(params.role)}`);
  if (params.location) qs.push(`location=${encodeURIComponent(params.location)}`);
  return base + (qs.length ? ('?' + qs.join('&')) : '');
}

async function scrape(page, siteUrl = 'https://www.workindia.in') {
  const items = await page.evaluate(() => {
    const results = [];
    const selectors = ['.job-card', '.job_list_item', '.job_row', '.job-item', '.col-job'];
    let nodes = [];
    for (const sel of selectors) {
      nodes = Array.from(document.querySelectorAll(sel));
      if (nodes && nodes.length) break;
    }

    nodes.forEach(node => {
      try {
        const anchor = node.querySelector('a') || node.querySelector('h3 a') || node.querySelector('a[href]');
        const titleEl = node.querySelector('h3') || node.querySelector('.job-title') || anchor;
        const companyEl = node.querySelector('.company') || node.querySelector('.org') || node.querySelector('.company-name');
        const locationEl = node.querySelector('.location') || node.querySelector('.job-location') || node.querySelector('.loc') || Array.from(node.querySelectorAll('[class]')).find(el => /\b(loc|location|place)\b/i.test(el.className)) || node.querySelector('[data-location]') || node.querySelector('[aria-label*="location"]');

        const title = titleEl ? titleEl.innerText.trim() : (anchor ? anchor.innerText.trim() : null);
        const company = companyEl ? companyEl.innerText.trim() : null;
        const location = locationEl ? locationEl.innerText.trim() : null;
        const href = anchor ? (anchor.getAttribute('href') || null) : null;

        if (title) results.push({ title, company, location, href });
      } catch (e) {
        /* ignore element-level errors */
      }
    });

    return results;
  });

  const normalized = (items || []).map(it => {
    let link = it.href || '';
    try {
      if (link && !link.startsWith('http')) link = new URL(link, 'https://www.workindia.in').toString();
    } catch (e) {}
    return { title: it.title, company: it.company, location: it.location, link };
  });

  return normalized;
}

module.exports = { buildSearchUrl, scrape };
