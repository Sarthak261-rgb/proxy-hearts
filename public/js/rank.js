// Pure ranking + date-pairing logic, shared by the browser and the Node demo runner.

const gmean = (a, b) => Math.sqrt(Math.max(a, 1) * Math.max(b, 1));

// swipes: { [fromId]: { [toId]: { interest, reason, date_idea } } }
export function mutualScreen(swipes, a, b) {
  const ab = swipes[a]?.[b]?.interest ?? 50;
  const ba = swipes[b]?.[a]?.interest ?? 50;
  return gmean(ab, ba);
}

// Pick which pairs actually go on a full date: strongest mutual interest first,
// everyone gets at least `minPer` dates, nobody more than `maxPer`.
export function selectDates(ids, swipes, { minPer = 2, maxPer = 3 } = {}) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j], mutualScreen(swipes, ids[i], ids[j])]);
  pairs.sort((x, y) => y[2] - x[2]);
  const count = Object.fromEntries(ids.map((id) => [id, 0]));
  const chosen = [];
  const take = (p) => {
    chosen.push(p);
    count[p[0]]++;
    count[p[1]]++;
  };
  for (const p of pairs) if (count[p[0]] < minPer && count[p[1]] < minPer) take(p);
  for (const id of ids) {
    for (const p of pairs) {
      if (count[id] >= minPer) break;
      if ((p[0] === id || p[1] === id) && !chosen.includes(p) && count[p[0]] < maxPer && count[p[1]] < maxPer) take(p);
    }
  }
  return chosen.map(([a, b, s]) => {
    const ab = swipes[a]?.[b];
    const ba = swipes[b]?.[a];
    // The more interested agent asked, so their date idea sets the scene.
    const [inviter, invitee, idea] =
      (ab?.interest ?? 0) >= (ba?.interest ?? 0) ? [a, b, ab?.date_idea] : [b, a, ba?.date_idea];
    return { a: inviter, b: invitee, screen: Math.round(s), venue: idea || 'A quiet coffee shop on a Sunday morning' };
  });
}

export function dateKey(a, b) {
  return [a, b].sort().join('__');
}

// rankings[personId] = [{ id, score, screen, dated, dateScore, verdict, reason }...] best first
export function computeRankings(ids, swipes, dates) {
  const byPair = {};
  for (const d of dates) byPair[dateKey(d.a, d.b)] = d;
  const out = {};
  for (const me of ids) {
    const rows = [];
    for (const other of ids) {
      if (other === me) continue;
      const screen = mutualScreen(swipes, me, other);
      const d = byPair[dateKey(me, other)];
      let score = screen * 0.9;
      let dateScore = null;
      let verdict = null;
      let reason = swipes[me]?.[other]?.reason || '';
      if (d?.debriefs?.[me] && d?.debriefs?.[other]) {
        const mine = d.debriefs[me];
        const theirs = d.debriefs[other];
        dateScore = gmean(mine.overall, theirs.overall);
        score = 0.3 * screen + 0.7 * dateScore;
        verdict = { mine: mine.verdict, theirs: theirs.verdict };
        reason = mine.report || mine.highlight || reason;
        if (mine.verdict === 'second date' && theirs.verdict === 'second date') score += 4;
        if (mine.verdict === 'pass' || theirs.verdict === 'pass') score -= 6;
      }
      rows.push({
        id: other,
        score: Math.max(0, Math.min(100, Math.round(score))),
        screen: Math.round(screen),
        youLiked: swipes[me]?.[other]?.interest ?? null,
        theyLiked: swipes[other]?.[me]?.interest ?? null,
        dated: Boolean(d),
        dateScore: dateScore && Math.round(dateScore),
        verdict,
        reason,
      });
    }
    rows.sort((x, y) => y.score - x.score);
    out[me] = rows;
  }
  return out;
}
