// The war room of a hunt: its pixel planet (see planet.mjs) and, beside it, what you need to follow the fight:
// where your agents are and how close they are to the record, the conquest, your friends, the rest of the swarm.
// Used by the territory map, the hive (the hunt your agents are on) and the mission page.

import { better, shortScore } from './lib/exact.mjs';
import { readPresence } from './lib/presence.mjs';
import { mountPlanet } from './planet.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } };
export const whoAmI = () => store('ks-me', null) ?? store('ks-identity', null)?.name ?? null;
export const myFriends = () => store('ks-friends', []);

/** A stable, saturated colour per hunter; honey is reserved for "you". */
export function hunterColor(name, me = whoAmI()) {
  if (!name) return null;
  if (name === me) return '#f2b33d';
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `hsl(${(((h >>> 0) % 290) + 75) % 360} 78% 56%)`;
}

let presenceCache = { at: 0, hunters: [] };
async function presence(relay) {
  if (Date.now() - presenceCache.at < 8000) return presenceCache.hunters;
  presenceCache = { at: Date.now(), hunters: await readPresence(relay) };
  return presenceCache.hunters;
}

/**
 * Mount a war room in `el`.
 * opts: { DATA, pid, focus (case id your AI attacks, mission mode), mode: 'map' | 'hive' | 'mission', onPick(caseId) }
 * Returns { update({ mine, stats }) } to feed the freshest state of your own agents (hive mode).
 */
