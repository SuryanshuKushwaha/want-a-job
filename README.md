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

## Deploying to Render (Docker)

This project can be deployed to Render using the included `Dockerfile`, which installs system Chromium and runs the Node server. Basic steps:

1. Push this repository to GitHub.
2. In Render, create a new **Web Service** and connect your GitHub repo.
3. Choose **Docker** as the environment (Render will detect the `Dockerfile`).
4. Set the start command to: `node src/index.js` (the Docker image already runs that by default).
5. Ensure the service exposes port `3000` (Render maps automatically).

Notes:
- The Docker image installs a system Chromium and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` so Puppeteer uses the system binary.
- Running live scrapes may require increased service resources; consider the Render plan accordingly.
