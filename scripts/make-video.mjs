// Builds the final video: neural voiceover per segment (edge-tts) + each recorded segment
// retimed to its narration (sped up if longer, last frame held if shorter), then concatenated.
// Usage: node scripts/make-video.mjs   ->  video/proxy-hearts-demo.mp4
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const plan = JSON.parse(fs.readFileSync('video/plan.json', 'utf8'));
const first = (n) => n.split(' ')[0];
const VOICE = process.env.VO_VOICE || 'en-US-AndrewNeural';

const lines = {
  '01-home': `This is Proxy Hearts, an agentic dating site. Every person is represented by an AI agent, and the agents date each other. We found ${plan.people} real people. Each one is exactly two official links: their LinkedIn, and their public Instagram. Nothing else.`,
  '02-profile': `First, how an agent analyzes its person. ${plan.star}'s agent read the public LinkedIn and Instagram, and logged what it noticed along the way. Then it wrote the profile. What ${first(plan.star)} needs in a partner, each backed by a direct quote and its source. Hobbies and interests, with evidence. Values, a personality read, humor, communication style and lifestyle. Green flags, watch-outs, dealbreakers, and the voice the agent will use on dates. And to check its work, here is the raw text it read.`,
  '03-date': `Now the agents date. Every agent swipes on every other agent's public card, and the strongest mutual pairs go out. Here, ${first(plan.star)}'s agent and ${first(plan.partner)}'s agent meet at ${plan.venue.replace(/\.$/, '')}. Every message is a separate model call, by an agent that knows only its own person and what has been said. The green lines are private thoughts the other side never sees. They open, probe each other's needs and dealbreakers, and close honestly. Then each agent reports back privately to its own person, with six scores, an overall fit, and a verdict.`,
  '04-rankings': `After ${plan.dates} dates, every person gets a ranking. It combines both sides' swipes with both agents' date verdicts, so one-sided interest ranks low. Here is everyone's top three, and ${first(plan.star)}'s full list of everyone else.`,
  '05-live': `And it works live. Paste any LinkedIn and public Instagram. The site scrapes both, the new agent reads its person, swipes on the whole pool while the pool's agents review it back, then goes on a real date, message by message, and ends with a ranking.`,
  '06-how': `Under the hood: plain Node fetch reads the public LinkedIn and Instagram pages, Gemini powers every agent, and it all runs on Vercel. The code is on GitHub. That's Proxy Hearts.`,
};

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const dur = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());

fs.mkdirSync('video/vo', { recursive: true });
fs.mkdirSync('video/seg', { recursive: true });
const parts = [];
let total = 0;
for (const [name, text] of Object.entries(lines)) {
  const mp3 = `video/vo/${name}.mp3`;
  run('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate', '+6%', '--text', text, '--write-media', mp3]);
  const A = dur(mp3) + 0.6; // breathing room between segments
  const V = dur(`video/raw/${name}.webm`);
  const vf =
    V > A
      ? `setpts=PTS*${(A / V).toFixed(5)},fps=30`
      : `tpad=stop_mode=clone:stop_duration=${(A - V).toFixed(2)},fps=30`;
  const out = `video/seg/${name}.mp4`;
  run('ffmpeg', ['-y', '-i', `video/raw/${name}.webm`, '-i', mp3, '-filter_complex', `[0:v]${vf},format=yuv420p[v];[1:a]apad[a]`, '-map', '[v]', '-map', '[a]', '-t', A.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', out]);
  parts.push(out);
  total += A;
  console.log(`${name}: video ${V.toFixed(1)}s -> ${A.toFixed(1)}s (${V > A ? 'x' + (V / A).toFixed(2) + ' speed' : 'held'})`);
}
fs.writeFileSync('video/seg/list.txt', parts.map((p) => `file '${p.replace('video/seg/', '')}'`).join('\n'));
run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'video/seg/list.txt', '-c', 'copy', 'video/proxy-hearts-demo.mp4']);
console.log(`total ${total.toFixed(1)}s ${total > 180 ? 'OVER 3 MIN - shorten the script' : 'OK'} -> video/proxy-hearts-demo.mp4`);
