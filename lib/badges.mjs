// Achievements: medals earned from the public registry, in four rarities. Universal module.

export const RARITY = {
  common: { label: 'Common', a: '#e2b77c', b: '#8a5a2b' },
  rare: { label: 'Rare', a: '#a9cbff', b: '#3d6fd1' },
  epic: { label: 'Epic', a: '#dcc2ff', b: '#7a45d6' },
  legendary: { label: 'Legendary', a: '#fff1b8', b: '#d48a12' },
};

export const BADGES = [
  { id: 'first-blood', name: 'First blood', desc: 'Your first record.', rarity: 'common', glyph: 'I' },
  { id: 'pioneer', name: 'Pioneer', desc: 'The first solution ever on a case.', rarity: 'common', glyph: 'P' },
  { id: 'relay', name: 'Relay', desc: "Beat someone else's record.", rarity: 'common', glyph: 'R' },
  { id: 'collector', name: 'Collector', desc: 'Five records.', rarity: 'rare', glyph: 'V' },
  { id: 'polymath', name: 'Polymath', desc: 'Records in three different hunts.', rarity: 'rare', glyph: 'III' },
  { id: 'scout', name: 'Scout', desc: 'Found a better solution published elsewhere.', rarity: 'rare', glyph: 'S' },
  { id: 'night-owl', name: 'Night owl', desc: 'A record between midnight and 5 a.m. (UTC).', rarity: 'rare', glyph: 'N' },
  { id: 'hoarder', name: 'Hoarder', desc: 'Twenty-five records.', rarity: 'epic', glyph: 'XXV' },
  { id: 'perfectionist', name: 'Perfectionist', desc: 'Reached a proven maximum.', rarity: 'epic', glyph: 'Ω' },
  { id: 'conductor', name: 'Conductor', desc: 'Records written with three different AI models.', rarity: 'epic', glyph: 'AI' },
  { id: 'world-breaker', name: 'World breaker', desc: 'Beat a published world record.', rarity: 'legendary', glyph: 'WR' },
];

/** Which medals each hunter holds, from registry entries. Returns { author: [badge ids] }. */
export function computeBadges(entries) {
  const by = {};
  const prev = {}; // case -> author of the current best
  for (const e of entries) {
    const k = `${e.problem}/${e.case}`;
    if (e.nature === 'reference') { prev[k] = e.author; continue; }
    if (e.nature !== 'record') continue;
    const a = (by[e.author] ??= { n: 0, problems: new Set(), models: new Set(), set: new Set() });
    a.n++;
    a.problems.add(e.problem);
    if (e.model && !/built-in|test/i.test(e.model)) a.models.add(e.model);
    a.set.add('first-blood');
    if (e.tier === 'valid') a.set.add('pioneer');
    if (prev[k] && prev[k] !== e.author) a.set.add('relay');
    if (e.tier === 'known') a.set.add('scout');
    if (e.tier === 'perfect') a.set.add('perfectionist');
    if (e.tier === 'world') a.set.add('world-breaker');
    if (e.ts && Number(e.ts.slice(11, 13)) < 5) a.set.add('night-owl');
    if (a.n >= 5) a.set.add('collector');
    if (a.n >= 25) a.set.add('hoarder');
    if (a.problems.size >= 3) a.set.add('polymath');
    if (a.models.size >= 3) a.set.add('conductor');
    prev[k] = e.author;
  }
  return Object.fromEntries(Object.entries(by).map(([a, v]) => [a, BADGES.filter((b) => v.set.has(b.id)).map((b) => b.id)]));
}

/** A medal as SVG: a faceted hexagon in the rarity's metal, the glyph engraved. Locked medals are ghosts. */
export function medal(badge, size = 96, locked = false) {
  const r = RARITY[badge.rarity];
  const id = `m${badge.id.replace(/[^a-z]/g, '')}${locked ? 'l' : ''}`;
  const anim = badge.rarity === 'legendary' && !locked ? `<animate attributeName="x1" values="-1;1;-1" dur="5s" repeatCount="indefinite"/>` : '';
  const fill = locked ? 'none' : `url(#${id})`;
  const stroke = locked ? 'currentColor' : r.b;
  const fs = badge.glyph.length > 2 ? 22 : badge.glyph.length > 1 ? 26 : 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${badge.name}${locked ? ' (locked)' : ''}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${anim}<stop offset="0" stop-color="${r.a}"/><stop offset="0.55" stop-color="${r.b}"/><stop offset="1" stop-color="${r.a}"/></linearGradient></defs>
<path d="M50 4l40 23v46L50 96 10 73V27z" fill="${fill}" stroke="${stroke}" stroke-width="${locked ? 1.5 : 2}" stroke-opacity="${locked ? 0.35 : 1}" stroke-dasharray="${locked ? '4 3' : 'none'}"/>
${locked ? '' : `<path d="M50 14l31 18v36L50 86 19 68V32z" fill="none" stroke="#fff" stroke-opacity="0.35"/><path d="M50 4l40 23-40 23z" fill="#fff" fill-opacity="0.12"/>`}
<text x="50" y="${50 + fs * 0.35}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="${fs}" fill="${locked ? 'currentColor' : '#1a1206'}" fill-opacity="${locked ? 0.3 : 0.85}">${badge.glyph}</text>
</svg>`;
}
