const puppeteer = require('puppeteer');
const path = require('path');

const profileDir = path.join(__dirname, '.handshake-profile');

async function main() {
  console.log('Opening Handshake in a dedicated browser profile...');
  console.log('Log in normally. This script never reads or stores your password.');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: profileDir,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await page.goto('https://app.joinhandshake.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('After login succeeds, close the browser window to save the session.');
  await new Promise(resolve => browser.on('disconnected', resolve));
  console.log('Handshake session saved. You can now run the scraper.');
}

main().catch(error => {
  console.error('Handshake login setup failed:', error.message);
  process.exitCode = 1;
});
