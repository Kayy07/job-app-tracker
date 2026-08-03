/**
 * Example usage. Run with: node example.js "https://www.linkedin.com/jobs/view/..."
 */
const { scrapeJob } = require('./jobScraper');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node example.js <job posting url>');
  process.exit(1);
}

scrapeJob(url)
  .then(job => {
    console.log(JSON.stringify(job, null, 2));
    // In the real app, this is where you'd POST `job` to your backend /
    // insert it into the tracker table, and let the person fill in any
    // null fields (deadline, payRate if not listed, etc.) before saving.
  })
  .catch(err => {
    console.error('Scrape failed:', err.message);
    console.error('Fall back to parsePastedText() with a manually copied description.');
  });
