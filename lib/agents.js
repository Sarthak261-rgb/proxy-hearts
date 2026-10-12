// The dating harness. Every person gets an agent that:
//   1. reads their LinkedIn + Instagram and builds a profile (analyzePerson)
//   2. screens every other agent's public card and swipes (swipe / reviewNewcomer)
//   3. goes on dates, one message per call, with private thoughts it never shares (dateTurn)
//   4. reports back to its own person with scores and a verdict (debrief)
// Rankings are then computed from both sides' swipes and debriefs (rank.js).
import { generateJSON } from './llm.js';

const EVIDENCE_RULE =
  'You may ONLY use the LinkedIn and Instagram text provided. Never use outside knowledge about this person, even if they are famous. ' +
  'Every claim needs evidence: a short verbatim quote (under 20 words) and its source ("LinkedIn" or "Instagram"). ' +
  'If something is not supported by the text, mark it as an inference with low confidence instead of inventing it.';

function sourceDump(scraped) {
  const li = scraped.linkedin || {};
  const ig = scraped.instagram || {};
  const lines = ['=== LINKEDIN ==='];
  if (li.error) lines.push(`(unavailable: ${li.error})`);
  else {
    lines.push(`Name: ${li.name}`, `Headline: ${li.headline}`, `Summary line: ${li.description}`);
    if (li.about) lines.push(`About: ${li.about}`);
    if (li.experience) lines.push(`Experience: ${li.experience.slice(0, 1500)}`);
    if (li.education) lines.push(`Education: ${li.education}`);
    if (li.volunteering) lines.push(`Volunteering: ${li.volunteering}`);
    if (li.languages) lines.push(`Languages: ${li.languages}`);
    if (li.articles?.length) lines.push(`Article titles they wrote: ${li.articles.map((a) => `"${a}"`).join('; ')}`);
    if (li.posts) lines.push(`Recent posts/activity: ${li.posts.slice(0, 1800)}`);
  }
  lines.push('', '=== INSTAGRAM ===');
  if (ig.error) lines.push(`(unavailable: ${ig.error})`);
  else {
    lines.push(`Name: ${ig.name} (@${ig.username})`, `Bio: ${ig.biography}`);
    if (ig.category) lines.push(`Category: ${ig.category}`);
    lines.push(`Followers: ${ig.followers}, Following: ${ig.following}, Posts: ${ig.posts}`);
    (ig.captions || []).forEach((c, i) => lines.push(`Post ${i + 1} caption: ${c.replace(/\s+/g, ' ')}`));
  }
  return lines.join('\n');
}

export async function analyzePerson(scraped) {
  const system =
    'You are a dating agent being assigned to a new person. Before you can date on their behalf you must understand them deeply: ' +
    'what they need from a partner, how they spend their time, what they care about, and how they come across. ' +
    'Read like a perceptive matchmaker, not a recruiter: look past job titles to the human (tone of captions, what they celebrate, who they thank, ' +
    'what they joke about, how they talk about family, health, faith, rest, travel, food). ' +
    EVIDENCE_RULE;
  const prompt = `${sourceDump(scraped)}

Return JSON with exactly this shape:
{
 "name": string,
 "headline": string (their role in under 10 words),
 "location": string or "",
 "one_liner": string (how you would introduce them at a party, warm and specific, under 25 words),
 "summary": string (3-4 sentences: who this person is underneath the resume),
 "reading_log": [ 6-9 short strings narrating what you noticed while reading, in order, each starting with "LinkedIn:" or "Instagram:" ],
 "needs": [ 4-5 items: { "need": string (what they need in a partner/relationship), "why": string, "evidence": {"source": "LinkedIn"|"Instagram", "quote": string}, "confidence": 0-100 } ],
 "hobbies": [ 3-6 items: { "name": string, "evidence": {"source": ..., "quote": ...} } ],
 "interests": [ 4-7 items: { "name": string, "evidence": {"source": ..., "quote": ...} } ],
 "values": [ 3-5 short strings ],
 "personality": { "openness": 0-100, "conscientiousness": 0-100, "extraversion": 0-100, "agreeableness": 0-100, "emotional_stability": 0-100, "read": string (2 sentences) },
 "qualities": { "humor": string, "communication_style": string, "energy": string, "lifestyle": string, "ambition": string, "love_language_guess": string },
 "green_flags": [ 3-4 strings ],
 "watch_outs": [ 2-3 strings, honest but kind ],
 "ideal_partner": string (2 sentences, who would fit them),
 "dealbreakers": [ 2-3 strings ],
 "date_ideas": [ 3 strings, specific to their interests ],
 "voice": string (how to speak on their behalf: tone, vocabulary, phrases they actually use),
 "data_quality": { "linkedin": "rich"|"thin"|"missing", "instagram": "rich"|"thin"|"missing", "confidence": 0-100, "gaps": [strings] }
}`;
  const profile = await generateJSON({ system, prompt, temperature: 0.5, maxTokens: 4096, tier: 'smart' });
  return profile;
}

