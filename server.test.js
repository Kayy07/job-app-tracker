const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');

const testDataFile = path.join(os.tmpdir(), `job-tracker-${process.pid}.json`);
process.env.JOB_DATA_FILE = testDataFile;
const { normalizeJobUrl } = require('./server');
const { server } = require('./server');

test('normalizes a LinkedIn search result URL to a direct job URL', () => {
  assert.equal(
    normalizeJobUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=4442795869&keywords=software'),
    'https://www.linkedin.com/jobs/view/4442795869'
  );
});

test('removes optional Handshake search query parameters', () => {
  assert.equal(
    normalizeJobUrl('https://app.joinhandshake.com/job-search/11201873?page=1&per_page=25'),
    'https://app.joinhandshake.com/job-search/11201873'
  );
});

test('saves and retrieves a parsed job through the API', async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(testDataFile, { force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const pageResponse = await fetch(baseUrl);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /Application tracker/);

  const createResponse = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: 'Example Co',
      positionTitle: 'Software Intern',
      currentStatus: 'Saved',
      jobDescription: 'What You Will Do\n- Build APIs with Node.js\nRequired Qualifications\n- Experience with Git',
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.job.companyName, 'Example Co');
  assert.deepEqual(created.job.parsedDescription.skills, ['Git', 'Node.js']);

  const listResponse = await fetch(`${baseUrl}/api/jobs`);
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.jobs.length, 1);
  assert.equal(list.jobs[0].id, created.job.id);

  const updateResponse = await fetch(`${baseUrl}/api/jobs/${created.job.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentStatus: 'Applied' }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).job.currentStatus, 'Applied');
});
