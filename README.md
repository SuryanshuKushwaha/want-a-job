# Want A Job 🔍💼

A simple and modular **Node.js Job Scraper** built using **Puppeteer** that allows users to search and collect job listings from multiple websites using structured JSON input.

This project is useful for:
- Automating job searches
- Building job dashboards
- Learning web scraping with Puppeteer
- Backend API practice

---

## 🚀 Features

- 🔎 Scrapes job listings dynamically
- 📦 Modular structure (easy to add new job sites)
- 📡 Accepts structured JSON search parameters
- 🧩 Extendable architecture
- ⚡ Lightweight and beginner-friendly

---

## 🛠 Tech Stack

- Node.js
- Express.js
- Puppeteer
- JavaScript

---

## 📥 Installation

1. Clone the repository:

```bash
git clone https://github.com/SuryanshuKushwaha/want-a-job.git

Move into project directory:

cd want-a-job

Install dependencies:

npm install
▶️ Run the Project

Start the server:

npm start

Server will run on:

http://localhost:3000
📡 API Usage

🧩 How to Add a New Job Site

Create a new file inside src/sites/

Export two functions:

buildSearchUrl(params)
async scrape(page, siteUrl, params)

Add it inside SITE_MODULES in src/scraper.js

📁 Project Structure
want-a-job/
│
├── src/
│   ├── sites/
│   └── scraper.js
│
├── public/
├── data/
├── package.json
└── README.md
⚠️ Important Notes

Puppeteer downloads Chromium during installation.

Some websites may block automated scraping.

Always follow website terms & conditions before scraping.

👨‍💻 Author

Suryanshu Kushwaha
