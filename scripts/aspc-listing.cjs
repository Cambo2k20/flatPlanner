#!/usr/bin/env node
/* Opens an ASPC property page in a headless browser, the way a visitor would, and
   prints what a flat needs as JSON: address, price, the description text (where ASPC
   lists each room with its size), photo and floorplan image addresses.

     node scripts/aspc-listing.cjs https://www.aspc.co.uk/search/property/<id>/<address>/ > listing.json

   ASPC fills in the details with JavaScript after the page loads, so a plain download
   of the page has none of them. Needs Playwright with Chromium. */
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2];
  if (!/^https:\/\/www\.aspc\.co\.uk\/search\/property\//.test(url || '')) { console.error('usage: node scripts/aspc-listing.cjs https://www.aspc.co.uk/search/property/…'); process.exit(2); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => {
    const text = (document.querySelector('main') || document.body).innerText;
    const imgs = [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src).filter((s) => /cdn\.aspc\.co\.uk/.test(s));
    const links = [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((s) => /cdn\.aspc\.co\.uk/.test(s));
    const all = [...new Set([...imgs, ...links].map((s) => s.replace(/\?.*$/, '')))];
    return {
      title: document.title.replace(/\s*\|\s*ASPC\s*$/, '').trim(),
      floorplans: all.filter((s) => /\/Floorplan\//i.test(s)),
      photos: all.filter((s) => /\/Image\//i.test(s)),
      text,
    };
  });
  out.url = url;
  // room lines like "Lounge 4.50m x 3.60m" or "Kitchen 3.1m x 2.9m (10'2 x 9'6)"
  out.rooms = out.text.split('\n').map((l) => l.trim()).filter((l) => /\d+(?:\.\d+)?\s*m?\s*[x×]\s*\d+(?:\.\d+)?\s*m/i.test(l));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
