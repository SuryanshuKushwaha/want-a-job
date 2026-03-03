const { URL } = require('url');
// Internshala minimal scraper module
function buildSearchUrl(params = {}) {
  const base = 'https://internshala.com/jobs';
  const qs = [];
  if (params.role) qs.push(`q=${encodeURIComponent(params.role)}`);
  if (params.location) qs.push(`location=${encodeURIComponent(params.location)}`);
  return base + (qs.length ? ('?' + qs.join('&')) : '');
}

async function scrape(page, siteUrl = 'https://internshala.com') {
  const items = await page.evaluate(() => {
    const results = [];
    const selectors = ['.internship_list_item', '.single_internship', '.internship', '.internship_card'];
    let nodes = [];
    for (const sel of selectors) {
      nodes = Array.from(document.querySelectorAll(sel));
      if (nodes && nodes.length) break;
    }

    nodes.forEach(node => {
      try {
        const anchor = node.querySelector('a') || node.querySelector('.heading a') || node.querySelector('h3 a');
        const titleEl = node.querySelector('.heading') || node.querySelector('h3') || anchor;
        const companyEl = node.querySelector('.company_name') || node.querySelector('.company') || node.querySelector('.internship_company');
        const locationEl = node.querySelector('.location') || node.querySelector('.internship_location') || node.querySelector('.loc') || Array.from(node.querySelectorAll('[class]')).find(el => /\b(loc|location)\b/i.test(el.className)) || node.querySelector('[data-location]') || node.querySelector('[aria-label*="location"]');

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
      if (link && !link.startsWith('http')) link = new URL(link, 'https://internshala.com').toString();
    } catch (e) {}
    return { title: it.title, company: it.company, location: it.location, link };
  });

  return normalized;
}

module.exports = { buildSearchUrl, scrape };