export function publicCard(p) {
  // What other agents get to see: the same thing a dating app would show.
  return {
    id: p.id,
    name: p.name,
    headline: p.headline,
    one_liner: p.one_liner,
    interests: (p.interests || []).map((i) => i.name),
    hobbies: (p.hobbies || []).map((h) => h.name),
    values: p.values,
    lifestyle: p.qualities?.lifestyle,
    energy: p.qualities?.energy,
  };
}

function privateBrief(p) {
  // What an agent knows about its OWN person (never shared directly with the other agent).
  return JSON.stringify({
    name: p.name,
    headline: p.headline,
    summary: p.summary,
    needs: (p.needs || []).map((n) => n.need),
    hobbies: (p.hobbies || []).map((h) => h.name),
    interests: (p.interests || []).map((i) => i.name),
    values: p.values,
    qualities: p.qualities,
    personality: p.personality?.read,
    ideal_partner: p.ideal_partner,
    dealbreakers: p.dealbreakers,
    watch_outs: p.watch_outs,
    voice: p.voice,
  });
}

export async function swipe(me, candidates) {
  const system =
    `You are the dating agent for ${me.name}. You know them well (private brief below). ` +
    'You are scrolling through other people\'s cards and deciding who is worth a date FOR YOUR PERSON. ' +
    'Be selective and honest: most people are not a great fit. Score interest 0-100 (50 = neutral, 80+ = rare, strong fit). ' +
    `Private brief: ${privateBrief(me)}`;
  const prompt = `Cards:\n${candidates.map((c) => JSON.stringify(publicCard(c))).join('\n')}

Return JSON: { "swipes": [ { "id": string, "interest": 0-100, "decision": "like"|"maybe"|"pass", "reason": string (one specific sentence about fit for ${me.name}), "date_idea": string (a specific first-date setting both would enjoy, under 15 words) } ] } with one entry per card, same ids.`;
  const out = await generateJSON({ system, prompt, temperature: 0.4, maxTokens: 6000, tier: 'smart' });
  return out.swipes || [];
}

export async function reviewNewcomer(newcomer, pool) {
  // One call in which every existing agent looks at the newcomer's card from its own person's point of view.
  const system =
    'You simulate many independent dating agents. Each agent knows only its own person (brief given) and sees the newcomer\'s public card. ' +
    'For each agent, decide how interested it is in the newcomer FOR ITS OWN PERSON. Be selective: 50 = neutral, 80+ = rare.';
  const prompt = `Newcomer card: ${JSON.stringify(publicCard(newcomer))}

Agents (their own person's brief):
${pool.map((p) => JSON.stringify({ id: p.id, name: p.name, needs: (p.needs || []).map((n) => n.need), interests: (p.interests || []).map((i) => i.name), values: p.values, ideal_partner: p.ideal_partner })).join('\n')}

Return JSON: { "swipes": [ { "id": string (the agent's person id), "interest": 0-100, "reason": string (one sentence) } ] }`;
  const out = await generateJSON({ system, prompt, temperature: 0.4, maxTokens: 6000, tier: 'smart' });
  return out.swipes || [];
}

