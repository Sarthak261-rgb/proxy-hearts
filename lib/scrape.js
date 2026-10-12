// Scrapers for the only two allowed sources: a public LinkedIn profile and a public Instagram profile.
// No logins, no third-party mirrors, no paid scraping APIs. Plain HTTP + HTML/JSON parsing.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
// Instagram serves server-rendered profile data (bio + recent captions) to search/link-preview crawlers.
const CRAWLER_UAS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
];

const LINKEDIN_UAS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Twitterbot/1.0',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  BROWSER_UA,
];

const decode = (s = '') =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const stripTags = (html = '') =>
  decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[a-zA-Z/!](?:"[^"]*"|'[^']*'|[^'">])*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const meta = (html, key) => {
  const re = new RegExp(
    `<meta[^>]*(?:property|name)="${key}"[^>]*content="([^"]*)"|<meta[^>]*content="([^"]*)"[^>]*(?:property|name)="${key}"`,
    'i'
  );
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2]) : '';
};

const unescapeJson = (s) => {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
};

export function normalizeLinkedIn(input = '') {
  const s = input.trim();
  const m = s.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  const slug = m ? m[1] : /^[\w-]+$/.test(s) ? s : null;
  return slug ? { slug: decodeURIComponent(slug), url: `https://www.linkedin.com/in/${slug}/` } : null;
}

export function normalizeInstagram(input = '') {
  const s = input.trim().replace(/^@/, '');
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  const user = m ? m[1] : /^[\w.]+$/.test(s) ? s : null;
  return user ? { username: user.toLowerCase(), url: `https://www.instagram.com/${user.toLowerCase()}/` } : null;
}

async function get(url, ua, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,*/*', ...extraHeaders },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, url: res.url, html: await res.text() };
}

export async function scrapeLinkedIn(input) {
  const n = normalizeLinkedIn(input);
  if (!n) throw new Error('Not a LinkedIn profile URL (expected linkedin.com/in/...)');
  // LinkedIn throttles anonymous browsers (HTTP 999) but serves the public profile to link-preview bots.
  let status, html, url;
  for (const ua of LINKEDIN_UAS) {
    ({ status, html, url } = await get(n.url, ua));
    if (status === 200 && !/authwall|uas\/login/.test(url) && /<title>/.test(html)) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (status !== 200 || /authwall|uas\/login/.test(url)) {
    throw new Error(`LinkedIn returned ${status}${/authwall/.test(url) ? ' (authwall)' : ''}`);
  }
  const title = decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/\s*\|\s*LinkedIn\s*$/, '');
  const description = meta(html, 'og:description') || meta(html, 'description');
  const image = meta(html, 'og:image');

  const section = (name) => {
    const re = new RegExp(`<section[^>]*data-section="${name}"[\\s\\S]*?</section>`, 'i');
    const m = html.match(re);
    return m ? stripTags(m[0]) : '';
  };

  let articles = [];
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      const data = JSON.parse(ld[1]);
      const graph = data['@graph'] || [data];
      articles = graph.filter((g) => g['@type'] === 'Article' && g.headline).map((g) => g.headline.trim());
    } catch {}
  }

  const out = {
    source: 'linkedin',
    url: n.url,
    name: title.split(' - ')[0].trim(),
    headline: title.split(' - ').slice(1).join(' - ').trim(),
    description: description.replace(/View [^’']+[’']s? profile on LinkedIn.*$/, '').trim(),
    about: section('summary').replace(/^About\s*/i, '').slice(0, 2500),
    experience: section('experience').replace(/^Experience\s*/i, '').slice(0, 2500),
    education: section('education').replace(/^Education\s*/i, '').slice(0, 800),
    posts: section('posts').replace(/^Activity\s*/i, '').slice(0, 2000),
    articles: articles.slice(0, 10),
    volunteering: section('volunteering').slice(0, 600),
    languages: section('languages').slice(0, 300),
    image,
  };
  if (!out.name) throw new Error('LinkedIn page had no profile data');
  return out;
}

export async function scrapeInstagram(input) {
  const n = normalizeInstagram(input);
  if (!n) throw new Error('Not an Instagram profile URL');
  let last;
  for (const ua of CRAWLER_UAS) {
    const { status, html } = await get(n.url, ua);
    last = status;
    if (status !== 200) continue;
    const ogTitle = meta(html, 'og:title');
    if (!ogTitle) continue;
    const descMeta = meta(html, 'description');

    const pick = (re) => {
      const m = html.match(re);
      return m ? unescapeJson(m[1]) : '';
    };
    const fullName = pick(/"full_name":"((?:[^"\\]|\\.)*)"/) || ogTitle.replace(/\s*\(@.*$/, '');
    const biography = pick(/"biography":"((?:[^"\\]|\\.)*)"/) || (descMeta.match(/on Instagram: "([\s\S]*)"$/) || [])[1] || '';
    const isPrivate = /"is_private":true/.test(html);
    const counts = descMeta.match(/([\d.,]+[KMB]?) Followers, ([\d.,]+[KMB]?) Following, ([\d.,]+[KMB]?) Posts/i) || [];

    const captions = [];
    const seen = new Set();
    for (const m of html.matchAll(/"caption":\{"pk":"\d+","text":"((?:[^"\\]|\\.)*)"/g)) {
      const t = unescapeJson(m[1]).trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        captions.push(t.slice(0, 600));
      }
    }
    if (!captions.length) {
      for (const m of html.matchAll(/<img[^>]*alt="([^"]{12,600})"/g)) {
        const t = decode(m[1]).trim();
        if (!/profile picture/i.test(t) && !seen.has(t)) {
          seen.add(t);
          captions.push(t);
        }
      }
    }
    const pic = pick(/"profile_pic_url":"((?:[^"\\]|\\.)*)"/) || meta(html, 'og:image');
    return {
      source: 'instagram',
      url: n.url,
      username: n.username,
      name: fullName,
      biography,
      category: pick(/"category_name":"((?:[^"\\]|\\.)*)"/) || pick(/"category":"((?:[^"\\]|\\.)*)"/),
      verified: /"is_verified":true/.test(html),
      private: isPrivate,
      followers: counts[1] || '',
      following: counts[2] || '',
      posts: counts[3] || '',
      captions: captions.slice(0, 12),
      image: pic,
    };
  }
  throw new Error(`Instagram profile not readable (HTTP ${last}). It must be public.`);
}

export async function scrapePerson({ linkedin, instagram }) {
  const [li, ig] = await Promise.allSettled([scrapeLinkedIn(linkedin), scrapeInstagram(instagram)]);
  return {
    linkedin: li.status === 'fulfilled' ? li.value : { error: li.reason.message, url: linkedin },
    instagram: ig.status === 'fulfilled' ? ig.value : { error: ig.reason.message, url: instagram },
    scrapedAt: new Date().toISOString(),
  };
}
