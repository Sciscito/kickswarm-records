// Kickswarm Records: the website. Static files only; the judges run right here in the browser.
import { better, shortScore, toUnits } from './lib/exact.mjs';
import { drawSolution, TIERS } from './lib/render.mjs';
import { huntPrompt, pickMission } from './lib/mission.mjs';
import { BEE, icon } from './icons.mjs';
import { BADGES, RARITY, medal } from './lib/badges.mjs';

const app = document.getElementById('app');
let DATA;
const solutions = new Map();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const site = () => (location.hostname.endsWith('github.io') ? DATA.config.site : location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, ''));
const problem = (id) => DATA.problems.find((p) => p.id === id);
const summary = (pid, cid) => DATA.cases[`${pid}/${cid}`] ?? {};
/** The level of a hunt: warm-up to learn, classic records, hardcore open problems. */
const LEVELS = { 'warm-up': ['Warm-up', 'lv-warm'], classic: ['Classic', 'lv-classic'], hardcore: ['Hardcore', 'lv-hard'] };
const levelTag = (l) => (LEVELS[l] ? `<span class="lvtag ${LEVELS[l][1]}">${LEVELS[l][0]}</span>` : '');
const tierBadge = (t) => `<span class="badge t-${t ?? 'empty'}">${esc(t ? TIERS[t]?.label : 'Open')}</span>`;
const ago = (ts) => {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}
async function copy(text, msg = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast('Copy failed: select the text and copy it by hand');
  }
}

/** Turn a trophy SVG into a PNG and share it (phone share sheet) or download it. */
async function sharePng(seq, text) {
  try {
    const svg = await fetch(`trophies/${seq}.svg`).then((r) => r.text());
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 1680;
    c.getContext('2d').drawImage(img, 0, 0, 1200, 1680);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], `kickswarm-record-${seq}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    toast('Image saved: post it anywhere');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Could not make the image');
  }
}
function shareText(t) {
  const p = problem(t.problem);
  const what = { world: 'a WORLD RECORD', perfect: 'a perfect solution', swarm: 'a new swarm record', valid: 'a first solution' }[t.tier] ?? 'a record';
  return `I just set ${what} on ${p?.title} (n = ${t.case}) with Kickswarm Records, a public swarm of AIs hunting open math records. Join the hunt:`;
}
function shareButtons(t) {
  const url = `${DATA.config.site}/#/p/${t.problem}/${t.case}`;
  const x = `https://x.com/intent/post?text=${encodeURIComponent(shareText(t))}&url=${encodeURIComponent(url)}`;
  return `<div class="share"><button class="btn small" data-share="${t.seq}">Share image</button><a class="btn small" href="${x}" target="_blank" rel="noopener">Post on X</a></div>`;
}
function wireShare() {
  app.querySelectorAll('[data-share]').forEach((b) => {
    const t = DATA.trophies.find((x) => String(x.seq) === b.dataset.share);
    b.onclick = () => sharePng(b.dataset.share, shareText(t) + ' ' + `${DATA.config.site}/#/p/${t.problem}/${t.case}`);
  });
}

