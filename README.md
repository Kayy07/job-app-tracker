# Job Application Tracker

Dashboard project for tracking job applications. The repository currently
includes the job-listing scraper that produces records in this shared shape:

```json
{
  "companyName": "Example Company",
  "positionTitle": "Software Engineer",
  "jobDescription": "Full description text",
  "currentStatus": "Applied",
  "link": "https://...",
  "deadline": null,
  "onsiteRemote": "Remote",
  "location": "New York, NY",
  "payRate": "$80,000–100,000/yr"
}
```

## Supported sites

- Handshake (primary; authenticated session required)
- LinkedIn (public listings)
- Indeed (public listings)

## Install

```bash
npm install
```

## Handshake setup

Create a dedicated saved Handshake session:

```bash
npm run handshake:login
```

Log in through the visible browser using the normal school/SSO process, then
close the browser. Credentials are not read by the scraper. Browser session
data is stored under `.handshake-profile/`, which is ignored by Git and must
not be shared.

Handshake scraping opens a visible Chromium window because its current
Cloudflare verification blocks headless Chromium.

## Scrape a listing

```bash
node example.js "https://app.joinhandshake.com/job-search/11201873?page=1&per_page=25"
```

When using Git Bash, quote URLs containing `&`, or use the shorter URL without
query parameters:

```bash
node example.js https://app.joinhandshake.com/job-search/11201873
```

The command prints one JSON record to standard output. `currentStatus` is
currently initialized to `Applied`; it does not inspect application history.

## Current limitations

- Handshake sessions expire and occasionally require logging in again.
- Handshake must open a visible browser during a scrape.
- LinkedIn and Indeed can block automated browsing or change their markup.
- Long job descriptions are currently returned as raw text; structured parsing
  and summarization are planned as the next layer of the tracker.
