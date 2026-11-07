// What your work brings, as it happens: a small pixel notification at the end of every search, a loot
// screen for a record (with the solution drawn and the honey it earns), and a running tally of your
// impact (searches, valid solutions, records, dead ends mapped for everyone) kept on this device.

import { better, shortScore } from './lib/exact.mjs';
import { drawSolution } from './lib/render.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date().toISOString().slice(0, 10);
const KEY = 'ks-impact';

/** Your impact: { day, today: {...}, total: {...}, best: { 'pid/case': ratio } } */
export function readImpact() {
  let x;
  try { x = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch {}
  const zero = () => ({ searches: 0, valid: 0, records: 0, dead: 0, honey: 0 });
  x ??= { day: today(), today: zero(), total: zero(), best: {} };
  if (x.day !== today()) { x.day = today(); x.today = zero(); }
  return x;
}
function saveImpact(x) { try { localStorage.setItem(KEY, JSON.stringify(x)); } catch {} }

/** How close a score is to the best known in the world, 0 to 1 (null when unknown). */
export function ratio(score, world, direction) {
  const a = Number(score), w = Number(world);
  if (!isFinite(a) || !isFinite(w) || a <= 0 || w <= 0) return null;
  return Math.max(0, Math.min(1, direction === 'min' ? w / a : a / w));
}

/** Honey a record earns (same scale as the robot: first solution 1, board record 10, world record 100). */
function honeyFor(r) {
  if (r.best == null) return 1;
  if (r.world != null && better(r.score, r.world, r.direction)) return 100;
  return 10;
}

export function initLoot({ data, toast }) {
  const stack = document.createElement('div');
  stack.className = 'lootstack';
  stack.setAttribute('aria-live', 'polite');
  document.body.append(stack);
  let lastQuiet = 0, quietCount = 0;

  function pop(html, cls = '', ms = 6000) {
    const el = document.createElement('div');
    el.className = `lootpop ${cls}`;
    el.innerHTML = html;
    stack.prepend(el);
    while (stack.children.length > 4) stack.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
    el.onclick = () => el.remove();
  }

  function art(r, size) {
    if (!r.solution) return '';
    try {
      const c = data().problems.find((p) => p.id === r.problem)?.cases.find((x) => String(x.id) === String(r.case));
      return drawSolution(r.problem, r.n, r.solution, size, { tier: r.outcome === 'record' ? 'swarm' : 'valid', sequence: c?.sequence });
    } catch { return ''; }
  }

  function lootScreen(r, honey) {
    document.querySelector('.lootwrap')?.remove();
    const w = document.createElement('div');
    w.className = 'lootwrap';
    const rt = ratio(r.score, r.world, r.direction);
    w.innerHTML = `<div class="lootbox" role="dialog" aria-modal="true" aria-label="New record">
      <p class="lootkick">${honey >= 100 ? 'WORLD RECORD' : honey === 1 ? 'FIRST SOLUTION' : 'NEW RECORD'}</p>
      <h2 class="loottitle">${esc(r.title)} · ${esc(String(r.case).toUpperCase())}</h2>
      <div class="lootart">${art(r, 260)}</div>
      <p class="lootscore">${esc(shortScore(r.score))}${r.best != null ? ` <small>was ${esc(shortScore(r.best))}</small>` : ''}</p>
      <div class="lootgains"><span>+${honey} 🍯 honey</span><span>🃏 a card is minted</span>${rt != null ? `<span>${Math.round(rt * 100)}% of the best known in the world</span>` : ''}</div>
      <p class="lootwhy">Everyone hunting this case now starts from <b>your</b> solution. ${honey >= 100 ? 'It beats the published world record: tell the table maintainers!' : ''}</p>
      <div class="cta-row" style="justify-content:center">${r.claim != null ? '<a class="btn primary big" href="#/hive" data-claim>Send it to the board</a>' : '<a class="btn primary big" href="#/hive">See my hive</a>'}<button class="btn big" data-close>Keep hunting</button></div>
      ${r.claim != null ? '<p class="hint" style="text-align:center">In the browser, a record waits for your click (Your improvements → Submit) so nothing is sent without you.</p>' : ''}
    </div>`;
    const close = () => w.remove();
    w.onclick = (e) => { if (e.target === w || e.target.closest('[data-close]')) close(); };
    w.querySelector('[data-claim]')?.addEventListener('click', () => { close(); setTimeout(() => document.querySelector('[data-submit]')?.scrollIntoView({ block: 'center' }), 600); });
    document.body.append(w);
  }

  addEventListener('ks-hive-result', (e) => {
    const r = e.detail;
    const x = readImpact();
    const add = (k, v = 1) => { x.today[k] += v; x.total[k] += v; };
    add('searches');
    const rt = r.score != null ? ratio(r.score, r.world, r.direction) : null;
    const key = `${r.problem}/${r.case}`;
    const newBest = rt != null && rt > (x.best[key] ?? 0);
    if (rt != null) x.best[key] = Math.max(x.best[key] ?? 0, rt);
    const label = `${esc(r.title)} · ${esc(String(r.case).toUpperCase())}`;
    if (r.outcome === 'record') {
      const honey = honeyFor(r);
      add('valid'); add('records'); add('honey', honey);
      saveImpact(x);
      lootScreen(r, honey);
      pop(`<b class="lk">🏆 RECORD +${honey} 🍯</b><span>${label}: ${esc(shortScore(r.score))}</span>`, 'gold', 9000);
    } else if (r.outcome === 'valid') {
      add('valid');
      saveImpact(x);
      pop(`<div class="lart">${art(r, 54)}</div><div><b class="lk">✓ VALID SOLUTION</b><span>${label}: ${esc(shortScore(r.score))}${rt != null ? ` · ${Math.round(rt * 100)}% of world best` : ''}${newBest ? ' · your best here ▲' : ''}</span><small>Logged in the shared journal: the swarm learns from it.</small></div>`, 'ok');
    } else {
      add('dead');
      saveImpact(x);
      // Dead ends are useful (nobody repeats them) but frequent: one quiet note at most every 20 seconds.
      quietCount++;
      if (Date.now() - lastQuiet > 20000) {
        pop(`<b class="lk">🧭 ${quietCount} DEAD END${quietCount > 1 ? 'S' : ''} MAPPED</b><span>${label}${quietCount > 1 ? ' and more' : ''}: no better solution there. The swarm will look elsewhere.</span>`, 'quiet', 4500);
        lastQuiet = Date.now(); quietCount = 0;
      }
    }
    dispatchEvent(new CustomEvent('ks-impact', { detail: x }));
  });
  addEventListener('ks-hive-record', () => {});
  return { pop };
}