async function getSolution(pid, cid) {
  const k = `${pid}/${cid}`;
  if (!solutions.has(k)) {
    solutions.set(k, fetch(`records/${pid}/${cid}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return solutions.get(k);
}

/** Draw lazily: each [data-art] element gets its drawing when it scrolls into view. */
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    observer.unobserve(e.target);
    paint(e.target);
  }
}, { rootMargin: '200px' });
async function paint(el) {
  const { pid, cid, size } = el.dataset;
  const p = problem(pid);
  const c = p.cases.find((x) => x.id === cid);
  const rec = await getSolution(pid, cid);
  if (!rec) {
    // An empty case: the bare grid, waiting for its first points.
    el.innerHTML = pid === 'no-three-in-line' ? drawSolution(pid, c.n, { points: [] }, Number(size) || 300, { tier: 'valid', mono: true })
      : pid === 'protein-folding-2d' ? drawSolution(pid, c.n, { moves: 'R'.repeat(c.n - 1) }, Number(size) || 300, { tier: 'valid', mono: true, sequence: c.sequence })
      : pid === 'cap-sets' ? drawSolution(pid, c.n, { points: [] }, Number(size) || 300, { tier: 'valid', mono: true })
      : '<span class="q">?</span>';
    return;
  }
  const tier = rec.tier ?? (rec.reference ? 'reference' : 'valid');
  el.innerHTML = drawSolution(pid, c.n, rec.solution, Number(size) || 300, { tier, radius: p.score_name === 'radius' ? Number(rec.score) : undefined, mono: tier === 'valid', sequence: c.sequence });
}
/** A drawing framed as a plate of the observatory notebook, with its caption. */
const plate = (pid, cid, size, fig, cls = 'plate') => {
  const p = problem(pid);
  const s = summary(pid, cid);
  const val = s.score ? `${p.score_name === 'radius' ? 'r' : p.score_name === 'energy' ? 'E' : 'points'} = ${shortScore(s.score)}` : 'open';
  return `<figure class="${cls}">${art(pid, cid, size, 'art')}<figcaption><i>Fig. ${esc(fig)}</i> ${esc(p.title)}, <i>n</i> = ${esc(cid)} <span class="mono">${esc(val)}</span></figcaption></figure>`;
};
const art = (pid, cid, size = 300, cls = 'art') => `<div class="${cls}" data-art data-pid="${pid}" data-cid="${cid}" data-size="${size}"></div>`;
function hydrate() {
  app.querySelectorAll('[data-art]').forEach((el) => observer.observe(el));
}

/** Sign the solution with this device's hunter key and send it (relay, or a prefilled GitHub form). */
async function submitUrl(sub) {
  try {
    const { sendSolution } = await import('./identity.mjs');
    const url = await sendSolution(sub, { relay: DATA.config.relay, repo: DATA.config.repo, copy, toast });
    if (url) window.open(url, '_blank', 'noopener');
  } catch (e) {
    toast(e.message);
  }
}

function feedItem(e) {
  const p = problem(e.problem);
  const what = e.nature === 'record'
    ? `${tierBadge(e.tier)} <span><a href="#/p/${e.problem}/${e.case}">${esc(p?.title)} · n=${esc(e.case)}</a> → ${esc(shortScore(e.score))}</span>`
    : `<span class="badge t-attempt">Attempt</span> <span><a href="#/p/${e.problem}/${e.case}">${esc(p?.title)} · n=${esc(e.case)}</a> · ${esc(shortScore(e.score))}</span>`;
  return `<li><a class="who" href="#/u/${esc(e.author)}">@${esc(e.author)}</a> ${what}<time>${ago(e.ts)}</time></li>`;
}

// ---------- pages ----------

let stopHero = null;
function home() {
  const s = DATA.stats;
  const total = DATA.problems.reduce((a, p) => a + p.cases.length, 0);
  const featured = DATA.problems.map((p) => {
    const recent = DATA.feed.find((e) => e.problem === p.id && e.nature === 'record');
    return { p, cid: recent?.case ?? p.cases[Math.floor(p.cases.length / 2)].id };
  });
  const ticker = DATA.feed.filter((e) => e.nature === 'record').slice(0, 14).map((e) => `<span><b>@${esc(e.author)}</b> ${esc(TIERS[e.tier]?.label ?? '')} · ${esc(problem(e.problem)?.title)} <i>n</i> = ${esc(e.case)} · <span class="mono">${esc(shortScore(e.score))}</span></span>`).join('<i class="dot"></i>');
  const pitch = {
    'circles-in-square': 'Researchers improve these packings every week. Start from the published best and push one circle a hair further.',
    'circles-in-circle': 'Same game, round arena. The published records are the starting line; the judge rounds down, so a record is a record.',
    'no-three-in-line': 'A puzzle from 1917. Perfect solutions are known up to n = 60. Above that, nobody has ever published one.',
    'cap-sets': 'A famous open problem in mathematics: the largest set of SET cards with no SET. An AI broke the record in dimension 8 in 2023; dimension 7 has not moved in twenty years.',
    'protein-folding-2d': 'The classic benchmark of protein folding research. Fold a chain so its water-fearing parts huddle; for the 85- and 100-residue chains, the best known folds can still be beaten.',
  };
  const dots = Array.from({ length: 6 }, (_, k) => `<i style="--k:${k}"></i>`).join('');
  app.innerHTML = `
  <section class="hero2 bleed">
    <canvas id="swarm" aria-label="A live swarm of circles packing itself"></canvas>
    <div class="hero2-shade"></div>
    <div class="hero2-in">
      <p class="kicker mono"><span class="live"></span> Open hive · live</p>
      <h1 class="display">The swarm<br>hunts <em>world<br>records.</em></h1>
      <p class="lead">Lend your AI and your idle computer to a public swarm attacking open math records. Every answer is checked to the last digit. Beat one, and your solution becomes a one-of-a-kind trophy, signed with your name.</p>
      <div class="cta-row">
        <a class="btn primary big" href="#/hive">Start your hive ${icon('arrow')}</a>
        <a class="btn ghost big" href="#/start">Join in 2 minutes</a>
      </div>
      <dl class="hero-stats mono">
        <div><dt>cases</dt><dd>${total}</dd></div>
        <div><dt>hunters</dt><dd>${s.hunters}</dd></div>
        <div><dt>records</dt><dd>${s.records}</dd></div>
        <div><dt>world records</dt><dd>${s.world}</dd></div>
      </dl>
    </div>
    <p class="hero-hint mono">move through the swarm</p>
  </section>

  <div class="livestrip bleed" data-live="strip" aria-live="polite"></div>
  ${ticker ? `<div class="ticker bleed" aria-label="Latest records"><div class="ticker-track">${ticker}<i class="dot"></i>${ticker}<i class="dot"></i></div></div>` : ''}

  <section class="sec reveal">
    <p class="secno mono">01 — How it works</p>
    <h2 class="h2big">Your AI writes the search.<br><em>Your machine runs it.</em> A judge decides.</h2>
    <div class="steps3">
      <div><span class="num">01</span>${icon('hive')}<h3>Get a mission</h3><p>The hive sends you to a case few people tried, with a strategy nobody else got. No crowd on the same spot.</p></div>
      <div><span class="num">02</span>${icon('pen')}<h3>Let it search</h3><p>Free models, local models, your subscriptions: they write search programs, your processor runs them. Phone or computer.</p></div>
      <div><span class="num">03</span>${icon('spark')}<h3>Proof, not promises</h3><p>An exact judge anyone can read checks every digit. The registry is public and chained. Records are forever.</p></div>
    </div>
  </section>

  <section class="sec reveal">
    <p class="secno mono">02 — The hunts</p>
    <h2 class="h2big">Three open hunts.<br><em>${total} records</em> to take.</h2>
    ${featured.map(({ p, cid }, k) => `
      <article class="hunt ${k % 2 ? 'flip' : ''}">
        <a href="#/p/${p.id}" class="hunt-art">${plate(p.id, cid, 640, k + 1, 'plate')}</a>
        <div class="hunt-text">
          <p class="mono hunt-n">0${k + 1} / 03</p>
          <h3 class="h3big">${esc(p.title)}</h3>
          <p class="lead">${esc(pitch[p.id] ?? p.tagline)}</p>
          <ul class="facts-inline mono"><li>${p.cases.length} cases</li><li>n = ${p.cases[0].n}–${p.cases.at(-1).n}</li><li>${esc(p.score_name)}</li></ul>
          <div class="cta-row"><button class="btn primary" data-joinp="${p.id}">${icon('hive')} Join this hunt</button><button class="btn ghost" data-learnp="${p.id}">Learn more</button><a class="btn ghost" href="#/p/${p.id}">See the board</a></div>
        </div>
      </article>`).join('')}
  </section>

  <section class="sec reveal hive-promo">
    <div>
      <p class="secno mono">03 — Your hive</p>
      <h2 class="h2big">Everything you own,<br><em>working while you sleep.</em></h2>
      <ul class="ticks">
        <li>${icon('cpu')}<span><b>Every core</b> of your computer, or the browser of your phone.</span></li>
        <li>${icon('leaf')}<span><b>Free models first</b>: local ones, then free API tiers. Paid only if you allow it.</span></li>
        <li>${icon('key')}<span><b>Your keys stay on your device</b>, and go only to their provider.</span></li>
        <li>${icon('moon')}<span><b>Presets</b> anyone can accept: Discreet, Balanced, Free only, Full power.</span></li>
        <li>${icon('mic')}<span><b>Just say it</b>: “only free models, at night”. Confirm, done.</span></li>
      </ul>
      <div class="cta-row"><a class="btn primary big" href="#/hive">Open your hive ${icon('arrow')}</a></div>
    </div>
    <div class="phone" aria-hidden="true">
      <div class="phone-screen">
        <p class="mono ph-k">YOUR HIVE</p>
        <div class="ph-go"><span class="orbit spin" style="--n:6">${BEE}${dots}</span><b>Hunting</b><small>6 workers · Balanced</small></div>
        <div class="ph-presets"><span>${icon('moon')}</span><span class="sel">${icon('hive')}</span><span>${icon('leaf')}</span><span>${icon('flame')}</span></div>
        <div class="ph-line"><i class="on"></i><b>Processor</b><em>6 workers</em></div>
        <div class="ph-line"><i class="on"></i><b>Free tiers</b><em>on</em></div>
        <div class="ph-line"><i></i><b>Paid APIs</b><em>off</em></div>
        <div class="ph-rec mono">+1 record · no three in line, n = 61</div>
      </div>
    </div>
  </section>

  <section class="sec reveal">
    <p class="secno mono">04 — What you get</p>
    <h2 class="h2big">Every verified idea<br><em>becomes yours, forever.</em></h2>
    <div class="gets">
      <div class="get-collection">
        <div class="fan">${DATA.trophies.slice(0, 5).map((t, i) => `<a href="#/u/${esc(t.author)}" style="--i:${i}" title="@${esc(t.author)}"><img src="trophies/${t.seq}.svg" alt="Trophy card #${t.seq}" loading="lazy"></a>`).join('')}</div>
        <div class="rarity">${['valid', 'swarm', 'perfect', 'known', 'world'].map((t) => tierBadge(t)).join('')}</div>
      </div>
      <div class="get-list">
        <div><h3>${icon('hive')} A collection</h3><p>Each record mints a trophy card drawn from your own solution. Five rarities, from a first valid solution to an animated gold world record. Your cards live on your <a href="#/u/${esc(DATA.leaderboard[0]?.author ?? 'kickswarm-demo')}">hunter page</a>.</p></div>
        <div><h3>${icon('spark')} Honey</h3><p>A score of verified contribution: +1 valid, +10 swarm record, +25 perfect, +100 world record, +2 for spotting a better solution elsewhere. It counts what you really did, and nothing else.</p></div>
        <div><h3>${icon('telescope')} Credit that lasts</h3><p>Your name, in a public chained registry, next to the solution. A world record found here is yours to report to the researchers who keep the tables.</p></div>
        <div><h3>${icon('key')} Later: pools</h3><p>Sponsors will post rewards on hard problems; the hives that solve them will share according to verified contribution. Planned, not live: only with a proper legal framework, and never a token.</p></div>
      </div>
    </div>
  </section>

  <section class="sec reveal">
    <p class="secno mono">05 — Proof so far</p>
    <h2 class="h2big">Day one,<br><em>already working.</em></h2>
    <div class="proof">
      <div><b>${DATA.stats.records}</b><span>records set by the swarm</span></div>
      <div><b>${DATA.stats.entries}</b><span>entries in the public registry, every one re-checkable</span></div>
      <div><b>${DATA.stats.attempts}</b><span>attempts logged, failures included, so nobody repeats a dead end</span></div>
      <div><b>${DATA.problems.reduce((a, p) => a + p.cases.length, 0)}</b><span>open cases, 100 of them starting from published world records</span></div>
    </div>
    <p style="margin-top:18px"><a href="#/stats">Which models did what, and how ${icon('arrow')}</a></p>
    <div class="two" style="margin-top:28px">
      <div class="panel"><h3>Live from the hive</h3>${DATA.feed.length ? `<ul class="feed">${DATA.feed.slice(0, 8).map(feedItem).join('')}</ul>` : '<p class="empty">Nothing yet. The first result will appear here, maybe yours.</p>'}</div>
      <div class="panel"><h3>Honey board</h3>${DATA.leaderboard.length ? `<table class="board">${DATA.leaderboard.slice(0, 8).map((l, i) => `<tr><td><span class="rank mono">${String(i + 1).padStart(2, '0')}</span> <a href="#/u/${esc(l.author)}">@${esc(l.author)}</a></td><td>${l.records} rec.</td><td>${l.honey} <span class="honey">honey</span></td></tr>`).join('')}</table>` : '<p class="empty">No honey yet.</p>'}</div>
    </div>
  </section>

  <section class="sec reveal">
    <p class="secno mono">06 — The ladder</p>
    <h2 class="h2big">Each rung harder,<br><em>each rung more useful.</em></h2>
    <p class="lead dimlead">The same machine (missions, searchers, an exact judge, a public registry) climbs toward problems that matter more, one verified rung at a time.</p>
    <ol class="ladder">
      <li class="now"><span class="mono">Now</span><h3>Open records</h3><p>Packings, grids, combinatorics. Exact judges, instant proof. Where the swarm learns to work.</p></li>
      <li><span class="mono">Next</span><h3>Problems industry runs on</h3><p>Delivery routes, factory schedules, faster matrix products for AI chips, sorting networks, error-correcting codes.</p></li>
      <li><span class="mono">Then</span><h3>Science and software</h3><p>Formal proofs checked by Lean, open-source bugs fixed with tests and hidden tests, scientific code made faster.</p></li>
      <li><span class="mono">Later</span><h3>Bounties and pools</h3><p>Anyone posts a hard, checkable problem with a reward; hives pool their compute; contribution decides the share.</p></li>
    </ol>
    <div class="strip" id="strip"></div>
    <p style="margin-top:18px"><a href="#/catalogue">The catalogue of next hunts, ranked by impact ${icon('arrow')}</a></p>
  </section>

  <section class="sec reveal">
    <p class="secno mono">07 — Open data for science</p>
    <div class="opendata">
      <div>
        <h2 class="h2big">Nothing is hidden.<br><em>Not even the failures.</em></h2>
        <p class="lead dimlead">Every solution, every attempt and the method behind it is published as open data. Researchers get the best configurations and a map of what does not work, the part science rarely publishes.</p>
        <div class="cta-row"><a class="btn primary" href="#/data">Get the data ${icon('download')}</a><a class="btn ghost" href="https://github.com/${esc(DATA.config.repo)}" target="_blank" rel="noopener">The code ${icon('arrow')}</a></div>
      </div>
      <pre class="datapeek mono">${esc(JSON.stringify((({ seq, nature, problem: pr, case: c, author, score, tier, model }) => ({ seq, nature, problem: pr, case: c, author, score, tier, model }))(DATA.feed[0] ?? {}), null, 2))}
<span class="dim">… ${DATA.stats.entries} entries, each chained to the previous by SHA-256</span></pre>
    </div>
  </section>

  <section class="sec reveal">
    <p class="secno mono">08 — Why</p>
    <div class="why">
      <h2 class="h2big">Serving tokens will be easy.<br><em>Counting real work will not.</em></h2>
      <div class="why-cols">
        <p>Soon everyone will have AI and spare compute. The scarce thing is a way to point all of it at problems that matter, and to know who really contributed.</p>
        <p>Kickswarm's answer is a unit: <b>the verified task</b>. Work counts only when a machine can check it. Honey and shares follow the checks; 30% goes to the commons that keep the hives running.</p>
        <p>That is what a fair economy looks like when machines do most of the work: open, measured, credited. Records are where it starts.</p>
      </div>
    </div>
  </section>

  <section class="outro bleed reveal">
    <p class="wordmark">Kickswarm</p>
    <p class="lead">An open protocol for people's AIs to work together, on problems a machine can check.</p>
    <div class="cta-row" style="justify-content:center"><a class="btn primary big" href="#/hive">Join the swarm ${icon('arrow')}</a></div>
  </section>`;
  hydrate();
  app.querySelectorAll('[data-learnp]').forEach((b) => (b.onclick = () => learnProblem(problem(b.dataset.learnp))));
  app.querySelectorAll('[data-joinp]').forEach((b) => (b.onclick = () => joinHunt(b.dataset.joinp)));
  stopHero?.();
  import('./hero.mjs').then((m) => { stopHero = m.startHero(document.getElementById('swarm')); });
  fetch('catalogue.json').then((r) => r.json()).then((cat) => {
    const el = document.getElementById('strip');
    if (!el) return;
    el.innerHTML = cat.hunts.filter((h) => h.status !== 'open').slice(0, 8).map((h) => `<div class="strip-card"><p class="mono">${esc(cat.domains[h.domain])}</p><h3>${esc(h.title)}</h3><p>${esc(h.why.split('. ')[0])}.</p></div>`).join('');
  });
  reveal();
}

/** Fade sections in as they scroll into view. */
function reveal() {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  app.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

function problemPage(pid) {
  const p = problem(pid);
  if (!p) return notFound();
  app.innerHTML = `
  <p class="crumbs"><a href="#/">Hunts</a> / ${esc(p.title)}</p>
  <p class="kicker mono">${levelTag(p.level)}</p>
  <h1>${esc(p.title)}</h1>
  <p class="lead" style="max-width:46em;color:var(--dim)">${esc(p.statement)}</p>
  <div class="cta-row"><button class="btn primary big" id="join">${icon('hive')} Join this hunt</button><button class="btn big" id="invite">${icon('share')} Invite friends</button><a class="btn" href="#/map/${p.id}">${icon('hive')} Territory map</a><button class="btn" id="learn">${icon('telescope')} Learn more</button><a class="btn ghost" href="#/mission/${p.id}">By hand</a><a class="btn" href="${esc(p.world_source.url)}" target="_blank" rel="noopener">Reference table ↗</a></div>
  <div class="livestrip inline" data-live="strip"></div>
  <div class="legend">${['reference', 'valid', 'swarm', 'perfect', 'world'].filter((t) => t !== 'perfect' || p.id === 'no-three-in-line').filter((t) => t !== 'reference' || p.id !== 'no-three-in-line').map(tierBadge).join('')}${p.id === 'no-three-in-line' ? tierBadge(null) : ''}</div>
  <div class="cases">
    ${p.cases.map((c) => {
      const s = summary(p.id, c.id);
      const world = p.id === 'no-three-in-line' && !c.world;
      return `<a class="case" data-pc="${p.id}|${c.id}" href="#/p/${p.id}/${c.id}">${art(p.id, c.id, 220)}<div class="row"><span class="n">${p.id === 'protein-folding-2d' ? `${esc(c.id.toUpperCase())} · ${c.n} aa` : `n = ${c.n}`}</span>${tierBadge(s.tier)}</div><div class="row"><span class="s">${s.score ? esc(shortScore(s.score)) : world ? '2n never found' : p.id === 'protein-folding-2d' || p.id === 'cap-sets' ? `best ${esc(c.world.score)}${c.proven ? '' : ' · open'}` : 'empty'}</span><span class="s">${s.attempts ? `${s.attempts} tries` : ''}</span></div></a>`;
    }).join('')}
  </div>`;
  hydrate();
  document.getElementById('learn').onclick = () => learnProblem(p);
  document.getElementById('join').onclick = () => joinHunt(p.id);
  document.getElementById('invite').onclick = () => inviteToHunt(p.id);
}

/** What a judged score would earn, mirroring the robot (lib/process.mjs). */
function predict(p, c, score, s) {
  const minGain = p.score_name === 'radius' ? '0.000000000001' : '1';
  if (s.score) {
    if (toUnits(score) === toUnits(s.score)) return { tier: 'attempt', text: `equals the current best (${shortScore(s.score)}). It will be logged as an attempt in the journal.` };
    if (!better(score, s.score, p.direction)) return { tier: 'attempt', text: `does not beat the current best (${shortScore(s.score)}). It will be logged as an attempt in the journal.` };
    if (toUnits(score) - toUnits(s.score) < toUnits(minGain)) return { tier: 'attempt', text: `is above the current best by less than the minimum step (${minGain}). It will be logged as an attempt.` };
  }
  if (p.id === 'cap-sets') {
    if (Number(score) > Number(c.world.score)) return { tier: 'world', text: `beats the best known cap set (${c.world.score}): a NEW MATHEMATICAL RESULT!` };
    if (c.proven && Number(score) === Number(c.world.score)) return { tier: 'perfect', text: `matches the proven maximum (${c.world.score}): PERFECT.` };
  } else if (p.id === 'protein-folding-2d') {
    if (Number(score) < Number(c.world.score)) return { tier: 'world', text: `goes BELOW the best known energy (${c.world.score}): a WORLD RECORD!` };
    if (Number(score) === Number(c.world.score)) return { tier: 'perfect', text: `matches the best known energy (${c.world.score}): PERFECT.` };
  } else if (p.id === 'no-three-in-line') {
    if (Number(score) === 2 * c.n) return c.world ? { tier: 'perfect', text: 'is PERFECT (2n points).' } : { tier: 'world', text: 'is a WORLD FIRST: 2n points where none was ever published!' };
  } else {
    const w = c.world.score;
    const margin = 10n ** BigInt(30 - (w.split('.')[1] ?? '').length);
    if (toUnits(score) > toUnits(w) + margin) return { tier: 'world', text: `beats the published WORLD RECORD (${w})!` };
  }
  return s.score ? { tier: 'swarm', text: 'is a new swarm record.' } : { tier: 'valid', text: 'is the first valid solution on this case.' };
}

function submitBox(p, c, s) {
  return `
  <h3 style="margin-top:22px">Check your solution</h3>
  <p style="color:var(--dim);font-size:14px">Paste the JSON from your AI. The exact same judge as the robot runs here, in your browser.</p>
  <textarea id="sol" spellcheck="false" placeholder='{"problem": "${p.id}", "case": "${c.id}", "${p.id === 'no-three-in-line' || p.id === 'cap-sets' ? 'points' : p.id === 'protein-folding-2d' ? 'moves' : 'centers'}": ${p.id === 'protein-folding-2d' ? '"RRUL..."' : '[...]'}, "method": "...", "model": "..."}'></textarea>
  <div class="cta-row"><button class="btn primary" id="check">Check</button><button class="btn" id="send" disabled>Submit on GitHub</button></div>
  <div id="verdict"></div>`;
}
function wireSubmit(p, c, s) {
  const ta = document.getElementById('sol');
  const out = document.getElementById('verdict');
  const send = document.getElementById('send');
  let ready = null;
  document.getElementById('check').onclick = async () => {
    send.disabled = true;
    ready = null;
    let sub;
    try {
      const txt = ta.value;
      sub = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    } catch (e) {
      out.innerHTML = `<div class="verdict bad"><b>Not readable JSON.</b><br>${esc(e.message)}</div>`;
      return;
    }
    if (sub.problem !== p.id || String(sub.case) !== c.id) {
      out.innerHTML = `<div class="verdict bad"><b>Wrong case.</b><br>This page is ${esc(p.id)} n=${esc(c.id)}; your JSON says ${esc(sub.problem)} n=${esc(sub.case)}.</div>`;
      return;
    }
    try {
      const { judge } = await import(`./problems/${p.id}/judge.mjs`);
      const t = performance.now();
      const { score } = judge(c, sub);
      const v = predict(p, c, score, s);
      out.innerHTML = `<div class="verdict ok"><b>Valid ✓</b> ${tierBadge(v.tier)}<br>Score <span class="mono">${esc(shortScore(score))}</span>, which ${esc(v.text)}<br><span style="color:var(--faint);font-size:12px">judged in ${Math.round(performance.now() - t)} ms</span></div>`;
      ready = sub;
      send.disabled = false;
    } catch (e) {
      out.innerHTML = `<div class="verdict bad"><b>Rejected.</b><br>${esc(e.message)}</div>`;
    }
  };
  send.onclick = () => ready && submitUrl(ready);
}

function casePage(pid, cid) {
  const p = problem(pid);
  const c = p?.cases.find((x) => x.id === cid);
  if (!c) return notFound();
  const s = summary(pid, cid);
  const j = DATA.journal[`${pid}/${cid}`] ?? [];
  const worldLine = p.id === 'cap-sets'
    ? `${c.world.score} points${c.proven ? ' (proven optimal)' : ' (best known: can still be beaten)'}`
    : p.id === 'protein-folding-2d'
    ? `energy ${c.world.score}${c.proven ? ' (proven optimal)' : ' (best known: can still be beaten)'}`
    : p.id === 'no-three-in-line'
    ? c.world ? `${2 * c.n} points (perfect), published` : `never published: ${2 * c.n} points would be a world first`
    : `${c.world.score}`;
  app.innerHTML = `
  <p class="crumbs"><a href="#/">Hunts</a> / <a href="#/p/${p.id}">${esc(p.title)}</a> / n = ${c.n}</p>
  <div class="casepage">
    <div>${plate(pid, cid, 700, s.seq ?? '—', 'plate big')}</div>
    <div>
      <h1>${esc(p.title)}, <em>n</em> = ${c.n}</h1>
      <div class="cta-row" style="margin:0 0 6px">${tierBadge(s.tier)}<button class="btn small" id="learn">${icon('telescope')} What is this?</button></div>
      <div class="livecase" data-live="case" data-pid="${p.id}" data-cid="${c.id}"></div>
      <dl class="facts">
        <dt>Current best</dt><dd>${s.score ? `${esc(shortScore(s.score))} · ${s.credit ? `${esc(s.credit)} (found by @${esc(s.author)})` : `@${esc(s.author)}`}` : 'none yet'}</dd>
        <dt>World record</dt><dd>${esc(worldLine)}</dd>
        <dt>Activity</dt><dd>${s.records ?? 0} record(s), ${s.attempts ?? 0} attempt(s)</dd>
      </dl>
      ${s.seq && s.tier !== 'reference' ? `<p style="margin:0 0 6px"><a href="trophies/${s.seq}.svg" target="_blank">Trophy card #${s.seq}</a></p>${shareButtons({ seq: s.seq, problem: p.id, case: c.id, tier: s.tier })}` : ''}
      <p class="hint">Seen a better solution published elsewhere? <a href="https://github.com/${esc(DATA.config.repo)}/issues/new?template=known.yml" target="_blank" rel="noopener">Show it</a>: it is judged, credited to its authors, and you get +2 honey as the scout.</p>
      <div class="cta-row"><button class="btn primary" id="joinc">${icon('hive')} Join this hunt</button><button class="btn" id="invitec">${icon('share')} Invite</button><a class="btn ghost" href="#/mission/${p.id}/${c.id}">By hand</a>${s.score ? `<a class="btn" href="records/${p.id}/${c.id}.json" download>Download current best</a>` : ''}</div>
      ${submitBox(p, c, s)}
      <h3 style="margin-top:26px">Hunting journal</h3>
      ${j.length ? `<ul class="feed">${j.slice(0, 30).map((e) => `<li>${e.nature === 'record' ? tierBadge(e.tier) : '<span class="badge t-attempt">Attempt</span>'} <span><b>@${esc(e.author)}</b> ${esc(shortScore(e.score))}${e.method ? ` — ${esc(e.method)}` : ''}${e.model ? ` <span class="mono" style="color:var(--faint)">[${esc(e.model)}]</span>` : ''}</span><time>${ago(e.ts)}</time></li>`).join('')}</ul>` : '<p class="empty">No attempt yet on this case.</p>'}
    </div>
  </div>`;
  hydrate();
  wireSubmit(p, c, s);
  wireShare();
  document.getElementById('learn').onclick = () => learnProblem(p);
  document.getElementById('joinc').onclick = () => joinHunt(p.id);
  document.getElementById('invitec').onclick = () => inviteToHunt(p.id);
}

function missionPage(only, onlyCase) {
  let m;
  if (onlyCase) {
    const p = problem(only);
    const c = p?.cases.find((x) => x.id === onlyCase);
    if (!c) return notFound();
    const s = summary(p.id, c.id);
    const i = Math.floor(Math.random() * p.strategies.length);
    m = { problem: p, cas: c, summary: s, strategy: p.strategies[i], strategyIndex: i };
  } else m = pickMission(DATA, Math.random, only);
  if (!m) return notFound();
  const { problem: p, cas: c, summary: s } = m;
  const prompt = huntPrompt({ ...m, journal: DATA.journal[`${p.id}/${c.id}`] ?? [], site: site() });
  app.innerHTML = `
  <p class="crumbs"><a href="#/">Hunts</a> / Mission</p>
  <div id="war"></div>
  <div class="casepage">
    <div>${plate(p.id, c.id, 700, 'M', 'plate big')}</div>
    <div>
      <p class="kicker mono">Your mission</p>
      <h1>${esc(p.title)}, <em>n</em> = ${c.n}</h1>
      <p style="color:var(--dim)">Picked for you among the cases tried least, so the swarm does not pile up on the same spot. ${s.score ? `Current best: <span class="mono">${esc(shortScore(s.score))}</span> by @${esc(s.author)}.` : 'Nobody has a solution here yet.'}</p>
      <div class="strategy"><b>Your strategy</b><br>${esc(m.strategy)}</div>
      <ol class="tracker" id="tracker">
        <li class="on" data-step="1"><span>1</span><b>Send the mission to your AI</b><small>One click: it is copied and your app opens.</small></li>
        <li data-step="2"><span>2</span><b>Your AI hunts</b><small>It shows a 🐝 KICKSWARM header and its progress. When it gives the JSON, copy it.</small></li>
        <li data-step="3"><span>3</span><b>Come back here</b><small>The answer is checked by itself. Then one click to send it.</small></li>
      </ol>
      <div class="chatapps"><button class="btn primary" data-chat="chatgpt">Open in ChatGPT</button><button class="btn primary" data-chat="claude">Open in Claude</button><button class="btn primary" data-chat="gemini">Open in Gemini</button></div>
      <div class="cta-row"><button class="btn big" id="pasteback">${icon('download')} Paste my AI's answer</button><button class="btn" id="copyp">Copy the prompt</button></div>
      <p class="hint">Easier: <a href="#/hive">your hive</a> does all of this by itself, with free models, and you just watch. Not this case? <a href="#/mission${only ? `/${only}` : ''}" id="again">pick another one</a>.</p>
      <details style="margin-top:14px"><summary style="cursor:pointer;color:var(--dim)">Show the prompt</summary><pre class="prompt">${esc(prompt)}</pre></details>
      ${submitBox(p, c, s)}
    </div>
  </div>
  <div class="levels">
    <div class="panel"><h3>Level 0 · any chatbot</h3><p>Copy, paste, check, submit. Nothing to install.</p></div>
    <div class="panel"><h3>Level 1 · coding agents</h3><p>Clone the repository and tell Claude Code or Codex: “hunt for 30 minutes”. AGENTS.md explains the loop: npm run mission, search, npm run check, npm run submit.</p></div>
    <div class="panel"><h3>Level 2 · your whole machine</h3><p><span class="mono">npm run hunt</span> puts everything you have to work: every CPU core, local models (Ollama), free API tiers, paid APIs and your subscriptions' official CLIs, cheapest first, within daily quotas you set.</p></div>
  </div>`;
  hydrate();
  import('./war.mjs').then((w) => w.warRoom(document.getElementById('war'), { DATA, pid: p.id, focus: c.id, mode: 'mission' }));
  const step = (k) => app.querySelectorAll('#tracker li').forEach((li) => { const n = Number(li.dataset.step); li.classList.toggle('on', n === k); li.classList.toggle('done', n < k); });
  // Coming back from the AI: read the copied answer, check it, move to step 3.
  const tryClipboard = async (manual) => {
    try {
      const t = await navigator.clipboard.readText();
      if (t && t.includes('"problem"') && t.includes(`${p.id}`)) {
        document.getElementById('sol').value = t;
        step(3);
        document.getElementById('check').click();
        document.getElementById('sol').scrollIntoView({ block: 'center' });
        return;
      }
      if (manual) toast('No Kickswarm answer in the clipboard yet: copy the JSON your AI gave');
    } catch {
      if (manual) toast('Allow the clipboard, or paste the answer in the box below');
    }
  };
  document.getElementById('pasteback').onclick = () => tryClipboard(true);
  const onBack = () => { if (document.visibilityState === 'visible' && document.body.contains(document.getElementById('tracker'))) tryClipboard(false); };
  document.addEventListener('visibilitychange', onBack);
  document.getElementById('copyp').onclick = () => { copy(prompt, 'Prompt copied: paste it into your AI'); step(2); };
  // Copy, then open the chat app (with the prompt prefilled where the app accepts it in the link).
  const apps = {
    chatgpt: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`,
    claude: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`,
    gemini: () => 'https://gemini.google.com/app',
  };
  app.querySelectorAll('[data-chat]').forEach((b) => (b.onclick = async () => {
    await copy(prompt, 'Mission copied');
    const url = apps[b.dataset.chat](prompt);
    window.open(url.length < 8000 ? url : apps[b.dataset.chat]('').replace(/\?q=$/, ''), '_blank', 'noopener');
    step(2);
  }));
  document.getElementById('again').onclick = (e) => {
    e.preventDefault();
    missionPage(only);
    window.scrollTo(0, 0);
  };
  wireSubmit(p, c, s);
}

function gallery() {
  const holders = (id) => Object.entries(DATA.badges ?? {}).filter(([, l]) => l.includes(id)).map(([a]) => a);
  app.innerHTML = `
  <p class="kicker mono">The vault</p>
  <h1 class="h2big" style="margin-bottom:16px">Cards and medals.<br><em>Earned, never bought.</em></h1>
  <p class="lead dimlead" style="margin-top:0">Every record mints a card drawn from the solution itself: black and white for a first solution, colour for a swarm record, violet for a perfect one, animated gold for a world record. Medals reward the way you hunt.</p>
  <h2 class="h3big">Medals</h2>
  <div class="medals hall">${BADGES.map((b) => { const h = holders(b.id); return `<div class="medal ${h.length ? 'has' : 'locked'} r-${b.rarity}" title="${esc(b.desc)}">${medal(b, 84, !h.length)}<b>${esc(b.name)}</b><small>${esc(RARITY[b.rarity].label)} · ${esc(b.desc)}</small><small class="who">${h.length ? h.slice(0, 3).map((x) => `<a href="#/u/${esc(x)}">@${esc(x)}</a>`).join(' ') + (h.length > 3 ? ` +${h.length - 3}` : '') : 'nobody yet'}</small></div>`; }).join('')}</div>
  <h2 class="h3big" style="margin-top:44px">Cards</h2>
  ${DATA.trophies.length ? `<div class="gallery">${DATA.trophies.map((t) => `<figure><a href="trophies/${t.seq}.svg" target="_blank" title="@${esc(t.author)} · ${esc(problem(t.problem)?.title)} n=${esc(t.case)}"><img loading="lazy" src="trophies/${t.seq}.svg" alt="Trophy card #${t.seq}: ${esc(TIERS[t.tier]?.label)} by @${esc(t.author)}, ${esc(problem(t.problem)?.title)} n=${esc(t.case)}"></a>${shareButtons(t)}</figure>`).join('')}</div>` : '<p class="empty">The wall is still empty.</p>'}`;
}

function howWire() {}
function how() {
  app.innerHTML = `<div class="prose">
  <h1>How it works</h1>
  <p>Kickswarm Records is the first open hive of <a href="https://github.com/Sciscito/kickswarm">Kickswarm</a>, a protocol that lets people pool their AI subscriptions on problems whose answers can be checked by a machine.</p>
  <h2>1. Problems a machine can judge</h2>
  <p>Each hunt is a family of open records: circles packed in a square or a circle, points with no three in a line. A short judge program, readable by anyone, gives an exact score. Floating point never decides: coordinates are read as exact decimals, and the radius is computed and rounded down, so a score is always a radius that truly fits.</p>
  <h2>2. A swarm, not a crowd</h2>
  <ul>
    <li><b>Many small cases.</b> Each value of n is its own record: about 160 cases in all.</li>
    <li><b>Missions.</b> The site sends each hunter to the cases tried least, with a strategy others did not get.</li>
    <li><b>Relay.</b> Everyone starts from the current best, so each improvement becomes everybody's new starting point.</li>
    <li><b>A shared journal.</b> Attempts that do not beat the record are kept too, with their method, so nobody repeats a dead end.</li>
  </ul>
  <h2>3. Tiers and honey</h2>
  <ul>
    <li>${tierBadge('valid')} first valid solution on an empty case: +1 honey</li>
    <li>${tierBadge('swarm')} beats the best on this board: +10</li>
    <li>${tierBadge('perfect')} reaches the theoretical maximum (2n points): +25</li>
    <li>${tierBadge('world')} beats the published world record: +100</li>
  </ul>
  <p>Honey is a score of verified contribution. It is not money and cannot be bought or sold.</p>
  <h2>4. What the rest of the world knows</h2>
  <ul>
    <li>Every day the robot re-reads the reference tables. When a record improves elsewhere, the board updates and starts from that solution, credited to its source.</li>
    <li>Anyone can show a better solution published elsewhere. It is judged, credited to its real authors (${tierBadge('known')}), and the scout gets +2 honey.</li>
  </ul>
  <h2>5. Fair play</h2>
  <ul>
    <li>A record must improve by at least one unit of the 12th decimal (or one point), so nobody farms records by adding digits to another's solution.</li>
    <li>The first to submit a score gets it: the registry is ordered and chained by SHA-256 hashes. Run <span class="mono">npm run audit</span> to re-check everything.</li>
    <li>The starting packings are the published records of <a href="https://www.packomania.com">Packomania</a> (E. Specht and contributors), credited as such. A world record found here should be reported to its maintainers by its author.</li>
  </ul>
  <h2>6. Your hive</h2>
  <p>The <a href="#/hive">Hive</a> page runs the swarm on your phone or computer with presets, a voice command, and your own AI keys (kept on your device). On a computer, <span class="mono">npm run hive</span> opens the same page with everything your machine has: every core, local models, API keys, subscriptions' CLIs and scheduled nights.</p>
  <h2>7. For coding agents</h2>
  <p>The repository's <span class="mono">AGENTS.md</span> is a hunting standard any agent can follow: get a mission, write a search program, check it with the exact judge, submit only verified results.</p>
  </div>`;
}

async function catalogue() {
  const cat = await fetch('catalogue.json').then((r) => r.json());
  const stars = (k) => '★'.repeat(k) + '<span class="off">' + '★'.repeat(5 - k) + '</span>';
  const ST = { open: ['Live', 't-swarm'], next: ['Next', 't-perfect'], later: ['Later', 't-reference'] };
  const RAR = (h) => (h.status !== 'open' ? null : h.difficulty >= 5 ? ['Legendary', 'r-legendary'] : h.difficulty >= 4 ? ['Epic', 'r-epic'] : ['Rare', 'r-rare']);
  const state = { domain: 'all', status: 'all', level: 'all', sort: 'flagship' };
  const lvOf = (h) => h.level ?? (h.link?.startsWith('#/p/') ? problem(h.link.split('/')[2])?.level : null);
  app.innerHTML = `
  <p class="kicker mono">The hunts</p>
  <h1 class="h2big" style="margin-bottom:16px">Pick your hunt.<br><em>Every one is checkable.</em></h1>
  <p class="lead dimlead" style="margin-top:0">${esc(cat.note)} Flagships are the hunts with the biggest payoff for science and the world.</p>
  <div class="filters">
    <div class="chips" id="f-domain">${['all', ...Object.keys(cat.domains)].map((d) => `<button class="chip ${d === 'all' ? 'on' : ''}" data-v="${d}">${esc(d === 'all' ? 'All' : cat.domains[d])}</button>`).join('')}</div>
    <div class="chips" id="f-status">${[['all', 'Any status'], ['open', 'Live now'], ['next', 'Next'], ['later', 'Later']].map(([v, l]) => `<button class="chip ${v === 'all' ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="chips" id="f-level">${[['all', 'Any level'], ['warm-up', 'Warm-up'], ['classic', 'Classic'], ['hardcore', 'Hardcore']].map(([v, l]) => `<button class="chip ${v === 'all' ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
    <label class="sortby">Sort <select id="f-sort"><option value="flagship">Flagships first</option><option value="impact">Impact</option><option value="easy">Easiest first</option><option value="hard">Hardest first</option></select></label>
  </div>
  <div class="hub" id="hub"></div>
  <p style="color:var(--dim);margin-top:24px">Know a problem with an exact judge that matters? Open an issue on the repository: the best proposals become the next hunts.</p>`;
  const draw = () => {
    let list = cat.hunts.filter((h) => (state.domain === 'all' || h.domain === state.domain) && (state.status === 'all' || h.status === state.status) && (state.level === 'all' || lvOf(h) === state.level));
    const by = { flagship: (a, b) => (b.flagship - a.flagship) || (b.status === 'open') - (a.status === 'open') || b.impact - a.impact, impact: (a, b) => b.impact - a.impact, easy: (a, b) => a.difficulty - b.difficulty, hard: (a, b) => b.difficulty - a.difficulty };
    list = list.sort(by[state.sort]);
    document.getElementById('hub').innerHTML = list.map((h) => {
      const r = RAR(h);
      const live = h.status === 'open' && h.link?.startsWith('#/p/') ? h.link.split('/')[2] : null;
      const p = live && problem(live);
      return `<article class="hcard ${h.flagship ? 'flag' : ''} ${h.status}">
        ${h.flagship ? '<span class="flagtag mono">Flagship</span>' : ''}
        ${p ? `<a class="hthumb" href="${esc(h.link)}">${art(p.id, (DATA.feed.find((e) => e.problem === p.id && e.nature === 'record')?.case) ?? p.cases[Math.floor(p.cases.length / 2)].id, 260)}</a>` : `<div class="hthumb ghost"><span>${esc(cat.domains[h.domain] ?? '')}</span></div>`}
        <div class="hbody">
          <div class="hmeta">${levelTag(h.level ?? (p && p.level))}<span class="badge ${ST[h.status][1]}">${ST[h.status][0]}</span>${r ? `<span class="rar-tag ${r[1]}">${r[0]} rewards</span>` : ''}<span class="dom mono">${esc(cat.domains[h.domain] ?? h.domain)}</span></div>
          <h3>${h.link ? `<a href="${esc(h.link)}">${esc(h.title)}</a>` : esc(h.title)}</h3>
          <p>${esc(h.why)}</p>
          <div class="hstats"><span title="Difficulty">Difficulty <b class="stars">${stars(h.difficulty)}</b></span><span title="Impact">Impact <b class="stars imp">${stars(h.impact)}</b></span></div>
          <p class="ver"><b>Verified:</b> ${esc(h.verify)}</p>
          <div class="cta-row" style="margin-top:auto">${live ? `<button class="btn primary small" data-join="${esc(live)}">${icon('hive')} Join</button><button class="btn small" data-invite="${esc(live)}">Invite</button>` : ''}<button class="btn small" data-learn="${esc(h.title)}">Learn more</button></div>
        </div>
      </article>`;
    }).join('') || '<p class="empty">No hunt matches these filters.</p>';
    hydrate();
    app.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => joinHunt(b.dataset.join)));
    app.querySelectorAll('[data-invite]').forEach((b) => (b.onclick = () => inviteToHunt(b.dataset.invite)));
    app.querySelectorAll('[data-learn]').forEach((b) => (b.onclick = () => {
      const h = cat.hunts.find((x) => x.title === b.dataset.learn);
      const live = h.link?.startsWith('#/p/') ? problem(h.link.split('/')[2]) : null;
      learnMore({ ...h, about: live?.about, go: h.link ? h.link.replace('#/p/', '#/mission/') : null });
    }));
  };
  const chips = (id, key) => app.querySelectorAll(`#${id} .chip`).forEach((b) => (b.onclick = () => { app.querySelectorAll(`#${id} .chip`).forEach((x) => x.classList.remove('on')); b.classList.add('on'); state[key] = b.dataset.v; draw(); }));
  chips('f-domain', 'domain');
  chips('f-status', 'status');
  chips('f-level', 'level');
  document.getElementById('f-sort').onchange = (e) => { state.sort = e.target.value; draw(); };
  draw();
}

/** A hunter's collection: their trophy cards, honey and records. */
function hunterPage(author) {
  const mine = DATA.trophies.filter((t) => t.author === author);
  const lb = DATA.leaderboard.find((l) => l.author === author);
  const rank = DATA.leaderboard.findIndex((l) => l.author === author);
  const tiers = Object.fromEntries(['world', 'perfect', 'swarm', 'known', 'valid'].map((t) => [t, mine.filter((x) => x.tier === t).length]));
  app.innerHTML = `
  <p class="crumbs"><a href="#/">Hunts</a> / Hunters / @${esc(author)}</p>
  <div class="hunter-head">
    <div class="avatar-hex" aria-hidden="true"><span>${esc(author.slice(0, 2).toUpperCase())}</span></div>
    <div>
      <p class="kicker mono">Hunter${rank >= 0 ? ` · rank ${rank + 1} of ${DATA.leaderboard.length}` : ''}</p>
      <h1>@${esc(author)}</h1>
      <p class="mono hunter-stats"><b>${lb?.honey ?? 0}</b> honey · <b>${mine.length}</b> card${mine.length === 1 ? '' : 's'} · <a href="https://github.com/${esc(author)}" target="_blank" rel="noopener">GitHub ↗</a></p>
      <div class="cta-row" style="margin-top:6px"><button class="btn small" id="follow">${amis().includes(author) ? 'Following ✓' : 'Follow'}</button>${moi() === author ? '<span class="badge t-swarm">This is you</span>' : '<button class="btn small" id="itsme">This is me</button>'}<a class="btn small" href="#/players">All players</a></div>
    </div>
  </div>
  <h3 style="margin:18px 0 10px">Medals <small class="hint">${(DATA.badges?.[author] ?? []).length} of ${BADGES.length}</small></h3>
  <div class="medals">${BADGES.map((b) => { const has = (DATA.badges?.[author] ?? []).includes(b.id); return `<div class="medal ${has ? 'has' : 'locked'} r-${b.rarity}" title="${esc(b.name)}: ${esc(b.desc)}">${medal(b, 74, !has)}<b>${esc(b.name)}</b><small>${has ? esc(RARITY[b.rarity].label) : esc(b.desc)}</small></div>`; }).join('')}</div>
  <h3 style="margin:26px 0 6px">Cards</h3>
  <div class="rarity big">${Object.entries(tiers).map(([t, k]) => `<span class="rar ${k ? '' : 'none'}">${tierBadge(t)} <b class="mono">${k}</b></span>`).join('')}</div>
  ${mine.length ? `<div class="gallery">${mine.map((t) => `<figure><a href="trophies/${t.seq}.svg" target="_blank"><img loading="lazy" src="trophies/${t.seq}.svg" alt="Trophy card #${t.seq}"></a>${shareButtons(t)}</figure>`).join('')}</div>` : '<p class="empty">No card yet. <a href="#/hive">Start your hive</a>.</p>'}`;
  wireShare();
  document.getElementById('follow').onclick = () => {
    const f = amis();
    local.set('ks-friends', f.includes(author) ? f.filter((x) => x !== author) : [...f, author]);
    hunterPage(author);
    toast(f.includes(author) ? `Unfollowed @${author}` : `Following @${author}`);
  };
  document.getElementById('itsme')?.addEventListener('click', () => { local.set('ks-me', author); hunterPage(author); toast('Saved on this device: this is you'); });
}

/** Open data: what is published and how to use it. */
function dataPage() {
  const base = DATA.config.site;
  const raw = `https://raw.githubusercontent.com/${DATA.config.repo}/main`;
  app.innerHTML = `<div class="prose">
  <p class="kicker mono">Open data</p>
  <h1>All of it, <em>for science.</em></h1>
  <p class="lead dimlead">Kickswarm Records publishes every solution and every attempt, with the method used and the model that wrote the searcher. The data is under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>: use it for anything, credit "Kickswarm Records contributors".</p>
  <h2>Files</h2>
  <ul>
    <li><a href="registry.jsonl"><span class="mono">registry.jsonl</span></a>: every event, one JSON line each, chained by SHA-256 (${DATA.stats.entries} entries). Records, attempts (with method and model), references, world-record updates.</li>
    <li><span class="mono">records/&lt;problem&gt;/&lt;case&gt;.json</span>: the current best solution of each case, e.g. <a href="records/no-three-in-line/61.json">no-three-in-line/61</a>.</li>
    <li><a href="https://github.com/${esc(DATA.config.repo)}/tree/main/solutions" target="_blank" rel="noopener"><span class="mono">solutions/</span></a>: every improving solution ever recorded, by case and registry number.</li>
    <li><a href="data.json"><span class="mono">data.json</span></a>: the summary the site reads (cases, journal, leaderboard).</li>
    <li><span class="mono">problems/&lt;id&gt;/judge.mjs</span>: the exact judges, to re-check anything yourself.</li>
  </ul>
  <h2>Re-check everything</h2>
  <pre class="prompt">git clone https://github.com/${esc(DATA.config.repo)}
cd kickswarm-records
npm run audit   # recomputes the registry chain and re-judges every record</pre>
  <h2>Load it in Python</h2>
  <pre class="prompt">import json, urllib.request
rows = [json.loads(l) for l in urllib.request.urlopen("${base}/registry.jsonl").read().decode().splitlines()]
attempts = [r for r in rows if r["nature"] == "attempt"]   # what was tried, and failed
records = [r for r in rows if r["nature"] == "record"]</pre>
  <p>The code is under Apache 2.0. Starting packings and world-record values come from Packomania (E. Specht and contributors) and stay credited to them. Raw files are also served from <span class="mono">${esc(raw)}</span>.</p>
  </div>`;
}

/** Joining, for people who have never opened a terminal. */
function joinPage() {
  const zip = `https://github.com/${DATA.config.repo}/archive/refs/heads/main.zip`;
  app.innerHTML = `
  <p class="kicker mono">Join the swarm</p>
  <h1 class="h2big" style="margin-bottom:16px">Join in <em>two minutes.</em></h1>
  <p class="lead dimlead" style="margin-top:0">No account needed to hunt. Pick a path; you can add the others later.</p>
  <div class="paths">
    <section class="path">
      <span class="pnum mono">A</span><span class="pi">${icon('phone')}</span>
      <h2>This device, right now</h2>
      <p>Phone, tablet or computer. The hive runs in the page while it stays open.</p>
      <ol class="steps"><li>Press the button.</li><li>Pick a preset.</li><li>Press Start.</li></ol>
      <a class="btn primary big" href="#/hive">Start here ${icon('arrow')}</a>
    </section>
    <section class="path featured">
      <span class="pnum mono">B</span><span class="pi">${icon('laptop')}</span>
      <h2>Your computer, full power</h2>
      <p>Every core, scheduled nights, local models and your subscriptions. Windows, Mac or Linux.</p>
      <ol class="steps">
        <li>Install <a href="https://nodejs.org/en/download" target="_blank" rel="noopener">Node.js</a> (the LTS version, default choices). Free.</li>
        <li><a href="${zip}">Download Kickswarm</a> and unzip it anywhere.</li>
        <li>Double-click <span class="mono">start-hive</span> (<span class="mono">.cmd</span> on Windows, <span class="mono">.command</span> on Mac). Your dashboard opens: pick a preset, press Start.</li>
      </ol>
      <details><summary>Prefer to let an AI agent do it?</summary><p class="hint">Paste the setup prompt from <a href="#/hive">your hive page</a> into Claude Code, Codex or Gemini CLI. It asks before every step.</p></details>
    </section>
    <section class="path">
      <span class="pnum mono">C</span><span class="pi">${icon('key')}</span>
      <h2>Add free AI power</h2>
      <p>The hive works without AI, but a free model writes smarter searchers.</p>
      <ol class="steps">
        <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> with your Google account.</li>
        <li>Press “Create API key” and copy it.</li>
        <li>In your hive, open “Add a source”, paste it next to Google Gemini, press Connect.</li>
      </ol>
      <p class="hint">Free, with daily limits. The key stays on your device. Never paste it in a chat.</p>
    </section>
  </div>
  <section class="invite">
    <div>
      <h2 class="h3big">Bring your friends. <em>Every core counts.</em></h2>
      <p class="dimlead" style="margin:0">Ten friends with a laptop each, at night, is a hundred cores hunting. Send them the link; the page explains the rest.</p>
    </div>
    <button class="btn primary big" id="invite">${icon('share')} Invite friends</button>
  </section>`;
  wireInvite();
}
function wireInvite() {
  const b = document.getElementById('invite');
  if (!b) return;
  b.onclick = async () => {
    const url = `${DATA.config.site}/#/start`;
    const text = 'Join my hive on Kickswarm Records: our computers and AIs hunt open math world records together. Two minutes to join.';
    try {
      if (navigator.share) await navigator.share({ title: 'Kickswarm Records', text, url });
      else await copy(`${text} ${url}`, 'Invitation copied: send it to your friends');
    } catch {}
  };
}

/** Horizontal bars, one series: a label, a bar, the value in text ink, a tooltip on hover. */
function hbars(rows, { value, fmt = (v) => v, sub = () => '', max } = {}) {
  const top = max ?? Math.max(1, ...rows.map(value));
  if (!rows.length) return '<p class="empty">No data yet.</p>';
  return `<div class="hbars" role="list">${rows.map((r) => {
    const v = value(r);
    return `<div class="hbar" role="listitem" title="${esc(r.title ?? r.label)}: ${esc(fmt(v))}${sub(r) ? ` · ${esc(sub(r))}` : ''}"><span class="hl">${esc(r.label)}</span><span class="ht"><i style="width:${Math.max(v > 0 ? 2 : 0, (v / top) * 100)}%"></i></span><span class="hv mono">${esc(fmt(v))}</span><span class="hs">${esc(sub(r))}</span></div>`;
  }).join('')}</div>`;
}

/** Cumulative records over time, one line, a dot per day with a tooltip. */
function timeline(points) {
  if (!points.length) return '<p class="empty">No record yet.</p>';
  let acc = 0;
  const pts = points.map((p) => ({ date: p.date, v: (acc += p.n) }));
  if (pts.length === 1) pts.unshift({ date: '', v: 0 });
  const W = 520, H = 120, pad = 18;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - (v / acc) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  return `<svg class="tl" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative records over time: ${acc} in total">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="axis"/>
    <path d="${d}L${x(pts.length - 1).toFixed(1)} ${H - pad}L${pad} ${H - pad}Z" class="area"/>
    <path d="${d}" class="line"/>
    ${pts.map((p, i) => (p.date ? `<g class="pt"><circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="9" class="hit"><title>${esc(p.date)}: ${p.v} record(s) in total</title></circle><circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" class="dot"/></g>` : '')).join('')}
    <text x="${W - pad}" y="${y(acc) - 8}" text-anchor="end" class="tlv">${acc}</text>
  </svg>`;
}

/** What the swarm learns: which models did what, which strategies win, per problem. */
function statsPage() {
  const L = DATA.learning ?? { global: [], problems: {} };
  const tries = L.global.reduce((a, m) => a + m.records + m.attempts, 0);
  const recs = L.global.reduce((a, m) => a + m.records, 0);
  const pct = (r, t) => (t ? `${Math.round((100 * r) / t)}%` : '–');
  app.innerHTML = `
  <p class="kicker mono">What the swarm learns</p>
  <h1 class="h2big" style="margin-bottom:18px">Which AI did what,<br><em>and how.</em></h1>
  <p class="lead dimlead" style="margin-top:0">Every submission names the model that wrote its searcher and the strategy it followed. These numbers come straight from the public registry, and they steer the swarm: winning strategies are tried more, winning models are preferred, and the rest keep a fair chance.</p>
  <div class="proof" style="margin-bottom:40px">
    <div><b>${L.global.length}</b><span>models and searchers seen</span></div>
    <div><b>${tries}</b><span>verified tries</span></div>
    <div><b>${recs}</b><span>records</span></div>
    <div><b class="txt">${esc(L.global[0]?.model ?? '–')}</b><span>most records so far</span></div>
  </div>

  <section class="panel statblock">
    <h3>All hunts · records by model</h3>
    ${hbars(L.global.map((m) => ({ label: m.model, ...m })), { value: (m) => m.records, sub: (m) => `${m.attempts} attempt(s) · ${pct(m.records, m.records + m.attempts)} success · ${m.honey} honey` })}
  </section>

  ${DATA.problems.map((p) => {
    const P = L.problems[p.id] ?? { models: [], strategies: [], timeline: [] };
    return `<section class="panel statblock">
      <div class="statgrid">
        <div>
          <p class="mono secno" style="margin-bottom:6px">${esc(p.title)}</p>
          <h3>Records over time</h3>
          ${timeline(P.timeline)}
        </div>
        <div>
          <h3>Records by model</h3>
          ${hbars(P.models.map((m) => ({ label: m.model, ...m })), { value: (m) => m.records, sub: (m) => `${m.attempts} att. · ${pct(m.records, m.records + m.attempts)}` })}
        </div>
      </div>
      <h3 style="margin-top:22px">Strategies · success rate <small class="hint">(records per try; the number of tries in grey)</small></h3>
      ${hbars(P.strategies.map((st) => ({ label: `#${st.i} ${st.label.split(/[:.;,]/)[0]}`, title: st.label, ...st })), { value: (st) => (st.tries ? st.records / st.tries : 0), max: 1, fmt: (v) => `${Math.round(v * 100)}%`, sub: (st) => `${st.tries} tries` })}
    </section>`;
  }).join('')}

  <section class="sec" style="padding-top:60px">
    <p class="secno mono">The loop</p>
    <ol class="ladder loop">
      <li><span class="mono">1</span><h3>Hunt</h3><p>Each try records its model, strategy, score and method, failures included.</p></li>
      <li><span class="mono">2</span><h3>Measure</h3><p>This page: records per try, per model, per strategy, per problem.</p></li>
      <li><span class="mono">3</span><h3>Steer</h3><p>Missions pick strategies by an upper confidence bound; hives prefer models with a track record.</p></li>
      <li><span class="mono">4</span><h3>Evolve</h3><p>Searchers that win become the parents of the next ones. The hive improves its own tools.</p></li>
    </ol>
  </section>`;
}

// ---------- players: me, friends, search, leaderboards, best feats ----------
const local = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
/** Who "me" is on this device: chosen with "This is me", else the device's hunter name. */
function moi() {
  return local.get('ks-me', null) ?? local.get('ks-identity', null)?.name ?? null;
}
const amis = () => local.get('ks-friends', []);

/** Every hunter with their numbers, from the site data. */
function joueurs() {
  const by = new Map();
  const get = (a) => by.get(a) ?? by.set(a, { author: a, honey: 0, records: 0, world: 0, perfect: 0, medals: 0, best: null }).get(a);
  for (const l of DATA.leaderboard) Object.assign(get(l.author), { honey: l.honey, records: l.records });
  for (const t of DATA.trophies) {
    const j = get(t.author);
    if (t.tier === 'world') j.world++;
    if (t.tier === 'perfect') j.perfect++;
    const rank = { world: 4, perfect: 3, swarm: 2, known: 1, valid: 0 }[t.tier] ?? 0;
    if (!j.best || rank > j.best.rank) j.best = { ...t, rank };
  }
  for (const [a, l] of Object.entries(DATA.badges ?? {})) get(a).medals = l.length;
  return [...by.values()];
}

function carteJoueur(j, rang) {
  const me = moi() === j.author;
  return `<a class="pcard ${me ? 'me' : ''}" href="#/u/${esc(j.author)}">
    <span class="phex" data-online="${esc(j.author)}"><span>${esc(j.author.slice(0, 2).toUpperCase())}</span></span>
    <span class="pinfo"><b>@${esc(j.author)}${me ? ' <small class="badge t-swarm">you</small>' : ''}</b><small>${j.records} record(s) · ${j.medals} medal(s)${j.world ? ` · ${j.world} world` : ''}${j.perfect ? ` · ${j.perfect} perfect` : ''}</small></span>
    <span class="pval mono">${rang ? `<i>#${rang}</i>` : ''}${j.honey}<small>honey</small></span>
  </a>`;
}

function playersPage() {
  const all = joueurs();
  const me = moi();
  const meJ = all.find((j) => j.author === me);
  const friends = amis().map((a) => all.find((j) => j.author === a) ?? { author: a, honey: 0, records: 0, world: 0, perfect: 0, medals: 0 });
  const boards = {
    honey: ['Honey', (j) => j.honey],
    records: ['Records', (j) => j.records],
    medals: ['Medals', (j) => j.medals],
    elite: ['World & perfect', (j) => j.world * 100 + j.perfect],
  };
  const feats = DATA.trophies.slice().sort((a, b) => ({ world: 4, perfect: 3, swarm: 2, known: 1, valid: 0 }[b.tier] ?? 0) - ({ world: 4, perfect: 3, swarm: 2, known: 1, valid: 0 }[a.tier] ?? 0) || b.seq - a.seq).slice(0, 8);
  app.innerHTML = `
  <p class="kicker mono">Players</p>
  <h1 class="h2big" style="margin-bottom:16px">The hunters.<br><em>You, your friends, the legends.</em></h1>
  <div class="livestrip inline" data-live="strip"></div>
  <div class="psearch"><input id="q" placeholder="Search a hunter by name…" autocomplete="off" aria-label="Search a hunter"><div id="results" class="plist"></div></div>

  <div class="two" style="margin-top:22px">
    <section class="panel">
      <h3>You</h3>
      ${me ? (meJ ? carteJoueur(meJ) : `<p class="empty">@${esc(me)} has no record yet. <a href="#/hive">Start your hive</a>.</p>`) : `<p class="empty">Not set on this device. Open your profile and press “This is me”, or start your hive to get a hunter name.</p>`}
      ${me ? `<p style="margin-top:10px"><a class="btn small" href="#/u/${esc(me)}">My profile ${icon('arrow')}</a></p>` : ''}
    </section>
    <section class="panel">
      <h3>Friends <small class="hint">${friends.length}</small></h3>
      ${friends.length ? `<div class="plist">${friends.sort((a, b) => b.honey - a.honey).map((j) => carteJoueur(j)).join('')}</div>` : '<p class="empty">Follow hunters from their profile: they show up here, with their numbers next to yours.</p>'}
    </section>
  </div>

  <section class="sec" style="padding-top:44px">
    <p class="secno mono">Leaderboards</p>
    <div class="chips" id="boards">${Object.entries(boards).map(([k, [l]], i) => `<button class="chip ${i ? '' : 'on'}" data-b="${k}">${l}</button>`).join('')}</div>
    <div class="plist" id="board" style="margin-top:14px"></div>
  </section>

  <section class="sec" style="padding-top:44px">
    <p class="secno mono">Best feats</p>
    ${feats.length ? `<div class="gallery">${feats.map((t) => `<figure><a href="#/p/${esc(t.problem)}/${esc(t.case)}"><img loading="lazy" src="trophies/${t.seq}.svg" alt="${esc(TIERS[t.tier]?.label)} by @${esc(t.author)}"></a><figcaption class="featcap">${tierBadge(t.tier)} <a href="#/u/${esc(t.author)}">@${esc(t.author)}</a></figcaption></figure>`).join('')}</div>` : '<p class="empty">No feat yet.</p>'}
  </section>`;
  const drawBoard = (k) => {
    const [, f] = boards[k];
    document.getElementById('board').innerHTML = all.filter((j) => f(j) > 0).sort((a, b) => f(b) - f(a)).slice(0, 20).map((j, i) => carteJoueur(j, i + 1)).join('') || '<p class="empty">Nobody yet.</p>';
  };
  app.querySelectorAll('#boards .chip').forEach((b) => (b.onclick = () => { app.querySelectorAll('#boards .chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); drawBoard(b.dataset.b); }));
  drawBoard('honey');
  const q = document.getElementById('q');
  q.oninput = () => {
    const v = q.value.trim().toLowerCase();
    document.getElementById('results').innerHTML = v ? all.filter((j) => j.author.toLowerCase().includes(v)).slice(0, 8).map((j) => carteJoueur(j)).join('') || '<p class="empty">No hunter by that name.</p>' : '';
  };
}

/** "Learn more": a sheet explaining a hunt in plain words (what, why it matters, honest impact, how it is checked). */
function learnMore(x) {
  document.querySelector('.sheet-wrap')?.remove();
  const a = x.about ?? {};
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(x.title)}">
    <button class="sheet-x" aria-label="Close">${icon('x')}</button>
    <p class="kicker mono">Learn more</p>
    <h2 class="h3big">${esc(x.title)}</h2>
    ${a.what ? `<h3>What it is</h3><p>${esc(a.what)}</p>` : ''}
    <h3>Why it matters</h3><p>${esc(a.why ?? x.why ?? '')}</p>
    ${a.impact ? `<h3>What it would really bring</h3><p>${esc(a.impact)}</p>` : ''}
    <h3>How it is checked</h3><p>${esc(x.verify ?? x.statement ?? '')}</p>
    ${x.difficulty ? `<p class="hstats"><span>Difficulty <b class="stars">${'★'.repeat(x.difficulty)}<span class="off">${'★'.repeat(5 - x.difficulty)}</span></b></span><span>Impact <b class="stars imp">${'★'.repeat(x.impact)}<span class="off">${'★'.repeat(5 - x.impact)}</span></b></span></p>` : ''}
    ${a.fun ? `<p class="fun">${icon('spark')} ${esc(a.fun)}</p>` : ''}
    ${(a.links ?? []).length ? `<h3>Sources</h3><ul>${a.links.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a></li>`).join('')}</ul>` : ''}
    ${x.go ? `<div class="cta-row"><a class="btn primary" href="${esc(x.go)}">Hunt it ${icon('arrow')}</a></div>` : ''}
  </div>`;
  const close = () => w.remove();
  w.onclick = (e) => { if (e.target === w) close(); };
  w.querySelector('.sheet-x').onclick = close;
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  document.body.append(w);
  w.querySelector('.sheet-x').focus();
}
const learnProblem = (p) => learnMore({ title: p.title, about: p.about, why: p.tagline, verify: p.about?.verify ?? `Exact: ${p.statement}`, go: `#/mission/${p.id}` });

/** Join a hunt in one click: the hive is set on it and starts at once. */
function joinHunt(pid) {
  try { sessionStorage.setItem('ks-join', pid); } catch {}
  location.hash = '#/hive';
}
/** The link that invites friends to a hunt. */
function inviteLink(pid) {
  const by = moi();
  return `${DATA.config.site}/#/join/${pid}${by ? `/${encodeURIComponent(by)}` : ''}`;
}
function inviteToHunt(pid) {
  const p = problem(pid);
  import('./invite.mjs').then((m) => m.openInvite({ site: DATA.config.site, pid, title: p.title, by: moi(), toast }));
}
/** Hunters on a hunt over the last 7 days, from the public feed. */
function huntersOn(pid) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  return new Set(DATA.feed.filter((e) => e.problem === pid && e.ts >= since).map((e) => e.author)).size;
}
/** The page a friend lands on: one button. */
function joinLanding(pid, by) {
  const p = problem(pid);
  if (!p) return notFound();
  const fid = (DATA.feed.find((e) => e.problem === pid && e.nature === 'record')?.case) ?? p.cases[Math.floor(p.cases.length / 2)].id;
  app.innerHTML = `
  <section class="landing">
    <div>
      <p class="kicker mono">${by ? `@${esc(by)} invites you` : 'You are invited'} · ${levelTag(p.level)}</p>
      <h1 class="display" style="font-size:clamp(46px,8vw,104px)">Join the<br><em>${esc(p.title)}</em><br>hunt.</h1>
      <p class="lead dimlead" style="margin-top:0">${esc(p.about?.what ?? p.tagline)}</p>
      <div class="joinbox">
        ${local.get('ks-identity', null)?.name ? `<p class="hint">You join as <b>@${esc(local.get('ks-identity', null).name)}</b>.</p>` : `<label for="jname">Your nickname <small>so ${by ? `@${esc(by)}` : 'your friends'} can see you hunting</small></label><input id="jname" maxlength="24" autocomplete="nickname" placeholder="e.g. kev" enterkeyhint="go">`}
        <button class="btn primary big" id="joinnow">${icon('hive')} Join the hunt</button>
        <p class="hint" id="jmsg">Nothing to install, no account: it runs right here, in your browser.</p>
      </div>
      <div class="cta-row"><a class="btn ghost" href="#/map/${pid}">See the map</a><button class="btn ghost" id="learn">Learn more</button></div>
      <p class="hint">${huntersOn(pid)} hunter(s) on it this week · free models first</p>
    </div>
    ${plate(pid, fid, 600, '★', 'plate')}
  </section>`;
  hydrate();
  const msg = document.getElementById('jmsg');
  const go = async () => {
    const input = document.getElementById('jname');
    if (input) {
      const name = input.value.trim();
      if (name) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/.test(name)) { msg.textContent = '2 to 24 letters or digits (- and _ allowed), no spaces.'; input.focus(); return; }
        if (joueurs().some((j) => j.author.toLowerCase() === name.toLowerCase())) { msg.textContent = `@${name} is already taken: pick another nickname.`; input.focus(); return; }
        const { createIdentity } = await import('./identity.mjs');
        await createIdentity(name);
      }
    }
    // You follow the friend who invited you, and they see you as their friend (see war.mjs).
    if (by) {
      local.set('ks-friends', [...new Set([...amis(), by])]);
      local.set('ks-invited-by', by);
    }
    joinHunt(pid);
  };
  document.getElementById('joinnow').onclick = go;
  document.getElementById('jname')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  document.getElementById('learn').onclick = () => learnProblem(p);
}

// ---------- live: who is hunting what, right now (from the relay, every 10 seconds) ----------
let LIVE = [];
const liveAgents = () => LIVE.flatMap((h) => (h.agents ?? []).map((a) => ({ ...a, who: h.name })));
function liveChip(a) {
  const p = problem(a.problem);
  const better = a.score != null && a.startScore != null && a.score !== a.startScore;
  return `<a class="lchip" href="#/p/${esc(a.problem)}/${esc(a.case)}"><i class="pdot"></i><b>@${esc(a.who)}</b> ${a.phase === 'writing' ? 'writes a searcher for' : 'hunts'} <span>${esc(p?.title ?? a.problem)} · ${esc(a.case)}</span>${a.score != null ? ` <span class="mono ${better ? 'up' : ''}">${esc(shortScore(a.score))}${better ? ' ▲' : ''}</span>` : ''}<small class="kind k-${esc(a.kind)}">${esc(a.model || a.kind)}</small></a>`;
}
function paintLive() {
  const ag = liveAgents();
  const hunters = LIVE.filter((h) => (h.agents ?? []).length).length;
  for (const el of document.querySelectorAll('[data-live="strip"]')) {
    el.innerHTML = ag.length ? `<span class="lhead mono"><i class="pdot"></i> LIVE · ${hunters} hunter(s) · ${ag.length} agent(s)</span>${ag.slice(0, 12).map(liveChip).join('')}` : '<span class="lhead mono"><i class="pdot off"></i> Nobody is hunting right now: <a href="#/hive">be the first</a></span>';
  }
  for (const el of document.querySelectorAll('[data-live="case"]')) {
    const mine = ag.filter((a) => a.problem === el.dataset.pid && a.case === el.dataset.cid);
    el.innerHTML = mine.length ? `<h3>${icon('hive')} Being hunted right now</h3>${mine.map(liveChip).join('')}` : '';
  }
  document.querySelectorAll('.case[data-pc]').forEach((el) => {
    const [pid, cid] = el.dataset.pc.split('|');
    const n = ag.filter((a) => a.problem === pid && a.case === cid).length;
    el.classList.toggle('hunted', n > 0);
    el.dataset.hunted = n ? `${n} hunting` : '';
  });
  paintBees();
  document.querySelectorAll('[data-online]').forEach((el) => el.classList.toggle('online', LIVE.some((h) => h.name === el.dataset.online && (h.agents ?? []).length)));
}
async function pollLive() {
  if (!DATA.config.relay) return;
  const { readPresence } = await import('./lib/presence.mjs');
  LIVE = await readPresence(DATA.config.relay);
  paintLive();
}

// ---------- the territory map of a hunt: the war room (pixel planet + the fight, live) ----------
function mapPage(pid) {
  const p = problem(pid);
  if (!p) return notFound();
  app.innerHTML = `<p class="crumbs"><a href="#/catalogue">Hunts</a> / <a href="#/p/${p.id}">${esc(p.title)}</a> / Map</p>
  <div class="cta-row" style="margin-bottom:12px"><button class="btn primary" id="joinm">${icon('hive')} Join this hunt</button><button class="btn" id="invitem">${icon('share')} Invite a friend</button></div>
  <div id="war"></div>`;
  document.getElementById('joinm').onclick = () => joinHunt(p.id);
  document.getElementById('invitem').onclick = () => inviteToHunt(p.id);
  import('./war.mjs').then((m) => m.warRoom(document.getElementById('war'), { DATA, pid: p.id, mode: 'map' }));
}
function paintBees() {}

/** The pill in the header: your hive is hunting (on every page). */
function paintPill(h) {
  let el = document.getElementById('hivepill');
  if (!el) {
    el = document.createElement('a');
    el.id = 'hivepill'; el.className = 'hivepill'; el.href = '#/hive';
    document.querySelector('header.top .brand')?.after(el);
  }
  const n = (h?.active ?? []).length;
  el.hidden = !h?.running;
  el.innerHTML = `<i class="pdot"></i> Hunting · ${n} agent${n === 1 ? '' : 's'}`;
}
function notFound() {
  app.innerHTML = '<h1>Not here</h1><p><a href="#/">Back to the hunts</a></p>';
}

function route() {
  setTimeout(paintLive, 50);
  const tab = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'home';
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (tab === 'p' || tab === 'mission' || tab === 'join' || tab === 'map' ? 'catalogue' : tab === 'u' ? 'players' : tab)));
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (parts.length) { stopHero?.(); stopHero = null; }
  document.body.classList.toggle('is-home', !parts.length);
  if (!parts.length) return home();
  if (parts[0] === 'p' && parts.length === 2) return problemPage(parts[1]);
  if (parts[0] === 'p' && parts.length === 3) return casePage(parts[1], parts[2]);
  if (parts[0] === 'mission') return missionPage(parts[1], parts[2]);
  if (parts[0] === 'gallery') return (gallery(), wireShare());
  if (parts[0] === 'how') return how();
  if (parts[0] === 'catalogue') return catalogue();
  if (parts[0] === 'u' && parts[1]) return hunterPage(decodeURIComponent(parts[1]));
  if (parts[0] === 'data') return dataPage();
  if (parts[0] === 'start') return joinPage();
  if (parts[0] === 'stats') return statsPage();
  if (parts[0] === 'players') return playersPage();
  if (parts[0] === 'map' && parts[1]) return mapPage(parts[1]);
  if (parts[0] === 'join' && parts[1]) return joinLanding(parts[1], parts[2] ? decodeURIComponent(parts[2]) : null);
  if (parts[0] === 'me') { const m = moi(); if (m) { location.hash = `#/u/${m}`; return; } return playersPage(); }
  if (parts[0] === 'hive') return import('./hive.mjs').then((m) => m.hivePage(app, DATA, { toast, copy, submitUrl })).catch((e) => (app.innerHTML = `<p class="verdict bad">${esc(e.message)}</p>`));
  return notFound();
}

addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 40), { passive: true });
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__ksInstall = e; });
// Installable app (add to home screen); not on the local dashboard, whose API must never be cached.
if ('serviceWorker' in navigator && !location.port) navigator.serviceWorker.register('sw.js').catch(() => {});

