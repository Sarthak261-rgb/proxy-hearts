# Proxy Hearts — agents that date on your behalf

> **In one breath (200 chars):** Paste a LinkedIn + public Instagram. An AI agent reads both, builds an evidence-backed profile, swipes on and dates every other agent turn by turn, then ranks who fits you best.

Every person is represented by an agent. The agent reads its person from exactly two sources — their public LinkedIn and their public Instagram — writes a profile page (needs, hobbies, interests, values, personality, and more), then goes on real turn-by-turn dates with the other agents and reports back. Every person ends up with a ranking of who fits them best.

- **Live site:** https://proxy-hearts.vercel.app
- **Demo (26 people, already run):** https://proxy-hearts.vercel.app/#/people
- **Video:** _(YouTube URL)_

## What you can do on the site

| Page | What it shows |
|---|---|
| `#/people` | The 26 agents, each built from one LinkedIn + one public Instagram |
| `#/p/<id>` | Profile page: the agent's reading log, needs (with quotes), hobbies, interests, values, Big Five, qualities, green flags, watch-outs, dealbreakers, ideal partner, the raw text it read, the person's dates and their full ranking |
| `#/dates` | Every date, sorted by mutual fit |
| `#/date/<a__b>` | Date replay: each message, each agent's private thoughts, and both private debriefs with scores and verdicts |
| `#/rankings` | Everyone's top 3, plus the full ranking for any person |
| `#/new` | Paste your own links: watch it scrape, analyze, swipe on the pool, date its top matches live, and rank |

## How the harness works

```
LinkedIn (public) ─┐
                   ├─► scrape ─► agent reads its person ─► profile page
Instagram (public) ┘                                         │
                                                             ▼
                        swipe on every other agent's public card (0-100 + reason + date idea)
                                                             │
                     pair by mutual interest √(A→B × B→A); everyone gets ≥2 dates
                                                             │
                     date: 6 messages, one LLM call per message, each agent alone with
                     its own person's brief + the transcript; private thought per message
                                                             │
                     debrief: each agent privately scores the date for ITS person
                                                             │
                                               ranking for every person
```

1. **Read.** `lib/scrape.js` fetches the two public pages (details below).
2. **Understand.** `analyzePerson` (Gemini 3.5 Flash-Lite, JSON mode) may use only the scraped text. Every need, hobby and interest carries a verbatim quote and its source, and the agent reports its own data quality and gaps. It also writes a voice guide for speaking on the person's behalf.
3. **Swipe.** Each agent sees the others' *public cards* only (name, headline, interests, values, lifestyle). It never sees their private brief. It scores interest from 0 to 100 for its own person, with a reason and a date idea.
4. **Match.** `selectDates` pairs people by the geometric mean of the two interest scores, so one-sided crushes rank low. The strongest pairs date first, and everyone gets at least 2 dates and at most 3.
5. **Date.** The more interested agent's date idea sets the scene. The agents alternate for 6 messages. Each message is its own model call, made by an agent that knows only its own person plus what has been said so far. Each date has three phases: open, then probe a need or dealbreaker, then close honestly. Every message carries a private thought and a vibe shift (−2..2) that the other side never sees.
6. **Debrief.** Each agent separately scores values, lifestyle, shared interests, communication, chemistry and needs met, gives an overall fit score, a verdict (`second date` / `friends` / `pass`) and a note to its person.
7. **Rank.** `public/js/rank.js`:
   - `screen = √(A→B × B→A)`
   - dated: `0.3·screen + 0.7·√(debriefA × debriefB)`, +4 if both want a second date, −6 if either passes
   - not dated: `0.9·screen`

## Technical section: how Instagram and LinkedIn are scraped

Plain Node.js `fetch` plus HTML/JSON parsing. No headless browser, no login, no cookies, no third-party mirrors, no paid scraping APIs.

- **LinkedIn:** `GET https://www.linkedin.com/in/<slug>/`. Anonymous browser requests are throttled with HTTP 999. The public profile is served to link-preview crawlers, so the scraper rotates preview user agents (`facebookexternalhit`, `Twitterbot`, `Slackbot`) and falls back to a desktop browser UA. From the HTML it parses: `<title>` (name and headline), `og:description` (current role, education, location), the `data-section` blocks (`summary`/About, `experience`, `education`, `posts`, `volunteering`, `languages`), and the JSON-LD `@graph` of authored articles.
- **Instagram:** `GET https://www.instagram.com/<username>/`. Normal clients get an empty JS shell and the JSON API returns 429. For search and preview crawlers (Googlebot UA, then `facebookexternalhit`), Instagram server-renders the profile with embedded JSON. The scraper extracts `full_name`, `biography`, `category`, `is_verified`, `is_private`, follower/following/post counts from the meta description, the captions of the latest ~12 posts (`"caption":{"text":…}`, falling back to image `alt` text) and the profile picture. Private accounts are rejected.
- Profile pictures are proxied through `/api/avatar`, which only allows the Instagram and LinkedIn CDNs, because those CDNs block hotlinking.

**Stack:**
- Node.js 20+ serverless functions on Vercel (`api/*.js`), with the same handlers run locally by `dev-server.js`
- Google Gemini (`gemini-3.5-flash-lite` for analysis, swipes and debriefs; `gemini-3.1-flash-lite` for date turns (Lite models, so the free tier covers a full 26-person run)), with a per-model rate limiter and retry
- A vanilla JS single-page front end
- No database: the pre-run demo is a static JSON file, and people you add are kept in your browser's localStorage

## Run it yourself

```bash
cp .env.example .env              # add GEMINI_API_KEY
npm run dev                       # http://localhost:3000
npm run demo                      # re-run the whole pipeline for data/people.json -> public/data/demo.json
```

`scripts/run-demo.js` caches every stage in `data/cache/` so it can resume after a rate limit.

## Files

```
lib/scrape.js     LinkedIn + Instagram scrapers
lib/agents.js     analyze, swipe, reviewNewcomer, dateTurn, debrief, runDate
lib/llm.js        Gemini client (JSON mode, rate limit, retries, model fallback)
api/*.js          scrape, analyze, swipe, date-turn, debrief, avatar, health
public/js/rank.js date pairing + ranking (shared by browser and Node)
public/js/app.js  the website
scripts/run-demo.js      full pipeline for the demo
scripts/record-video.mjs scripted screen recording used for the video
data/people.json  the 26 people and their two links
```

## Note

The demo uses public figures' public profiles for a technical exercise. Every date, score and verdict is generated by AI agents. It is a simulation and makes no claim about the real people.
