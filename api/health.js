import { handler } from '../lib/http.js';
import { hasKey } from '../lib/llm.js';
import { DATE_TURNS } from '../lib/agents.js';

export default handler(async () => ({ ok: true, llm: hasKey(), dateTurns: DATE_TURNS }));
