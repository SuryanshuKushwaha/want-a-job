const { URL } = require('url');

function buildSearchUrl(params = {}) {
  const base = 'https://www.indeed.com/jobs';
  const q = encodeURIComponent(params.role || '');
  const l = encodeURIComponent(params.location || '');
  const qs = [];
  if (q) qs.push(`q=${q}`);
  if (l) qs.push(`l=${l}`);

  // Map job type
  if (params.jobType) {
    const jt = String(params.jobType).toLowerCase();
    const map = {
      'full-time': 'fulltime',
      fulltime: 'fulltime',
      'part-time': 'parttime',
      parttime: 'parttime',
      contract: 'contract',
      internship: 'internship',
      temporary: 'temporary'
    };
    if (map[jt]) qs.push(`jt=${map[jt]}`);
  }

  // Salary range - best-effort
  if (params.salaryRange) {
    if (typeof params.salaryRange === 'string' && params.salaryRange.includes('-')) {
      const [min] = params.salaryRange.split('-').map(s => s.trim());
      if (min) qs.push(`salary=${min}`);
    } else if (typeof params.salaryRange === 'number' || /^\d+$/.test(String(params.salaryRange))) {
      qs.push(`salary=${params.salaryRange}`);
    }
  }

  // Experience level mapping (best-effort)
  if (params.experienceLevel) {
    const ex = String(params.experienceLevel).toLowerCase();
    const map = { entry: 'entry_level', junior: 'entry_level', mid: 'mid_level', senior: 'senior_level' };
    if (map[ex]) qs.push(`explvl=${map[ex]}`);
  }

  return base + (qs.length ? ('?' + qs.join('&')) : '');
}

async function scrape(page, siteUrl = 'https://www.indeed.com') {
  const items = await page.evaluate(() => {
    const results = [];
    const selectors = ['a.tapItem', '.job_seen_beacon', '.result', '.jobsearch-SerpJobCard', 'div.slider_item'];
    let nodes = [];
    for (const sel of selectors) {
      nodes = Array.from(document.querySelectorAll(sel));
      if (nodes && nodes.length) break;
    }

    nodes.forEach(node => {
      try {
        const anchor = node.tagName === 'A' ? node : (node.querySelector('a') || node.querySelector('h2 a') || node.querySelector('a[href]'));
        const titleEl = node.querySelector('h2 span') || node.querySelector('h2') || anchor;
        const companyEl = node.querySelector('.companyName') || node.querySelector('.company') || node.querySelector('.turnstileLink') || node.querySelector('.company a');
        const locationEl = node.querySelector('.companyLocation') || node.querySelector('.location') || node.querySelector('[data-rc-loc]');

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
      if (link && !link.startsWith('http')) link = new URL(link, 'https://www.indeed.com').toString();
    } catch (e) {}
    return { title: it.title, company: it.company, location: it.location, link };
  });

  return normalized;
}

module.exports = { buildSearchUrl, scrape };
