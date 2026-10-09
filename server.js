const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { scrapeJob } = require('./jobScraper');
const { parseJobDescription } = require('./jobParser');
const { JobStore, VALID_STATUSES } = require('./jobStore');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const store = new JobStore(process.env.JOB_DATA_FILE || undefined);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function normalizeJobUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL must use HTTP or HTTPS');
  const linkedInId = url.searchParams.get('currentJobId');
  if (/linkedin\.com$/i.test(url.hostname) || /\.linkedin\.com$/i.test(url.hostname)) {
    if (linkedInId) return `https://www.linkedin.com/jobs/view/${linkedInId}`;
  }
  if (/joinhandshake\.com$/i.test(url.hostname) || /\.joinhandshake\.com$/i.test(url.hostname)) {
    const match = url.pathname.match(/\/job-search\/(\d+)/);
    if (match) return `https://app.joinhandshake.com/job-search/${match[1]}`;
  }
  return url.toString();
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, requested);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) return false;
  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
    });
    response.end(body);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && requestUrl.pathname === '/api/jobs') {
    return sendJson(response, 200, { jobs: await store.readAll(), statuses: VALID_STATUSES });
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/scrape') {
    const body = await readJson(request);
    if (!body.url) return sendJson(response, 400, { error: 'A job URL is required' });
    const url = normalizeJobUrl(body.url);
    const job = await scrapeJob(url);
    job.currentStatus = 'Saved';
    return sendJson(response, 200, { job });
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/jobs') {
    const body = await readJson(request);
    if (!body.positionTitle && !body.companyName) {
      return sendJson(response, 400, { error: 'Company or position title is required' });
    }
    body.parsedDescription = parseJobDescription(body.jobDescription);
    return sendJson(response, 201, { job: await store.create(body) });
  }

  const jobMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === 'PATCH' && jobMatch) {
    const body = await readJson(request);
    if (Object.hasOwn(body, 'jobDescription')) {
      body.parsedDescription = parseJobDescription(body.jobDescription);
    }
    const job = await store.update(decodeURIComponent(jobMatch[1]), body);
    return job
      ? sendJson(response, 200, { job })
      : sendJson(response, 404, { error: 'Job not found' });
  }

  if (request.method === 'GET' && await serveStatic(requestUrl.pathname, response)) return;
  sendJson(response, 404, { error: 'Not found' });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    console.error(error);
    const status = /URL|JSON|status|body/i.test(error.message) ? 400 : 500;
    sendJson(response, status, { error: error.message || 'Unexpected server error' });
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Job tracker running at http://localhost:${PORT}`);
  });
}

module.exports = { server, normalizeJobUrl };
