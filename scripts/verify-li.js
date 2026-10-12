import fs from 'node:fs';
import { scrapeLinkedIn } from '../lib/scrape.js';
const list = JSON.parse(fs.readFileSync('data/candidates.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync('data/verify-raw.json', 'utf8'));
for (const [name, li] of list) {
  if (raw[name]?.li) continue;
  try { const l = await scrapeLinkedIn(li); raw[name] = { ...(raw[name]||{}), li: l }; console.log(name, '->', l.name, '|', l.headline.slice(0,50), '| about', l.about.length, 'posts', l.posts.length); }
  catch (e) { console.log(name, 'ERR', e.message); }
  await new Promise(r => setTimeout(r, 5000));
}
fs.writeFileSync('data/verify-raw.json', JSON.stringify(raw, null, 1));