export function warRoom(el, { DATA, pid, focus = null, mode = 'map', onPick }) {
  const p = DATA.problems.find((x) => x.id === pid);
  if (!p) { el.innerHTML = ''; return { update() {} }; }
  const me = whoAmI(), friends = myFriends();
  const sum = (cid) => DATA.cases[`${p.id}/${cid}`] ?? {};
  const owners = {};
  const regions = p.cases.map((c) => {
    const s = sum(c.id);
    const wild = !s.score || s.tier === 'reference';
    if (!wild) {
      const o = (owners[s.author] ??= { name: s.author, tiles: 0, crowns: 0 });
      o.tiles++;
      if (s.tier === 'world' || s.tier === 'perfect') o.crowns++;
    }
    return { id: c.id, label: String(c.id).toUpperCase(), color: wild ? null : hunterColor(s.author, me), mine: !wild && s.author === me, friend: !wild && friends.includes(s.author), crown: s.tier === 'world' ? 'world' : s.tier === 'perfect' ? 'perfect' : null, s, wild };
  });
  const index = Object.fromEntries(regions.map((r, i) => [r.id, i]));
  const total = regions.length, claimed = regions.filter((r) => !r.wild).length;
  const board = Object.values(owners).sort((a, b) => b.tiles - a.tiles);

  el.innerHTML = `
  <section class="war ${mode}">
    <header class="warhead">
      <div><p class="pxkick">${mode === 'hive' ? 'YOUR HUNT RIGHT NOW' : mode === 'mission' ? 'YOUR MISSION' : 'TERRITORY MAP'}</p><h2 class="pxtitle">${esc(p.title)}</h2></div>
      <div class="warbar"><small>CONQUEST</small><b>${claimed}/${total}</b><i class="pxbar"><i style="width:${Math.round((claimed / total) * 100)}%"></i></i><small>${owners[me]?.tiles ?? 0} yours</small></div>
    </header>
    <div class="wargrid">
      <div class="warplanet"><canvas class="planet" aria-label="Pixel planet of ${esc(p.title)}: each territory is a case of the hunt"></canvas><div class="ptip" hidden></div></div>
      <aside class="warside">
        <div class="wbox you"><h4>${mode === 'mission' ? 'Your attack' : 'Your agents here'}</h4><div data-w="mine"></div></div>
        <div class="wbox"><h4>Your friends</h4><div data-w="friends"></div></div>
        <div class="wbox"><h4>The swarm</h4><div data-w="swarm"></div></div>
        <div class="wbox"><h4>Lords of the map</h4>${board.length ? board.slice(0, 6).map((o, k) => `<a class="lordpx" href="#/u/${esc(o.name)}"><i style="background:${hunterColor(o.name, me)}"></i><b>${k + 1}. ${esc(o.name)}</b><span>${o.tiles}${o.crowns ? ' ♛' + o.crowns : ''}</span></a>`).join('') : '<p class="wempty">Nobody holds a territory yet: every one is up for grabs.</p>'}</div>
      </aside>
    </div>
    <p class="warlegend"><span><i style="background:#f2b33d"></i>you</span><span><i style="background:#6a9a46"></i>wild: free to take</span><span><i class="ring"></i>a friend</span><span>♛ world record · ★ proven best</span><span><i class="beam"></i>your computing power</span></p>
  </section>`;

  const cv = el.querySelector('canvas.planet'), tip = el.querySelector('.ptip');
  const planet = mountPlanet(cv, {
    regions,
    compact: mode !== 'map',
    onPick: (j) => (onPick ? onPick(regions[j].id) : (location.hash = `#/p/${p.id}/${regions[j].id}`)),
    onHover: (j, e) => {
      if (j == null) { tip.hidden = true; return; }
      const r = regions[j], box = cv.parentElement.getBoundingClientRect();
      const here = lastAgents.filter((a) => a.case === r.id);
      tip.hidden = false;
      tip.style.left = `${Math.min(box.width - 190, Math.max(4, e.clientX - box.left + 14))}px`;
      tip.style.top = `${Math.max(4, e.clientY - box.top - 10)}px`;
      tip.innerHTML = `<b>${esc(p.title)} · ${esc(r.label)}</b><br>${r.wild ? (r.s.score ? `Held by the published record (${esc(shortScore(r.s.score))}). Beat it to take it.` : 'Wild: nobody holds it yet.') : `Held by <b style="color:${r.color}">${esc(r.s.author)}</b> · ${esc(shortScore(r.s.score))}`}${here.length ? `<br><span class="hot">⚔ ${here.length} agent(s) attacking: ${[...new Set(here.map((a) => esc(a.who)))].join(', ')}</span>` : ''}`;
    },
  });

  let lastAgents = [], localMine = null, localStats = null, hunters = [];
  const seen = {};
  function paint() {
    if (!el.isConnected) return;
    // Everyone's agents on this hunt; your own ones from this device when we have them (fresher).
    let agents = hunters.flatMap((h) => (h.agents ?? []).map((a) => ({ ...a, who: h.name }))).filter((a) => a.problem === p.id);
    if (localMine) agents = agents.filter((a) => a.who !== me).concat(localMine.filter((a) => a.problem === p.id).map((a) => ({ ...a, who: me ?? 'you', model: a.model || String(a.source ?? '').replace(/^[a-z]+:/, '') })));
    lastAgents = agents;
    const groups = {};
    for (const a of agents) (groups[a.case] ??= []).push(a);
    const attacks = Object.entries(groups).filter(([cid]) => index[cid] != null).map(([cid, list]) => ({ region: index[cid], agents: list.map((a) => ({ color: hunterColor(a.who, me) ?? '#5fd17a', me: a.who === me || a.who === 'you' })) }));
    const mine = agents.filter((a) => a.who === me || a.who === 'you');
    const targets = [...new Set(mine.map((a) => index[a.case]).filter((x) => x != null))];
    if (focus && index[focus] != null && !targets.includes(index[focus])) { targets.push(index[focus]); if (!groups[focus]) attacks.push({ region: index[focus], agents: [{ color: '#f2b33d', me: true }] }); }
    planet.setLive(attacks, targets);
    // A better score from one of your agents: the territory jumps.
    for (const a of agents) {
      const k = `${a.who}|${a.case}|${a.model}`;
      if (seen[k] != null && a.score != null && a.score !== seen[k]) planet.ripple(index[a.case], hunterColor(a.who, me));
      if (a.score != null) seen[k] = a.score;
    }
    // Side panel.
    const q = (s) => el.querySelector(`[data-w="${s}"]`);
    const rowMine = (a) => {
      const s = sum(a.case), rec = s.score ?? null;
      const beats = a.score != null && rec != null && better(a.score, rec, p.direction);
      const left = a.until ? Math.max(0, Math.round((a.until - Date.now()) / 1000)) : null;
      return `<div class="wrow"><b>${esc(String(a.case).toUpperCase())}</b><span class="wm">${esc(a.model || a.kind || 'processor')}</span><span class="ws ${beats ? 'up' : ''}">${a.phase === 'writing' ? 'writing its program…' : a.score != null ? `${esc(shortScore(a.score))}${beats ? ' ▲ RECORD!' : ''}` : 'searching…'}</span><small>${rec != null ? `to beat: ${esc(shortScore(rec))}` : 'no record yet: any answer wins it'}${left != null ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : ''}</small></div>`;
    };
    const mineHtml = mine.length
      ? mine.slice(0, 8).map(rowMine).join('')
      : focus
        ? `<div class="wrow"><b>${esc(String(focus).toUpperCase())}</b><span class="ws">your AI is on it</span><small>${sum(focus).score ? `to beat: ${esc(shortScore(sum(focus).score))}` : 'no record yet: any valid answer wins it'} · its answer comes back here</small></div>`
        : `<p class="wempty">${!me ? 'Pick a hunter name in your hive to appear on the map.' : 'None right now. <a href="#/hive">Start your hive</a> and your bees fly here.'}</p>`;
    q('mine').innerHTML = mineHtml + (localStats ? `<div class="wstats"><span><b>${localStats.runs}</b> searches</span><span><b>${localStats.records}</b> records</span><span><b>${localStats.active}</b> at work</span></div>` : '');
    const onlineNames = new Set(hunters.filter((h) => (h.agents ?? []).length).map((h) => h.name));
    const hereNames = new Set(agents.map((a) => a.who));
    q('friends').innerHTML = friends.length
      ? friends.map((f) => { const n = agents.filter((a) => a.who === f).length; return `<a class="wrow fr" href="#/u/${esc(f)}"><i style="background:${hunterColor(f, me)}"></i><b>${esc(f)}</b><span class="ws ${n ? 'up' : ''}">${n ? `⚔ ${n} bee${n > 1 ? 's' : ''} here` : onlineNames.has(f) ? 'online, other hunt' : 'offline'}</span></a>`; }).join('')
      : '<p class="wempty">Open a hunter’s profile and press <b>Follow</b>: they show up here, live.</p>';
    q('swarm').innerHTML = `<div class="wstats"><span><b>${[...hereNames].length}</b> hunters here</span><span><b>${agents.length}</b> agents here</span><span><b>${onlineNames.size}</b> online in all</span></div>`;
  }
  async function poll() {
    if (!el.isConnected) return;
    hunters = await presence(DATA.config.relay);
    paint();
    setTimeout(poll, 10000);
  }
  paint();
  poll();
  return {
    update({ mine, stats } = {}) { if (mine) localMine = mine; if (stats) localStats = stats; paint(); },
    index,
  };
}
