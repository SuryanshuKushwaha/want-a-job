const { URL } = require('url');

// LinkedIn Jobs scraper (best-effort selectors)
function buildSearchUrl(params = {}) {
  const base = 'https://www.linkedin.com/jobs/search';
  const qs = [];
  if (params.role) qs.push(`keywords=${encodeURIComponent(params.role)}`);
  if (params.location) qs.push(`location=${encodeURIComponent(params.location)}`);
  return base + (qs.length ? ('?' + qs.join('&')) : '');
}

async function scrape(page, siteUrl = 'https://www.linkedin.com') {
  const items = await page.evaluate(() => {
    const results = [];
    const selectors = ['.base-card', '.result-card', '.jobs-search-results__list-item', '.job-card-container'];
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
        const anchor = node.querySelector('a.base-card__full-link') || node.querySelector('a') || node.querySelector('.result-card__full-card-link');
        const titleEl = node.querySelector('.job-card-list__title') || node.querySelector('h3') || anchor;
        const companyEl = node.querySelector('.base-search-card__subtitle') || node.querySelector('.job-card-container__company-name') || node.querySelector('.result-card__subtitle') || findInAncestors(node, ['.base-search-card__subtitle', '.job-card-container__company-name', '.result-card__subtitle']);
        const locationEl = node.querySelector('.job-search-card__location') || node.querySelector('.base-search-card__metadata') || node.querySelector('.result-card__location') || node.querySelector('.job-result-card__location') || Array.from(node.querySelectorAll('[class]')).find(el => /\b(loc|location|place)\b/i.test(el.className)) || node.querySelector('[data-location]') || node.querySelector('[aria-label*="location"]') || findInAncestors(node, ['.job-search-card__location', '.base-search-card__metadata', '.result-card__location']);

        const title = titleEl ? titleEl.innerText.trim() : (anchor ? anchor.innerText.trim() : null);
        const company = companyEl ? companyEl.innerText.trim() : null;
        const location = locationEl ? locationEl.innerText.trim() : null;
        const href = anchor ? (anchor.getAttribute('href') || null) : null;

        if (title) results.push({ title, company, location, href });
      } catch (e) { /* ignore */ }
    });

    return results;
  });

  const normalized = (items || []).map(it => {
    let link = it.href || '';
    try {
      if (link && !link.startsWith('http')) link = new URL(link, 'https://www.linkedin.com').toString();
    } catch (e) {}
    return { title: it.title, company: it.company, location: it.location, link };
  });

  return normalized;
}

module.exports = { buildSearchUrl, scrape };
