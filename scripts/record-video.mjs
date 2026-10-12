// Records the demo video as separate segments (one Playwright context per segment).
// Usage: node scripts/record-video.mjs [baseUrl]   (the server must be running)
// Output: video/raw/<segment>.webm  +  video/plan.json (what each segment shows, for the voiceover)
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3000';
const W = 1280, H = 800;
const demo = JSON.parse(fs.readFileSync('public/data/demo.json', 'utf8'));
fs.rmSync('video/raw', { recursive: true, force: true });
fs.mkdirSync('video/raw', { recursive: true });

const byId = Object.fromEntries(demo.people.map((p) => [p.id, p]));
const fit = (d) => Math.sqrt(d.debriefs[d.a].overall * d.debriefs[d.b].overall);
const dates = demo.dates.filter((d) => d.debriefs?.[d.a] && d.debriefs?.[d.b]).sort((x, y) => fit(y) - fit(x));
const best = dates[0];
const star = byId[best.a];
const key = [best.a, best.b].sort().join('__');
const LIVE = { linkedin: 'https://www.linkedin.com/in/sundarpichai/', instagram: 'https://www.instagram.com/sundarpichai/' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function scrollThrough(page, { step = 120, pause = 90, max = 20000 } = {}) {
  const total = await page.evaluate(() => document.body.scrollHeight - innerHeight);
  for (let y = 0; y < Math.min(total, max); y += step) {
    await page.mouse.wheel(0, step);
    await sleep(pause);
  }
}

const browser = await chromium.launch();
async function segment(name, fn) {
  if (process.env.SEGS && !process.env.SEGS.split(',').includes(name)) return;
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: 'video/raw', size: { width: W, height: H } },
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await fn(page);
  await ctx.close();
  const file = await page.video().path();
  fs.renameSync(file, `video/raw/${name}.webm`);
  console.log(name, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

await segment('01-home', async (p) => {
  await p.goto(`${BASE}/#/`);
  await sleep(4000);
  await p.goto(`${BASE}/#/people`);
  await sleep(1500);
  await scrollThrough(p, { step: 90, pause: 70 });
  await sleep(800);
});

await segment('02-profile', async (p) => {
  await p.goto(`${BASE}/#/p/${star.id}`);
  await sleep(3500); // reading log animates in
  await scrollThrough(p, { step: 50, pause: 140, max: 4000 });
  await p.click('details.raw summary').catch(() => {});
  await sleep(1500);
  await p.mouse.wheel(0, 350);
  await sleep(2000);
});

await segment('03-date', async (p) => {
  await p.goto(`${BASE}/#/date/${key}`);
  // Follow the conversation as it plays out, then read the debriefs.
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    await p.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    if (await p.$('#debriefs .card')) break;
  }
  await sleep(1000);
  await p.evaluate(() => document.getElementById('debriefs').scrollIntoView({ behavior: 'smooth' }));
  await sleep(4000);
  await p.mouse.wheel(0, 400);
  await sleep(3000);
});

await segment('04-dates-rankings', async (p) => {
  await p.goto(`${BASE}/#/dates`);
  await sleep(1500);
  await scrollThrough(p, { step: 160, pause: 60, max: 2000 });
  await p.goto(`${BASE}/#/rankings`);
  await sleep(2500);
  await p.selectOption('#who', star.id);
  await sleep(2500);
  await scrollThrough(p, { step: 110, pause: 80, max: 2600 });
  await p.goto(`${BASE}/#/p/${star.id}`);
  await sleep(800);
  await p.evaluate(() => document.getElementById('ranking').scrollIntoView());
  await sleep(3500);
});

await segment('05-live', async (p) => {
  await p.goto(`${BASE}/#/new`);
  await sleep(1200);
  await p.click('input[name=linkedin]');
  await p.keyboard.type(LIVE.linkedin, { delay: 25 });
  await p.click('input[name=instagram]');
  await p.keyboard.type(LIVE.instagram, { delay: 25 });
  await p.selectOption('select[name=dates]', '1');
  await sleep(600);
  await p.click('#go');
  // Wait until the ranking step finishes (or something fails), following along.
  for (let i = 0; i < 600; i++) {
    await sleep(1000);
    await p.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    const done = await p.evaluate(() => document.querySelectorAll('.step').length >= 5 && !document.querySelector('.step.run'));
    const failed = await p.$('.step.err');
    if (done || failed) break;
  }
  await sleep(4000);
});

await segment('06-how', async (p) => {
  await p.goto(`${BASE}/#/how`);
  await sleep(2000);
  await scrollThrough(p, { step: 40, pause: 150, max: 2200 });
  await sleep(1500);
});

await browser.close();
fs.writeFileSync(
  'video/plan.json',
  JSON.stringify({ star: star.name, partner: byId[best.b].name, venue: best.venue, fit: Math.round(fit(best)), verdicts: [best.debriefs[best.a].verdict, best.debriefs[best.b].verdict], people: demo.people.length, dates: demo.dates.length }, null, 1)
);
