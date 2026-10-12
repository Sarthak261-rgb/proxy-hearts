// Runs the full pipeline for the people in data/people.json and writes public/data/demo.json.
// Every stage is cached in data/cache/, so the run can be resumed after a rate-limit or crash.
import fs from 'node:fs';
import path from 'node:path';
import { scrapePerson } from '../lib/scrape.js';
import { analyzePerson, swipe, runDate } from '../lib/agents.js';
import { selectDates, computeRankings, dateKey } from '../public/js/rank.js';

const CACHE = 'data/cache';
const ONLY = process.argv[2]; // optional: "scrape" to stop after scraping
for (const d of ['scraped', 'profiles', 'swipes', 'dates']) fs.mkdirSync(path.join(CACHE, d), { recursive: true });
fs.mkdirSync('public/avatars', { recursive: true });
fs.mkdirSync('public/data', { recursive: true });

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function pool(items, n, fn) {
  const results = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          results[idx] = await fn(items[idx], idx);
        } catch (e) {
          log('ERROR', e.message);
          results[idx] = null;
        }
      }
    })
  );
  return results;
}

const people = read('data/people.json');

// 1. Scrape (sequential + polite: LinkedIn throttles bursts)
for (const p of people) {
  const f = `${CACHE}/scraped/${p.id}.json`;
  let s = read(f);
  if (!s || s.linkedin?.error || s.instagram?.error) {
    s = await scrapePerson(p);
    write(f, s);
    log('scraped', p.id, s.linkedin.error ? `LI ERR ${s.linkedin.error}` : 'LI ok', s.instagram.error ? `IG ERR ${s.instagram.error}` : `IG ok (${s.instagram.captions.length} posts)`);
    await sleep(2500);
  }
  const av = `public/avatars/${p.id}.jpg`;
  if (!fs.existsSync(av)) {
    for (const url of [s.instagram?.image, s.linkedin?.image].filter(Boolean)) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          fs.writeFileSync(av, Buffer.from(await r.arrayBuffer()));
          break;
        }
      } catch {}
    }
  }
}
if (ONLY === 'scrape') process.exit(0);

// 2. Each agent reads its person
await pool(people, 4, async (p) => {
  const f = `${CACHE}/profiles/${p.id}.json`;
  if (read(f)) return;
  const profile = await analyzePerson(read(`${CACHE}/scraped/${p.id}.json`));
  write(f, profile);
  log('analyzed', p.id, '-', profile.one_liner);
});
const profiles = people
  .map((p) => {
    const pr = read(`${CACHE}/profiles/${p.id}.json`);
    return pr && { ...pr, id: p.id, name: pr.name || p.name };
  })
  .filter(Boolean);
const ids = profiles.map((p) => p.id);
const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));

// 3. Every agent swipes on every other agent's public card
await pool(profiles, 4, async (me) => {
  const f = `${CACHE}/swipes/${me.id}.json`;
  if (read(f)) return;
  const out = await swipe(me, profiles.filter((p) => p.id !== me.id));
  write(f, out);
  log('swiped', me.id, out.filter((s) => s.decision === 'like').length, 'likes');
});
const swipes = {};
for (const id of ids) {
  swipes[id] = {};
  for (const s of read(`${CACHE}/swipes/${id}.json`) || []) if (byId[s.id]) swipes[id][s.id] = s;
}

// 4. Agents go on dates
const plan = selectDates(ids, swipes, { minPer: 2, maxPer: 3 });
log(`${plan.length} dates planned`);
await pool(plan, 5, async (d) => {
  const f = `${CACHE}/dates/${dateKey(d.a, d.b)}.json`;
  if (read(f)) return;
  const res = await runDate(byId[d.a], byId[d.b], d.venue);
  write(f, { ...res, screen: d.screen });
  log('date done', d.a, 'x', d.b, res.debriefs[d.a].overall, '/', res.debriefs[d.b].overall);
});
const dates = plan.map((d) => read(`${CACHE}/dates/${dateKey(d.a, d.b)}.json`)).filter(Boolean);

// 5. Rankings
const rankings = computeRankings(ids, swipes, dates);

const sources = Object.fromEntries(people.map((p) => [p.id, read(`${CACHE}/scraped/${p.id}.json`)]));
for (const s of Object.values(sources)) {
  // Image URLs from the CDNs expire; the avatar is saved locally instead.
  if (s?.instagram) delete s.instagram.image;
  if (s?.linkedin) delete s.linkedin.image;
}
write('public/data/demo.json', {
  generatedAt: new Date().toISOString(),
  people: profiles.map((p) => ({
    ...p,
    linkedin: people.find((x) => x.id === p.id).linkedin,
    instagram: people.find((x) => x.id === p.id).instagram,
    avatar: fs.existsSync(`public/avatars/${p.id}.jpg`) ? `avatars/${p.id}.jpg` : null,
  })),
  sources,
  swipes,
  dates,
  rankings,
});
log('wrote public/data/demo.json');
