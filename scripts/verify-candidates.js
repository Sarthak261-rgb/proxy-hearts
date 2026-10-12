import fs from 'node:fs';
import { scrapeLinkedIn, scrapeInstagram } from '../lib/scrape.js';
const list = JSON.parse(fs.readFileSync('data/candidates.json', 'utf8'));
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, li, ig] of list) {
  const row = { name };
  try { const l = await scrapeLinkedIn(li); row.li = `${l.name} | ${l.headline.slice(0,40)} | about:${l.about.length} posts:${l.posts.length} arts:${l.articles.length}`; out[name] = { ...(out[name]||{}), li: l }; } catch (e) { row.li = 'ERR ' + e.message; }
  try { const i = await scrapeInstagram(ig); row.ig = `${i.name} | ${i.followers} | bio:${i.biography.length} caps:${i.captions.length} priv:${i.private}`; out[name] = { ...(out[name]||{}), ig: i }; } catch (e) { row.ig = 'ERR ' + e.message; }
  console.log(JSON.stringify(row));
  await sleep(700);
}
fs.writeFileSync('data/verify-raw.json', JSON.stringify(out, null, 1));
