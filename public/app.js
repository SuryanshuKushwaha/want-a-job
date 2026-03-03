const form = document.getElementById('searchForm');
const resultsEl = document.getElementById('results');
// No client-side site filter; render results as returned

function showSpinner() {
  resultsEl.innerHTML = '<div class="spinner" aria-hidden="true"></div>';
}

function clearResults() {
  resultsEl.innerHTML = '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    role: fd.get('role'),
    location: fd.get('location'),
    salaryRange: fd.get('salaryRange'),
    jobType: fd.get('jobType'),
    experienceLevel: fd.get('experienceLevel')
  };
  const siteValue = fd.get('sites');
  if (siteValue && siteValue !== 'all') body.sites = [siteValue];

  showSpinner();

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();

    clearResults();
    if (json.results && json.results.length) {
      json.results.forEach((r, i) => {
        const card = document.createElement('div');
        card.className = 'job-card';
        card.style.animationDelay = (i * 60) + 'ms';

        const a = document.createElement('a');
        a.href = r.link || '#';
        a.target = '_blank';
        a.className = 'job-title';
        a.innerText = r.title || r.link || 'Job';

        const meta = document.createElement('div');
        meta.className = 'job-meta';
        meta.innerText = `${r.company || 'Unknown'} — ${r.location || 'Unknown'}`;

        let siteName = '';
        try {
          const u = new URL(r.link || '');
          const host = u.hostname.replace(/^www\./, '');
          const parts = host.split('.');
          const label = parts.length > 1 ? parts[parts.length - 2] : parts[0];
          siteName = label.charAt(0).toUpperCase() + label.slice(1);
        } catch (e) { siteName = '' }
        if (siteName) {
          const siteEl = document.createElement('span');
          siteEl.className = 'job-site';
          siteEl.innerText = siteName;
          meta.appendChild(document.createTextNode(' '));
          meta.appendChild(siteEl);
        }

        card.appendChild(a);
        card.appendChild(meta);

        const btn = document.createElement('button');
        btn.className = 'job-link-btn';
        btn.type = 'button';
        btn.innerText = 'Open';
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          try { window.open(r.link || '#', '_blank'); } catch (e) { location.href = r.link || '#'; }
        });

        card.appendChild(btn);
        resultsEl.appendChild(card);
      });
    } else {
      const msg = document.createElement('div');
      msg.className = 'empty';
      msg.innerText = json.siteErrors && json.siteErrors.length ? 'No results. See siteErrors in raw output.' : 'No results found.';
      resultsEl.appendChild(msg);
    }
  } catch (err) {
    clearResults();
    const errEl = document.createElement('div');
    errEl.className = 'error';
    errEl.innerText = 'Error: ' + (err && err.message ? err.message : String(err));
    resultsEl.appendChild(errEl);
    // error is shown in UI; do not expose raw JSON
  }
});
