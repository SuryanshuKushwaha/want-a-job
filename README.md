# Job Scraper

Simple modular Node.js job scraper using Puppeteer. The API accepts a JSON body with search parameters and an array of site URLs. Currently includes a scraper module for Indeed.

## Install

1. cd to project folder
2. npm install

## Run

npm start

Then open http://localhost:3000 in your browser.

## API

POST /api/search

Body JSON:
{
  "role": "Software Engineer",
  "location": "San Francisco, CA",
  "salaryRange": "70000-120000",
  "jobType": "full-time",
  "experienceLevel": "mid",
  "sites": ["https://www.indeed.com"]
}

Response:
{
  "results": [ { title, company, location, link }, ... ],
  "siteErrors": [ ... ]
}

## Extending

Add new modules under `src/sites`. Each module should export `buildSearchUrl(params)` and `async scrape(page, siteUrl, params)` returning an array of items `{title, company, location, link}`. Update `SITE_MODULES` in `src/scraper.js` to map host substrings to your module file.

## Notes
- Puppeteer may download a Chromium binary during `npm install` — allow time and disk space.
- Real sites may have anti-scraping measures; use responsibly and follow each site's terms of service.
