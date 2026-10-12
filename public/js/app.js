import { computeRankings, mutualScreen, dateKey } from './rank.js';

const $app = document.getElementById('app');
const LOCAL_KEY = 'proxyhearts.local.v1';
const DATE_TURNS = 6;

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtSay = (s = '') => esc(s).replace(/\*([^*]+)\*/g, '<em>*$1*</em>');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let demo = { people: [], swipes: {}, dates: [], sources: {} };
let local = loadLocal();
let routeToken = 0; // bumps on navigation so running animations stop

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { people: [], swipes: {}, dates: [], sources: {} };
  } catch {
    return { people: [], swipes: {}, dates: [], sources: {} };
  }
}
function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
  } catch {}
}

// ---------- merged world: the pre-run 25 + anyone added in this browser ----------
function world() {
  const people = [...demo.people, ...local.people];
  const swipes = structuredClone(demo.swipes);
  for (const [from, row] of Object.entries(local.swipes)) swipes[from] = { ...(swipes[from] || {}), ...row };
  const dates = [...demo.dates, ...local.dates];
  const ids = people.map((p) => p.id);
  return { people, swipes, dates, ids, byId: Object.fromEntries(people.map((p) => [p.id, p])), sources: { ...demo.sources, ...local.sources } };
}
let W = world();
let RANK = {};
function refresh() {
  W = world();
  RANK = computeRankings(W.ids, W.swipes, W.dates);
}

