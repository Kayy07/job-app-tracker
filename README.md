# Job Application Tracker

Dashboard project for tracking job applications. The repository currently
includes the job-listing scraper that produces records in this shared shape:

```json
{
  "companyName": "Example Company",
  "positionTitle": "Software Engineer",
  "jobDescription": "Full description text",
  "parsedDescription": {
    "summary": "A concise introductory paragraph...",
    "responsibilities": ["Build and ship product features"],
    "requiredQualifications": ["Experience with JavaScript"],
    "preferredQualifications": ["Experience with React"],
    "skills": ["JavaScript", "React"],
    "benefits": ["Flexible working hours"],
    "applicationInstructions": ["Submit a resume and portfolio"]
  },
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

## Run the tracker app

```bash
npm start
```

Open <http://localhost:3000>. From the dashboard you can:

- Paste a Handshake, LinkedIn, or Indeed listing URL.
- Review and edit extracted fields before saving.
- See structured description sections and detected skills.
- Track Saved, Applied, Interviewing, Rejected, and Offer statuses.
- Search saved jobs by company, position, location, or skill.

Saved jobs are written locally to `data/jobs.json`. That directory is ignored
by Git so personal application data is not committed.

## Scrape a listing

```bash
node example.js "https://app.joinhandshake.com/job-search/11201873?page=1&per_page=25"
```

When using Git Bash, quote URLs containing `&`, or use the shorter URL without
query parameters:

```bash
node example.js https://app.joinhandshake.com/job-search/11201873
```

The command prints one JSON record to standard output. It preserves the full
raw `jobDescription` and adds a compact `parsedDescription` for application UI,
filtering, and search. Empty or unrecognized sections are returned as empty
arrays instead of guessed content. `currentStatus` is currently initialized to
`Applied`; it does not inspect application history.

## Current limitations

- Handshake sessions expire and occasionally require logging in again.
- Handshake must open a visible browser during a scrape.
- LinkedIn and Indeed can block automated browsing or change their markup.
- Description parsing is rule-based, so unusual headings may remain only in the
  preserved raw description.