export async function dateTurn({ self, other, venue, transcript, turn, totalTurns }) {
  const phase =
    turn < 2
      ? 'opening: greet, react to the setting, break the ice with something specific from their card'
      : turn < totalTurns - 2
        ? 'middle: go deeper. Probe at least one of your person\'s NEEDS or DEALBREAKERS with a real question, share a genuine story or opinion of your own'
        : 'closing: wrap up naturally. Signal honestly whether you would like to see them again (it is fine to be lukewarm)';
  const system =
    `You are the dating agent for ${self.name}, out on a first date on their behalf with the agent for ${other.name}. ` +
    `Speak in first person AS ${self.name}'s stand-in, in their voice, grounded only in what you know about them. ` +
    'Your job is not to impress at any cost: it is to find out whether this person truly fits YOUR person, and to represent your person honestly. ' +
    'Be a real, specific, charming human in conversation: reference the setting, ask follow-ups, have opinions, a little humor. No generic small talk, no listing of achievements. ' +
    `Your person (private, never paste this): ${privateBrief(self)}`;
  const prompt = `Setting: ${venue}
Their card: ${JSON.stringify(publicCard(other))}
Conversation so far:
${transcript.length ? transcript.map((m) => `${m.speaker}: ${m.say}`).join('\n') : '(you are opening the date)'}

This is message ${turn + 1} of ${totalTurns}. Phase: ${phase}.
Return JSON: { "say": string (what you say out loud, 1-3 sentences, under 60 words, may include a short *action* in asterisks), "thought": string (your private note to yourself about fit for ${self.name}, one sentence, candid), "vibe": -2..2 (how this moment changed your read: -2 much worse, 2 much better) }`;
  return generateJSON({ system, prompt, temperature: 0.95, maxTokens: 600, tier: 'fast' });
}

export async function debrief({ self, other, venue, transcript }) {
  const system =
    `You are the dating agent for ${self.name}. You just came back from a first date with ${other.name}'s agent. ` +
    `Report back to ${self.name} honestly. Judge fit against what you know your person needs, not against how pleasant the chat was. ` +
    `Your person: ${privateBrief(self)}`;
  const prompt = `Setting: ${venue}
Transcript:
${transcript.map((m) => `${m.speaker}: ${m.say}${m.speaker === self.name ? `   [my private thought: ${m.thought}]` : ''}`).join('\n')}

Return JSON: {
 "scores": { "values": 0-100, "lifestyle": 0-100, "shared_interests": 0-100, "communication": 0-100, "chemistry": 0-100, "needs_met": 0-100 },
 "overall": 0-100 (a calibrated fit score: 50 average, 75+ genuinely promising, 85+ exceptional),
 "verdict": "second date" | "friends" | "pass",
 "highlight": string (the best moment, one sentence),
 "concern": string (the biggest doubt, one sentence),
 "report": string (2-3 sentences addressed directly to ${self.name}, like a friend telling them how it went)
}`;
  return generateJSON({ system, prompt, temperature: 0.3, maxTokens: 900, tier: 'smart' });
}

export const DATE_TURNS = 6;

// Runs a whole date server-side (used by the batch demo runner). The website runs the same steps one call at a time.
export async function runDate(a, b, venue, onMessage = () => {}) {
  const transcript = [];
  for (let turn = 0; turn < DATE_TURNS; turn++) {
    const self = turn % 2 === 0 ? a : b;
    const other = turn % 2 === 0 ? b : a;
    const m = await dateTurn({ self, other, venue, transcript, turn, totalTurns: DATE_TURNS });
    const msg = { speaker: self.name, speakerId: self.id, say: m.say, thought: m.thought, vibe: m.vibe };
    transcript.push(msg);
    onMessage(msg);
  }
  const [da, db] = await Promise.all([
    debrief({ self: a, other: b, venue, transcript }),
    debrief({ self: b, other: a, venue, transcript }),
  ]);
  return { a: a.id, b: b.id, venue, transcript, debriefs: { [a.id]: da, [b.id]: db } };
}