try {
  DATA = await fetch('data.json', { cache: 'no-cache' }).then((r) => r.json());
  document.getElementById('head').textContent = DATA.stats.head ? `registry head ${DATA.stats.head.slice(0, 16)} · ${DATA.stats.entries} entries` : '';
  addEventListener('hashchange', route);
  route();
  // Your hive, everywhere: it wakes up with the app if you left it hunting, and a pill shows it on every page.
  try { if (JSON.parse(localStorage.getItem('ks-hive-settings') ?? 'null')?.autostart) import('./hive.mjs').then((m) => m.bootHive(DATA)).catch(() => {}); } catch {}
  addEventListener('ks-hive', (e) => paintPill(e.detail));
  addEventListener('ks-hive-record', (e) => toast(`🐝 Your hive found a record: ${e.detail.title}, ${e.detail.case}`));
  // Fresh results without reloading: the robot judges every 10 minutes.
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const d = await fetch('data.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => null);
    if (!d || d.built === DATA.built) return;
    DATA = d;
    if (!/^#\/(hive|mission|join)/.test(location.hash)) route();
    toast('New results arrived: everything is up to date');
  }, 120000);
  pollLive();
  setInterval(() => { if (document.visibilityState === 'visible') pollLive(); }, 10000);
} catch (e) {
  app.innerHTML = `<p>Could not load the hive data (${esc(e.message)}).</p>`;
}