function avatar(p, size = '') {
  if (!p) return '';
  const initials = (p.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  const src = p.avatar || (p.avatarUrl ? `/api/avatar?url=${encodeURIComponent(p.avatarUrl)}` : null);
  return src
    ? `<img class="avatar ${size}" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.outerHTML='<span class=&quot;avatar ${size}&quot;>${esc(initials)}</span>'">`
    : `<span class="avatar ${size}">${esc(initials)}</span>`;
}
const srcTag = (s = '') => (/insta/i.test(s) ? '<span class="src ig">IG</span>' : '<span class="src li">in</span>');
const evidence = (e) => (e?.quote ? `<div class="quote">${srcTag(e.source)} “${esc(e.quote)}”</div>` : '');

// ---------- router ----------
const routes = [
  [/^#?\/?$/, home],
  [/^#\/how$/, how],
  [/^#\/people$/, peoplePage],
  [/^#\/p\/(.+)$/, profilePage],
  [/^#\/dates$/, datesPage],
  [/^#\/date\/(.+)$/, datePage],
  [/^#\/rankings$/, rankingsPage],
  [/^#\/new$/, newPage],
];
function route() {
  routeToken++;
  const h = location.hash || '#/';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', h.startsWith(a.getAttribute('href'))));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      window.scrollTo(0, 0);
      return fn(...m.slice(1).map(decodeURIComponent));
    }
  }
  home();
}
window.addEventListener('hashchange', route);

// ---------- pages ----------
function home() {
  const n = W.people.length;
  const best = bestCouples().slice(0, 3);
  $app.innerHTML = `
  <div class="hero">
    <div>
      <h1>Your agent goes on the first date, so you don't have to.</h1>
      <p class="lead">Paste a LinkedIn and an Instagram. An AI agent reads both, builds a profile of what that person needs, loves and values, then dates every other agent on their behalf and comes back with a ranked list of who fits best.</p>
      <div class="cta">
        <a class="btn" href="#/new">Add a person</a>
        <a class="btn ghost" href="#/people">See the ${n} agents</a>
      </div>
      <div class="stats">
        <div class="stat"><b>${n}</b><span>real people, 2 sources each</span></div>
        <div class="stat"><b>${Object.values(W.swipes).reduce((a, r) => a + Object.keys(r).length, 0)}</b><span>swipes by agents</span></div>
        <div class="stat"><b>${W.dates.length}</b><span>full dates, ${W.dates.length * DATE_TURNS} messages</span></div>
        <div class="stat"><b>${n}</b><span>personal rankings</span></div>
      </div>
    </div>
    <div class="mosaic">${W.people.slice(0, 25).map((p) => `<a href="#/p/${esc(p.id)}" title="${esc(p.name)}">${avatar(p)}</a>`).join('')}</div>
  </div>
  <section>
    <h2>How it works</h2>
    <div class="flow">
      <div class="card"><h3>Read</h3><p class="muted small">We fetch the public LinkedIn and Instagram pages. Nothing else: no search, no outside knowledge.</p></div>
      <div class="card"><h3>Understand</h3><p class="muted small">The person's agent writes a profile: needs, hobbies, interests, values, personality, each backed by a quote.</p></div>
      <div class="card"><h3>Date</h3><p class="muted small">Agents swipe on each other, then the best pairs go on real turn-by-turn dates, each agent with its own private thoughts.</p></div>
      <div class="card"><h3>Rank</h3><p class="muted small">Each agent reports back to its person. Both sides' verdicts combine into a ranking for every person.</p></div>
    </div>
  </section>
  ${best.length ? `<section><h2>Strongest matches so far</h2><div class="grid g3">${best.map(dateCard).join('')}</div></section>` : ''}
  `;
}

function how() {
  $app.innerHTML = `
  <h1>How it works</h1>
  <div class="grid g2">
    <div class="card pipeline">
      <h3>1 · Scraping (two sources only)</h3>
      <p><b>LinkedIn:</b> the public profile page at <code>linkedin.com/in/…</code>. LinkedIn throttles anonymous browsers (HTTP 999), but serves the full public profile to link-preview crawlers, so the scraper requests it with preview-bot user agents and parses the HTML: title, headline, About, Experience, Education, recent posts and the JSON-LD list of articles.</p>
      <p><b>Instagram:</b> the public profile page at <code>instagram.com/…</code>. Instagram returns an empty JavaScript shell to normal clients, but server-renders the profile for search and link-preview crawlers. The scraper reads the embedded JSON: full name, bio, category, follower counts, verified flag, private flag and the captions of the latest ~12 posts.</p>
      <p class="muted small">No logins, no cookies, no third-party mirrors, no paid scraping APIs. Private Instagram accounts are rejected.</p>
    </div>
    <div class="card pipeline">
      <h3>2 · The agent reads its person</h3>
      <p>Gemini reads both sources with a strict rule: only use this text, never outside knowledge, and back every claim with a short quote and its source. It produces needs, hobbies, interests, values, Big Five personality estimates, humor and communication style, green flags, watch-outs, dealbreakers, an ideal partner, date ideas, a voice guide for speaking on the person's behalf, and a data-quality self-assessment.</p>
    </div>
    <div class="card pipeline">
      <h3>3 · The agents date</h3>
      <p><b>Swipe:</b> each agent sees every other person's public card (never their private brief) and scores interest 0-100 for its own person, with a reason and a date idea.</p>
      <p><b>Match:</b> pairs are ranked by mutual interest (geometric mean, so one-sided crushes rank low). The strongest pairs go on dates; everyone gets at least two.</p>
      <p><b>Date:</b> the more interested agent's idea sets the scene. The two agents then alternate, ${DATE_TURNS} messages, one LLM call per message. Each agent only knows its own person, sees the conversation so far, follows a phase (open, probe needs and dealbreakers, close honestly), and writes a private thought the other agent never sees.</p>
      <p><b>Debrief:</b> each agent separately reports back to its own person with six sub-scores, an overall fit score, a verdict (second date, friends, pass) and a note.</p>
    </div>
    <div class="card pipeline">
      <h3>4 · Ranking</h3>
      <p>For every person, every other person gets a score:</p>
      <p><code>screen = √(A→B interest × B→A interest)</code><br>
      <code>dated: 0.3 × screen + 0.7 × √(A's debrief × B's debrief)</code>, +4 if both want a second date, −6 if either passes<br>
      <code>not dated: 0.9 × screen</code></p>
      <p>Add a new person and their agent swipes on the whole pool, the pool's agents review them back, and they go on live dates with their top three.</p>
      <h3>Stack</h3>
      <p class="muted small">Node.js serverless functions on Vercel, native fetch + regex/JSON parsing for scraping, Gemini 3.5 Flash for analysis and Gemini 3.5 Flash-Lite for date turns, vanilla JS front end. The 25-person demo was produced by <code>scripts/run-demo.js</code> with the same code the website runs.</p>
    </div>
  </div>`;
}

function personCard(p) {
  const isLocal = local.people.some((x) => x.id === p.id);
  return `<a class="card person" href="#/p/${esc(p.id)}">
    <div class="head">${avatar(p, 'md')}<div><div class="name">${esc(p.name)}${isLocal ? '<span class="badge-new">added</span>' : ''}</div><div class="muted small">${esc(p.headline || '')}</div></div></div>
    <div class="one">${esc(p.one_liner || '')}</div>
    <div>${(p.interests || []).slice(0, 4).map((i) => `<span class="chip">${esc(i.name)}</span>`).join('')}</div>
  </a>`;
}

function peoplePage() {
  $app.innerHTML = `
    <div class="controls" style="justify-content:space-between"><div><h1>The agents</h1><p class="muted">${W.people.length} people. Each one is two links: their LinkedIn and their public Instagram. Click anyone to see what their agent found.</p></div>
    <a class="btn" href="#/new">Add a person</a></div>
    <div class="grid g3">${W.people.map(personCard).join('')}</div>`;
}

async function profilePage(id) {
  const p = W.byId[id];
  if (!p) return ($app.innerHTML = '<p>Person not found.</p>');
  const src = W.sources[id] || {};
  const ranking = RANK[id] || [];
  const myDates = W.dates.filter((d) => d.a === id || d.b === id);
  const per = p.personality || {};
  const q = p.qualities || {};
  $app.innerHTML = `
  <div class="phero">
    ${avatar(p, 'lg')}
    <div style="flex:1;min-width:240px">
      <h1 style="margin-bottom:4px">${esc(p.name)}</h1>
      <div class="muted">${esc(p.headline || '')}${p.location ? ' · ' + esc(p.location) : ''}</div>
      <p style="margin-top:10px;font-size:17px">${esc(p.one_liner || '')}</p>
      <div class="links">
        <a href="${esc(p.linkedin)}" target="_blank" rel="noopener">${srcTag('li')} LinkedIn</a>
        <a href="${esc(p.instagram)}" target="_blank" rel="noopener">${srcTag('ig')} Instagram</a>
        <a href="#/rankings?${esc(id)}" data-rank="${esc(id)}">Their ranking ↓</a>
      </div>
    </div>
  </div>

  <section class="grid g2">
    <div class="card">
      <h3>How the agent read ${esc(first(p.name))}</h3>
      <ul class="readlog">${(p.reading_log || []).map((l, i) => `<li style="animation-delay:${i * 0.25}s">${srcTag(l)} <span>${esc(l.replace(/^(LinkedIn|Instagram):\s*/i, ''))}</span></li>`).join('')}</ul>
    </div>
    <div class="card">
      <h3>Who they are</h3>
      <p>${esc(p.summary || '')}</p>
      <h3 style="margin-top:14px">Who would fit</h3>
      <p>${esc(p.ideal_partner || '')}</p>
      <div>${(p.dealbreakers || []).map((d) => `<span class="chip accent">✕ ${esc(d)}</span>`).join('')}</div>
    </div>
  </section>

  <section>
    <h2>Needs</h2>
    <div class="grid g2">${(p.needs || []).map((n) => `<div class="card need"><b>${esc(n.need)}</b> <span class="tag">${n.confidence ?? '?'}% confident</span><p class="muted small" style="margin:6px 0 0">${esc(n.why)}</p>${evidence(n.evidence)}</div>`).join('')}</div>
  </section>

  <section class="grid g2">
    <div class="card"><h3>Hobbies</h3>${(p.hobbies || []).map((h) => `<div style="margin-bottom:10px"><b>${esc(h.name)}</b>${evidence(h.evidence)}</div>`).join('')}</div>
    <div class="card"><h3>Interests</h3>${(p.interests || []).map((h) => `<div style="margin-bottom:10px"><b>${esc(h.name)}</b>${evidence(h.evidence)}</div>`).join('')}</div>
  </section>

  <section class="grid g3">
    <div class="card"><h3>Values</h3>${(p.values || []).map((v) => `<span class="chip teal">${esc(v)}</span>`).join('')}
      <h3 style="margin-top:14px">Green flags</h3>${(p.green_flags || []).map((v) => `<div class="small">✓ ${esc(v)}</div>`).join('')}
      <h3 style="margin-top:14px">Watch-outs</h3>${(p.watch_outs || []).map((v) => `<div class="small">! ${esc(v)}</div>`).join('')}</div>
    <div class="card bars"><h3>Personality</h3>
      ${['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotional_stability'].map((k) => `<div class="row"><span>${k.replace('_', ' ')}</span><div class="bar"><i style="width:${per[k] || 0}%"></i></div><span>${per[k] ?? '–'}</span></div>`).join('')}
      <p class="small muted" style="margin-top:10px">${esc(per.read || '')}</p></div>
    <div class="card"><h3>Other qualities</h3><dl class="kv">
      ${Object.entries(q).map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
  </section>

  <section class="grid g2">
    <div class="card"><h3>Date ideas</h3>${(p.date_ideas || []).map((d) => `<div class="small" style="margin-bottom:6px">· ${esc(d)}</div>`).join('')}
      <h3 style="margin-top:14px">Voice the agent uses on dates</h3><p class="small muted">${esc(p.voice || '')}</p></div>
    <div class="card"><h3>Data quality</h3>
      <p class="small">LinkedIn: <b>${esc(p.data_quality?.linkedin || '?')}</b> · Instagram: <b>${esc(p.data_quality?.instagram || '?')}</b> · Confidence: <b>${p.data_quality?.confidence ?? '?'}%</b></p>
      ${(p.data_quality?.gaps || []).map((g) => `<div class="small muted">– ${esc(g)}</div>`).join('')}
      <details class="raw" style="margin-top:12px"><summary>Raw LinkedIn text the agent read</summary><pre>${esc(rawLinkedIn(src.linkedin))}</pre></details>
      <details class="raw"><summary>Raw Instagram text the agent read</summary><pre>${esc(rawInstagram(src.instagram))}</pre></details>
    </div>
  </section>

  <section>
    <h2>${esc(first(p.name))}'s dates</h2>
    ${myDates.length ? `<div class="grid g3">${myDates.map(dateCard).join('')}</div>` : `<p class="muted">No dates yet.</p>`}
  </section>

  <section id="ranking">
    <h2>Who fits ${esc(first(p.name))} best</h2>
    <p class="muted small">All ${ranking.length} other people, ranked by ${esc(first(p.name))}'s agent. Scores combine both agents' swipes and, where they met, both agents' date debriefs.</p>
    ${rankingList(id, ranking)}
  </section>`;
  $app.querySelector('[data-rank]')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('ranking').scrollIntoView({ behavior: 'smooth' });
  });
}

const first = (n = '') => n.split(' ')[0];

function rawLinkedIn(li) {
  if (!li) return '(not available)';
  if (li.error) return `Error: ${li.error}`;
  return [`${li.name} — ${li.headline}`, li.description, li.about && `About: ${li.about}`, li.experience && `Experience: ${li.experience}`, li.education && `Education: ${li.education}`, li.articles?.length && `Articles: ${li.articles.join(' | ')}`, li.posts && `Posts: ${li.posts}`].filter(Boolean).join('\n\n');
}
function rawInstagram(ig) {
  if (!ig) return '(not available)';
  if (ig.error) return `Error: ${ig.error}`;
  return [`${ig.name} (@${ig.username}) · ${ig.followers} followers · ${ig.posts} posts`, `Bio: ${ig.biography}`, ...(ig.captions || []).map((c, i) => `Post ${i + 1}: ${c}`)].join('\n\n');
}

function rankingList(id, ranking, limit = 99) {
  return ranking
    .slice(0, limit)
    .map((r, i) => {
      const o = W.byId[r.id];
      const d = r.dated ? W.dates.find((x) => dateKey(x.a, x.b) === dateKey(id, r.id)) : null;
      const both2 = r.verdict?.mine === 'second date' && r.verdict?.theirs === 'second date';
      return `<a class="rank" href="${d ? `#/date/${esc(dateKey(d.a, d.b))}` : `#/p/${esc(r.id)}`}">
        <span class="n">${i + 1}</span>${avatar(o, 'sm')}
        <span><b>${esc(o?.name)}</b>${r.dated ? '<span class="tag met">went on a date</span>' : ''}${both2 ? '<span class="tag hot">both want a 2nd date</span>' : ''}
          <div class="why">${esc(r.reason)}</div></span>
        <span class="score"><b>${r.score}</b><div class="small muted">${r.dated ? `date ${r.dateScore}` : `swipes ${r.youLiked ?? '–'}/${r.theyLiked ?? '–'}`}</div></span>
      </a>`;
    })
    .join('');
}

function dateCard(d) {
  const a = W.byId[d.a];
  const b = W.byId[d.b];
  if (!a || !b) return '';
  const da = d.debriefs?.[d.a];
  const db = d.debriefs?.[d.b];
  const score = da && db ? Math.round(Math.sqrt(da.overall * db.overall)) : '–';
  return `<a class="card datecard" href="#/date/${esc(dateKey(d.a, d.b))}">
    <div class="pair">${avatar(a, 'md')}${avatar(b, 'md')}<div style="margin-left:8px"><b>${esc(first(a.name))} &amp; ${esc(first(b.name))}</b><div class="small muted">fit ${score}</div></div></div>
    <div class="small muted">📍 ${esc(d.venue)}</div>
    <div class="small">${da ? `<span class="verdict ${verdictClass(da.verdict)}">${esc(first(a.name))}: ${esc(da.verdict)}</span> · <span class="verdict ${verdictClass(db?.verdict)}">${esc(first(b.name))}: ${esc(db?.verdict)}</span>` : ''}</div>
  </a>`;
}
const verdictClass = (v = '') => v.replace(/\s+/g, '-');

function bestCouples() {
  return [...W.dates]
    .filter((d) => d.debriefs?.[d.a] && d.debriefs?.[d.b])
    .sort((x, y) => Math.sqrt(y.debriefs[y.a].overall * y.debriefs[y.b].overall) - Math.sqrt(x.debriefs[x.a].overall * x.debriefs[x.b].overall));
}

function datesPage() {
  const all = bestCouples();
  $app.innerHTML = `<h1>Dates</h1><p class="muted">${all.length} first dates, each a real back-and-forth between two agents (${DATE_TURNS} messages, one model call per message), followed by a private debrief from each side. Sorted by mutual fit.</p>
  <div class="grid g3">${all.map(dateCard).join('')}</div>`;
}

async function datePage(key) {
  const d = W.dates.find((x) => dateKey(x.a, x.b) === key);
  if (!d) return ($app.innerHTML = '<p>Date not found.</p>');
  const token = routeToken;
  const a = W.byId[d.a];
  const b = W.byId[d.b];
  $app.innerHTML = `
    <div class="scene">
      <div class="couple">${avatar(a, 'md')}<span class="heart">♥</span>${avatar(b, 'md')}
        <div><div style="font-family:Fraunces,serif;font-size:22px">${esc(a.name)} &amp; ${esc(b.name)}</div><div style="opacity:.75">📍 ${esc(d.venue)}</div></div></div>
      <div class="controls">
        <button class="btn small ghost" id="replay" style="color:var(--bg)!important;border-color:rgba(255,255,255,.3)">Replay</button>
        <button class="btn small ghost" id="skip" style="color:var(--bg)!important;border-color:rgba(255,255,255,.3)">Show all</button>
        <label class="small"><input type="checkbox" id="thoughts" checked> private thoughts</label>
      </div>
    </div>
    <p class="small muted" style="margin-top:12px">${esc(first(a.name))}'s agent asked ${esc(first(b.name))}'s agent out (interest ${W.swipes[d.a]?.[d.b]?.interest ?? '–'}; ${esc(first(b.name))}'s agent had them at ${W.swipes[d.b]?.[d.a]?.interest ?? '–'}). Each message below is a separate model call by that person's agent, which knows only its own person and what has been said.</p>
    <div class="chat" id="chat"></div>
    <div id="debriefs"></div>`;
  const chat = document.getElementById('chat');
  document.getElementById('thoughts').onchange = (e) => chat.classList.toggle('hide-thoughts', !e.target.checked);
  let instant = false;
  document.getElementById('skip').onclick = () => (instant = true);
  document.getElementById('replay').onclick = () => datePage(key);

  for (const m of d.transcript) {
    if (token !== routeToken) return;
    const right = m.speakerId === d.b;
    if (!instant) {
      const t = document.createElement('div');
      t.className = `typing ${right ? 'right' : ''}`;
      t.innerHTML = `${esc(first(m.speaker))}'s agent is typing<span class="dots"></span>`;
      chat.appendChild(t);
      await sleep(Math.min(2600, 700 + m.say.length * 14));
      t.remove();
      if (token !== routeToken) return;
    }
    chat.insertAdjacentHTML('beforeend', bubble(m, right ? b : a, right));
    if (!instant) await sleep(500);
  }
  if (token !== routeToken) return;
  document.getElementById('debriefs').innerHTML = debriefsHTML(d, a, b);
}

function bubble(m, p, right) {
  const v = Number(m.vibe) || 0;
  const vibe = v > 0 ? `<span class="vibe" style="color:var(--teal)">▲${v}</span>` : v < 0 ? `<span class="vibe" style="color:var(--accent)">▼${-v}</span>` : '';
  return `<div class="msg ${right ? 'right' : ''}">${avatar(p, 'sm')}<div class="bubble"><div class="who-name">${esc(p.name)}'s agent ${vibe}</div>${fmtSay(m.say)}${m.thought ? `<div class="thought">${esc(m.thought)}</div>` : ''}</div></div>`;
}

function debriefsHTML(d, a, b) {
  const one = (p, other) => {
    const r = d.debriefs?.[p.id];
    if (!r) return '';
    return `<div class="card bars">
      <div class="controls" style="justify-content:space-between"><h3 style="margin:0">${esc(first(p.name))}'s agent reports back</h3><span class="verdict ${verdictClass(r.verdict)}">${esc(r.verdict)}</span></div>
      <p style="margin-top:10px">“${esc(r.report)}”</p>
      ${Object.entries(r.scores || {}).map(([k, v]) => `<div class="row"><span>${esc(k.replace(/_/g, ' '))}</span><div class="bar"><i style="width:${v}%"></i></div><span>${v}</span></div>`).join('')}
      <div class="row"><span><b>overall fit</b></span><div class="bar"><i style="width:${r.overall}%;background:var(--accent)"></i></div><span><b>${r.overall}</b></span></div>
      <p class="small" style="margin-top:10px"><b>Best moment:</b> ${esc(r.highlight)}</p>
      <p class="small"><b>Doubt:</b> ${esc(r.concern)}</p>
    </div>`;
  };
  return `<h2>The debrief</h2><p class="muted small">Each agent reports privately to its own person. The other side never sees this.</p><div class="grid g2">${one(a, b)}${one(b, a)}</div>
    <p style="margin-top:16px"><a href="#/p/${esc(a.id)}">${esc(first(a.name))}'s full ranking →</a> &nbsp; <a href="#/p/${esc(b.id)}">${esc(first(b.name))}'s full ranking →</a></p>`;
}

function rankingsPage() {
  const sel = (location.hash.split('?')[1] || W.ids[0]) ?? '';
  $app.innerHTML = `
  <h1>Rankings</h1>
  <p class="muted">For every person, who fits them best. Pick a person to see their full list, or scan everyone's top three below.</p>
  <div class="grid g2" style="align-items:start">
    <div class="card">
      <select id="who">${W.people.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <div id="one" style="margin-top:10px"></div>
    </div>
    <div class="card tablewrap">
      <table class="board"><thead><tr><th>Person</th><th>#1</th><th>#2</th><th>#3</th></tr></thead><tbody>
      ${W.people.map((p) => `<tr><td><a class="who" href="#/p/${esc(p.id)}">${avatar(p, 'sm')} ${esc(first(p.name))}</a></td>${(RANK[p.id] || []).slice(0, 3).map((r) => `<td><a class="who" href="#/p/${esc(r.id)}" title="${esc(r.reason)}">${avatar(W.byId[r.id], 'sm')}<span>${esc(first(W.byId[r.id]?.name))}<br><span class="small muted">${r.score}${r.dated ? ' ♥' : ''}</span></span></a></td>`).join('')}</tr>`).join('')}
      </tbody></table>
      <p class="small muted">♥ = they went on a date. Hover a name for the agent's reason.</p>
    </div>
  </div>`;
  const draw = (id) => (document.getElementById('one').innerHTML = rankingList(id, RANK[id] || []));
  document.getElementById('who').onchange = (e) => draw(e.target.value);
  draw(document.getElementById('who').value);
}

// ---------- live: add a person ----------
async function api(name, body) {
  const r = await fetch(`/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function newPage() {
  $app.innerHTML = `
  <h1>Add a person</h1>
  <p class="muted">Paste two official links. Their agent reads both, writes the profile, swipes on everyone already here, then goes on live dates with the three best mutual matches. Takes about 2-4 minutes.</p>
  <div class="card">
    <form id="f" class="grid g2">
      <label><div class="small muted">LinkedIn profile</div><input type="url" name="linkedin" required placeholder="https://www.linkedin.com/in/…"></label>
      <label><div class="small muted">Instagram profile (public)</div><input type="url" name="instagram" required placeholder="https://www.instagram.com/…"></label>
      <div class="controls"><button class="btn" id="go">Send in the agent</button>
        <button type="button" class="btn ghost" id="sample">Try a sample</button>
        <span class="small muted">Dates against: <select name="dates" style="width:auto;display:inline-block;padding:5px"><option value="3">top 3 matches</option><option value="2">top 2</option><option value="1">top 1</option></select></span></div>
    </form>
  </div>
  <div class="steps" id="steps" style="margin-top:24px"></div>
  ${local.people.length ? `<section><h3>Added in this browser</h3><div class="grid g3">${local.people.map(personCard).join('')}</div><button class="btn ghost small" id="clear" style="margin-top:12px">Remove people I added</button></section>` : ''}`;
  const f = document.getElementById('f');
  document.getElementById('sample').onclick = () => {
    f.linkedin.value = 'https://www.linkedin.com/in/sundarpichai/';
    f.instagram.value = 'https://www.instagram.com/sundarpichai/';
  };
  document.getElementById('clear')?.addEventListener('click', () => {
    local = { people: [], swipes: {}, dates: [], sources: {} };
    saveLocal();
    refresh();
    newPage();
  });
  f.onsubmit = (e) => {
    e.preventDefault();
    runLive(f.linkedin.value.trim(), f.instagram.value.trim(), Number(f.dates.value));
  };
}

function step(id, title) {
  const el = document.createElement('div');
  el.className = 'step run';
  el.innerHTML = `<div class="dot">…</div><div class="body"><b>${title}</b><div class="out small"></div></div>`;
  document.getElementById('steps').appendChild(el);
  const out = el.querySelector('.out');
  return {
    out,
    done(html) {
      el.className = 'step done';
      el.querySelector('.dot').textContent = '✓';
      if (html !== undefined) out.innerHTML = html;
    },
    fail(msg) {
      el.className = 'step err';
      el.querySelector('.dot').textContent = '!';
      out.innerHTML = `<span class="err">${esc(msg)}</span>`;
    },
    log(html) {
      out.innerHTML = html;
    },
  };
}

async function runLive(linkedin, instagram, nDates) {
  const btn = document.getElementById('go');
  btn.disabled = true;
  document.getElementById('steps').innerHTML = '';
  try {
    // 1. Scrape
    const s1 = step('scrape', 'Reading the two sources');
    s1.log('Fetching the public LinkedIn and Instagram pages…');
    let scraped;
    try {
      scraped = await api('scrape', { linkedin, instagram });
    } catch (e) {
      return s1.fail(e.message);
    }
    const li = scraped.linkedin;
    const ig = scraped.instagram;
    s1.done(`
      <div class="grid g2" style="margin-top:8px">
        <div class="note">${srcTag('li')} ${li.error ? `<span class="err">${esc(li.error)}</span>` : `<b>${esc(li.name)}</b> · ${esc(li.headline)}<br><span class="muted">${esc((li.about || li.description || '').slice(0, 220))}…</span><br><span class="muted">${li.articles?.length || 0} articles · ${li.posts ? 'recent posts found' : 'no posts visible'}</span>`}</div>
        <div class="note">${srcTag('ig')} ${ig.error ? `<span class="err">${esc(ig.error)}</span>` : `<b>${esc(ig.name)}</b> @${esc(ig.username)} · ${esc(ig.followers)} followers<br><span class="muted">${esc(ig.biography || '(no bio)')}</span><br><span class="muted">${ig.captions?.length || 0} post captions read</span>`}</div>
      </div>`);

    // 2. Analyze
    const s2 = step('analyze', 'The agent analyzes the person');
    s2.log('Reading both sources and writing the profile (needs, hobbies, interests, values, personality)…');
    let profile;
    try {
      profile = await api('analyze', { scraped });
    } catch (e) {
      return s2.fail(e.message);
    }
    profile.linkedin = li.url || linkedin;
    profile.instagram = ig.url || instagram;
    profile.avatarUrl = ig.image || li.image || null;
    s2.done(`<ul class="readlog" style="margin-top:6px">${(profile.reading_log || []).map((l, i) => `<li style="animation-delay:${i * 0.2}s">${srcTag(l)} <span>${esc(l.replace(/^(LinkedIn|Instagram):\s*/i, ''))}</span></li>`).join('')}</ul>
      <p style="margin-top:8px"><b>${esc(profile.name)}</b>: ${esc(profile.one_liner)}</p>
      <div>${(profile.needs || []).map((n) => `<span class="chip accent">${esc(n.need)}</span>`).join('')}</div>
      <div>${(profile.interests || []).map((n) => `<span class="chip">${esc(n.name)}</span>`).join('')}</div>`);

    // Save immediately so the profile page works even if dating is interrupted.
    local.people = local.people.filter((p) => p.id !== profile.id).concat(profile);
    local.sources[profile.id] = scraped;
    local.swipes[profile.id] = {};
    local.dates = local.dates.filter((d) => d.a !== profile.id && d.b !== profile.id);
    saveLocal();
    refresh();
    document.querySelector('.step.done:last-child .out').insertAdjacentHTML('beforeend', `<p><a class="btn small" href="#/p/${esc(profile.id)}" target="_blank">Open the full profile page</a></p>`);

    // 3. Swipe both ways
    const s3 = step('swipe', 'Swiping: the new agent screens everyone, and everyone screens back');
    const pool = W.people.filter((p) => p.id !== profile.id);
    s3.log(`${esc(first(profile.name))}'s agent is reviewing ${pool.length} cards, and ${pool.length} agents are reviewing ${esc(first(profile.name))}…`);
    let sw;
    try {
      sw = await api('swipe', { me: profile, pool: pool.map(slim) });
    } catch (e) {
      return s3.fail(e.message);
    }
    for (const s of sw.mine) if (W.byId[s.id]) local.swipes[profile.id][s.id] = s;
    for (const s of sw.theirs) {
      if (!W.byId[s.id]) continue;
      local.swipes[s.id] = local.swipes[s.id] || {};
      local.swipes[s.id][profile.id] = s;
    }
    saveLocal();
    refresh();
    const picks = pool
      .map((p) => ({ p, s: mutualScreen(W.swipes, profile.id, p.id), mine: W.swipes[profile.id][p.id] }))
      .sort((x, y) => y.s - x.s)
      .slice(0, nDates);
    s3.done(`<div style="margin-top:6px">${picks.map(({ p, s, mine }) => `<div class="controls" style="margin:6px 0">${avatar(p, 'sm')}<b>${esc(p.name)}</b><span class="tag hot">mutual ${Math.round(s)}</span><span class="muted">${esc(mine?.reason || '')}</span></div>`).join('')}</div>`);

    // 4. Live dates
    for (const { p: other } of picks) {
      const mine = W.swipes[profile.id][other.id];
      const venue = mine?.date_idea || 'A quiet coffee shop on a Sunday morning';
      const s4 = step('date', `Date with ${esc(other.name)} · 📍 ${esc(venue)}`);
      s4.log(`<div class="chat" style="padding:8px 0"></div>`);
      const chat = s4.out.querySelector('.chat');
      const transcript = [];
      try {
        for (let turn = 0; turn < DATE_TURNS; turn++) {
          const self = turn % 2 === 0 ? profile : other;
          const them = turn % 2 === 0 ? other : profile;
          const typing = document.createElement('div');
          typing.className = `typing ${self === other ? 'right' : ''}`;
          typing.innerHTML = `${esc(first(self.name))}'s agent is typing<span class="dots"></span>`;
          chat.appendChild(typing);
          const m = await api('date-turn', { self: slim(self), other: slim(them), venue, transcript, turn });
          typing.remove();
          const msg = { speaker: self.name, speakerId: self.id, say: m.say, thought: m.thought, vibe: m.vibe };
          transcript.push(msg);
          chat.insertAdjacentHTML('beforeend', bubble(msg, self, self === other));
        }
        const [da, db] = await Promise.all([
          api('debrief', { self: slim(profile), other: slim(other), venue, transcript }),
          api('debrief', { self: slim(other), other: slim(profile), venue, transcript }),
        ]);
        const d = { a: profile.id, b: other.id, venue, transcript, debriefs: { [profile.id]: da, [other.id]: db } };
        local.dates.push(d);
        saveLocal();
        refresh();
        s4.done();
        s4.out.appendChild(chat);
        s4.out.insertAdjacentHTML('beforeend', `<p><span class="verdict ${verdictClass(da.verdict)}">${esc(first(profile.name))}'s agent: ${esc(da.verdict)} (${da.overall})</span> · <span class="verdict ${verdictClass(db.verdict)}">${esc(first(other.name))}'s agent: ${esc(db.verdict)} (${db.overall})</span> · <a href="#/date/${esc(dateKey(d.a, d.b))}">open date</a></p><p class="muted">“${esc(da.report)}”</p>`);
      } catch (e) {
        s4.fail(e.message);
      }
    }

    // 5. Ranking
    const s5 = step('rank', `Ranking: who fits ${esc(first(profile.name))} best`);
    s5.done(`<div class="card" style="margin-top:8px">${rankingList(profile.id, RANK[profile.id] || [], 10)}</div><p><a class="btn small" href="#/p/${esc(profile.id)}">Open ${esc(first(profile.name))}'s profile and full ranking</a></p>`);
  } finally {
    btn.disabled = false;
  }
}

// Strip the heavy fields before sending a profile to the API.
function slim(p) {
  const { reading_log, data_quality, date_ideas, ...rest } = p;
  return rest;
}

// ---------- boot ----------
(async () => {
  try {
    const r = await fetch('/data/demo.json');
    if (r.ok) demo = await r.json();
  } catch {}
  refresh();
  route();
})();
