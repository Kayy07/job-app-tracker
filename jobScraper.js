/**
 * jobScraper.js
 *
 * Scrapes a job posting URL (LinkedIn or Indeed) and returns an object
 * matching the shared "Job" schema:
 *
 *   { id, companyName, positionTitle, jobDescription, currentStatus,
 *     link, deadline, onsiteRemote, location, payRate }
 *
 * Notes:
 * - LinkedIn and Indeed render most content with JavaScript and actively
 *   detect bots, so we use Puppeteer (a headless browser) instead of a
 *   simple HTTP fetch.
 * - Neither site reliably exposes an "application deadline" field, so
 *   `deadline` is left null for the tracker app to let the user fill in.
 * - Selectors WILL break when these sites update their markup. Keep the
 *   selector constants at the top of each scraper function so they're
 *   easy to find and patch.
 * - This scrapes only what's publicly viewable on the page (no login).
 *   Some LinkedIn postings are login-walled and won't return full data.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const { parseJobDescription } = require('./jobParser');

// A dedicated browser profile preserves the Handshake login between runs.
// It is intentionally separate from the user's normal Chrome profile.
const HANDSHAKE_PROFILE_DIR = path.join(__dirname, '.handshake-profile');

// ---------- helpers ----------

function detectPlatform(url) {
  if (/linkedin\.com/i.test(url)) return 'linkedin';
  if (/indeed\.com/i.test(url)) return 'indeed';
  if (/joinhandshake\.com/i.test(url)) return 'handshake';
  return 'unknown';
}

function guessOnsiteRemote(text) {
  const t = text.toLowerCase();
  if (t.includes('remote')) return 'Remote';
  if (t.includes('hybrid')) return 'Hybrid';
  if (t.includes('on-site') || t.includes('onsite') || t.includes('in office') || t.includes('in-office')) {
    return 'Onsite';
  }
  return 'Unknown';
}

function extractPayRate(text) {
  // Looks for patterns like "$80,000 - $100,000" or "$40/hr" or "$45.50 per hour"
  const rangeMatch = text.match(/\$[\d,]+(?:\.\d+)?K?\s*(?:-|–|—|to)\s*\$?[\d,]+(?:\.\d+)?K?(?:\s*(?:\/\s*)?(?:hr|hour|mo|month|yr|year))?/i);
  if (rangeMatch) return rangeMatch[0];

  const singleMatch = text.match(/\$[\d,]+(?:\.\d+)?K?\s*(?:\/\s*(?:hr|hour|mo|month|yr|year))?/i);
  if (singleMatch) return singleMatch[0];

  return null; // let the user fill this in if not found
}

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1366, height: 900 });
  return page;
}

// ---------- platform-specific scrapers ----------

async function scrapeLinkedIn(browser, url) {
  const page = await newPage(browser);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // These selectors target LinkedIn's public job-view page.
  // If LinkedIn changes markup, update the selectors below.
  const data = await page.evaluate(() => {
    const text = sel => document.querySelector(sel)?.innerText?.trim() || null;

    return {
      positionTitle: text('h1.top-card-layout__title, h1.job-details-jobs-unified-top-card__job-title'),
      companyName: text('a.topcard__org-name-link, .job-details-jobs-unified-top-card__company-name'),
      location: text('span.topcard__flavor--bullet, .job-details-jobs-unified-top-card__bullet'),
      jobDescription: text('.description__text, .jobs-description__content'),
    };
  });

  await page.close();

  const descText = data.jobDescription || '';
  return {
    companyName: data.companyName,
    positionTitle: data.positionTitle,
    jobDescription: descText,
    parsedDescription: parseJobDescription(descText),
    currentStatus: 'Applied',
    link: url,
    deadline: null,
    onsiteRemote: guessOnsiteRemote(descText + ' ' + (data.location || '')),
    location: data.location,
    payRate: extractPayRate(descText),
  };
}

async function scrapeIndeed(browser, url) {
  const page = await newPage(browser);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Indeed's public job-view page selectors.
  const data = await page.evaluate(() => {
    const text = sel => document.querySelector(sel)?.innerText?.trim() || null;

    return {
      positionTitle: text('h1.jobsearch-JobInfoHeader-title'),
      companyName: text('[data-testid="inlineHeader-companyName"]'),
      location: text('[data-testid="inlineHeader-companyLocation"]'),
      jobDescription: text('#jobDescriptionText'),
      salaryText: text('#salaryInfoAndJobType, [data-testid="attribute_snippet_testid"]'),
    };
  });

  await page.close();

  const descText = data.jobDescription || '';
  return {
    companyName: data.companyName,
    positionTitle: data.positionTitle,
    jobDescription: descText,
    parsedDescription: parseJobDescription(descText),
    currentStatus: 'Applied',
    link: url,
    deadline: null,
    onsiteRemote: guessOnsiteRemote(descText + ' ' + (data.location || '')),
    location: data.location,
    payRate: extractPayRate(data.salaryText || descText),
  };
}

async function scrapeHandshake(browser, url) {
  const page = await newPage(browser);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Handshake currently places Cloudflare verification in front of its app.
  // A visible browser with the saved profile can pass it, but the app may need
  // several seconds after navigation before the job detail is rendered.
  await page.waitForFunction(
    () => document.title !== 'Just a moment...' &&
      !document.body?.innerText?.includes('Performing security verification'),
    { timeout: 30000 }
  ).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 5000));

  const blockedByCloudflare = await page.evaluate(() =>
    document.title === 'Just a moment...' ||
    document.body?.innerText?.includes('Performing security verification')
  );
  if (blockedByCloudflare) {
    await page.close();
    throw new Error(
      'Handshake security verification did not finish. Complete it in the visible browser and retry.'
    );
  }

  const loginRequired = await page.evaluate(() => {
    const body = document.body?.innerText || '';
    return /log in or sign up|sign in to handshake|continue with sso/i.test(body) ||
      Boolean(document.querySelector('input[type="password"], form[action*="login"]'));
  });

  if (loginRequired) {
    await page.close();
    throw new Error(
      'Handshake login required. Run `npm run handshake:login`, sign in, then retry this URL.'
    );
  }

  await page.waitForSelector('[data-hook="right-content"]', { timeout: 30000 });

  // Handshake truncates long descriptions behind a More button.
  await page.evaluate(() => {
    const root = document.querySelector('[data-hook="right-content"]');
    const more = [...(root?.querySelectorAll('button') || [])]
      .find(button => button.innerText.trim() === 'More');
    more?.click();
  });
  await new Promise(resolve => setTimeout(resolve, 1000));

  // IMPORTANT: Handshake job postings are almost always login-walled —
  // you generally can't view them without a signed-in school account.
  // These selectors target the logged-in job-detail view. If the page
  // just shows a login prompt, this will come back mostly null; that's
  // expected, not a bug. Consider having the scraper reuse a logged-in
  // browser session/cookies (page.setCookie) if this needs to work
  // reliably, rather than a fresh anonymous session each time.
  const data = await page.evaluate(() => {
    const root = document.querySelector('[data-hook="right-content"]');
    const fullText = root?.innerText?.trim() || '';
    const lines = fullText.split('\n').map(line => line.trim()).filter(Boolean);
    const descriptionMatch = fullText.match(
      /Job description\s*\n([\s\S]*?)\n(?:Less|More)?\s*\n?Save\s*\n(?:Quick apply|Apply externally)/i
    );
    const deadlineMatch = fullText.match(/Apply by ([^\n∙]+)/i);
    const atGlanceMatch = fullText.match(/At a glance\s*\n([\s\S]*?)\n(?:US work authorization[^\n]*\n)?Job description/i);
    const atGlance = atGlanceMatch?.[1]?.trim() || '';
    const locationMatch = atGlance.match(/(?:Onsite|Hybrid), based in ([^\n]+)/i);
    const remote = /(?:^|\n)Remote(?:\n|$)/i.test(atGlance);

    return {
      positionTitle: root?.querySelector('h1')?.innerText?.trim() || null,
      companyName: lines[0] || null,
      location: remote ? 'Remote' : (locationMatch?.[1]?.trim() || null),
      jobDescription: descriptionMatch?.[1]?.trim() || null,
      payText: atGlance,
      workModeText: atGlance,
      deadline: deadlineMatch?.[1]?.trim() || null,
    };
  });

  await page.close();

  const descText = (data.jobDescription || '').replace(/\s*\nLess\s*$/i, '').trim();
  return {
    companyName: data.companyName,
    positionTitle: data.positionTitle,
    jobDescription: descText,
    parsedDescription: parseJobDescription(descText),
    currentStatus: 'Applied',
    link: url,
    deadline: data.deadline,
    onsiteRemote: guessOnsiteRemote(data.workModeText || descText + ' ' + (data.location || '')),
    location: data.location,
    payRate: extractPayRate(data.payText || descText),
  };
}

// ---------- fallback: parse pasted text/HTML when scraping fails ----------
// Useful when a site blocks the headless browser (CAPTCHA/login wall).
// User pastes the visible job description text and we extract what we can.
function parsePastedText(rawText, url) {
  const payRate = extractPayRate(rawText);
  const onsiteRemote = guessOnsiteRemote(rawText);

  return {
    companyName: null, // ask user to confirm/fill manually
    positionTitle: null,
    jobDescription: rawText.trim(),
    parsedDescription: parseJobDescription(rawText),
    currentStatus: 'Applied',
    link: url || null,
    deadline: null,
    onsiteRemote,
    location: null,
    payRate,
  };
}

// ---------- main entry point ----------

/**
 * Scrapes a job posting and returns a Job-shaped object.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function scrapeJob(url) {
  const platform = detectPlatform(url);
  if (platform === 'unknown') {
    throw new Error(
      `Unsupported site for ${url}. Currently supports linkedin.com, indeed.com, ` +
      `and joinhandshake.com. Use parsePastedText() as a manual fallback.`
    );
  }

  const browser = await puppeteer.launch({
    headless: platform === 'handshake' ? false : 'new',
    defaultViewport: platform === 'handshake' ? null : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(platform === 'handshake' ? { userDataDir: HANDSHAKE_PROFILE_DIR } : {}),
  });

  try {
    let result;
    if (platform === 'linkedin') result = await scrapeLinkedIn(browser, url);
    else if (platform === 'indeed') result = await scrapeIndeed(browser, url);
    else result = await scrapeHandshake(browser, url);
    return result;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeJob, parsePastedText, detectPlatform };
