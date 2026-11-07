// Kickswarm Records: the website. Static files only; the judges run right here in the browser.
import { better, shortScore, toUnits } from './lib/exact.mjs';
import { drawSolution, TIERS } from './lib/render.mjs';
import { huntPrompt, pickMission } from './lib/mission.mjs';
import { BEE, icon } from './icons.mjs';

const app = document.getElementById('app');
let DATA;
const solutions = new Map();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const site = () => (location.hostname.endsWith('github.io') ? DATA.config.site : location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, ''));
const problem = (id) => DATA.problems.find((p) => p.id === id);
const summary = (pid, cid) => DATA.cases[`${pid}/${cid}`] ?? {};
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
    el.innerHTML = pid === 'no-three-in-line' ? drawSolution(pid, c.n, { points: [] }, Number(size) || 300, { tier: 'valid', mono: true }) : '<span class="q">?</span>';
    return;
  }
  const tier = rec.tier ?? (rec.reference ? 'reference' : 'valid');
  el.innerHTML = drawSolution(pid, c.n, rec.solution, Number(size) || 300, { tier, radius: p.score_name === 'radius' ? Number(rec.score) : undefined, mono: tier === 'valid' });
}
/** A drawing framed as a plate of the observatory notebook, with its caption. */
const plate = (pid, cid, size, fig, cls = 'plate') => {
  const p = problem(pid);
  const s = summary(pid, cid);
  const val = s.score ? `${p.score_name === 'radius' ? 'r' : 'points'} = ${shortScore(s.score)}` : 'open';
  return `<figure class="${cls}">${art(pid, cid, size, 'art')}<figcaption><i>Fig. ${esc(fig)}</i> ${esc(p.title)}, <i>n</i> = ${esc(cid)} <span class="mono">${esc(val)}</span></figcaption></figure>`;
};
const art = (pid, cid, size = 300, cls = 'art') => `<div class="${cls}" data-art data-pid="${pid}" data-cid="${cid}" data-size="${size}"></div>`;
function hydrate() {
  app.querySelectorAll('[data-art]').forEach((el) => observer.observe(el));
}

/** Open the GitHub form prefilled with a solution (or copy it when it is too long for a link). */
async function submitUrl(sub) {
  const json = JSON.stringify(sub);
  const base = `https://github.com/${DATA.config.repo}/issues/new?template=solution.yml&title=${encodeURIComponent(`[solution] ${sub.problem} n=${sub.case}`)}`;
  const full = `${base}&solution=${encodeURIComponent(json)}`;
  if (full.length < 7500) window.open(full, '_blank', 'noopener');
  else {
    await copy(json, 'Solution copied: paste it in the form');
    window.open(base, '_blank', 'noopener');
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
          <div class="cta-row"><a class="btn primary" href="#/mission/${p.id}">Hunt it ${icon('arrow')}</a><a class="btn ghost" href="#/p/${p.id}">See the board</a></div>
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
  <h1>${esc(p.title)}</h1>
  <p class="lead" style="max-width:46em;color:var(--dim)">${esc(p.statement)}</p>
  <div class="cta-row"><a class="btn primary" href="#/mission/${p.id}">Mission on this hunt →</a><a class="btn" href="${esc(p.world_source.url)}" target="_blank" rel="noopener">Reference table ↗</a></div>
  <div class="legend">${['reference', 'valid', 'swarm', 'perfect', 'world'].filter((t) => t !== 'perfect' || p.id === 'no-three-in-line').filter((t) => t !== 'reference' || p.id !== 'no-three-in-line').map(tierBadge).join('')}${p.id === 'no-three-in-line' ? tierBadge(null) : ''}</div>
  <div class="cases">
    ${p.cases.map((c) => {
      const s = summary(p.id, c.id);
      const world = p.id === 'no-three-in-line' && !c.world;
      return `<a class="case" href="#/p/${p.id}/${c.id}">${art(p.id, c.id, 220)}<div class="row"><span class="n">n = ${c.n}</span>${tierBadge(s.tier)}</div><div class="row"><span class="s">${s.score ? esc(shortScore(s.score)) : world ? '2n never found' : 'empty'}</span><span class="s">${s.attempts ? `${s.attempts} tries` : ''}</span></div></a>`;
    }).join('')}
  </div>`;
  hydrate();
}

/** What a judged score would earn, mirroring the robot (lib/process.mjs). */
function predict(p, c, score, s) {
  const minGain = p.score_name === 'radius' ? '0.000000000001' : '1';
  if (s.score) {
    if (toUnits(score) === toUnits(s.score)) return { tier: 'attempt', text: `equals the current best (${shortScore(s.score)}). It will be logged as an attempt in the journal.` };
    if (!better(score, s.score, p.direction)) return { tier: 'attempt', text: `does not beat the current best (${shortScore(s.score)}). It will be logged as an attempt in the journal.` };
    if (toUnits(score) - toUnits(s.score) < toUnits(minGain)) return { tier: 'attempt', text: `is above the current best by less than the minimum step (${minGain}). It will be logged as an attempt.` };
  }
  if (p.id === 'no-three-in-line') {
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
  <textarea id="sol" spellcheck="false" placeholder='{"problem": "${p.id}", "case": "${c.id}", "${p.id === 'no-three-in-line' ? 'points' : 'centers'}": [...], "method": "...", "model": "..."}'></textarea>
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
  const worldLine = p.id === 'no-three-in-line'
    ? c.world ? `${2 * c.n} points (perfect), published` : `never published: ${2 * c.n} points would be a world first`
    : `${c.world.score}`;
  app.innerHTML = `
  <p class="crumbs"><a href="#/">Hunts</a> / <a href="#/p/${p.id}">${esc(p.title)}</a> / n = ${c.n}</p>
  <div class="casepage">
    <div>${plate(pid, cid, 700, s.seq ?? '—', 'plate big')}</div>
    <div>
      <h1>${esc(p.title)}, <em>n</em> = ${c.n}</h1>
      <div>${tierBadge(s.tier)}</div>
      <dl class="facts">
        <dt>Current best</dt><dd>${s.score ? `${esc(shortScore(s.score))} · ${s.credit ? `${esc(s.credit)} (found by @${esc(s.author)})` : `@${esc(s.author)}`}` : 'none yet'}</dd>
        <dt>World record</dt><dd>${esc(worldLine)}</dd>
        <dt>Activity</dt><dd>${s.records ?? 0} record(s), ${s.attempts ?? 0} attempt(s)</dd>
      </dl>
      ${s.seq && s.tier !== 'reference' ? `<p style="margin:0 0 6px"><a href="trophies/${s.seq}.svg" target="_blank">Trophy card #${s.seq}</a></p>${shareButtons({ seq: s.seq, problem: p.id, case: c.id, tier: s.tier })}` : ''}
      <p class="hint">Seen a better solution published elsewhere? <a href="https://github.com/${esc(DATA.config.repo)}/issues/new?template=known.yml" target="_blank" rel="noopener">Show it</a>: it is judged, credited to its authors, and you get +2 honey as the scout.</p>
      <div class="cta-row"><a class="btn primary" href="#/mission/${p.id}/${c.id}">Hunt this case →</a>${s.score ? `<a class="btn" href="records/${p.id}/${c.id}.json" download>Download current best</a>` : ''}</div>
      ${submitBox(p, c, s)}
      <h3 style="margin-top:26px">Hunting journal</h3>
      ${j.length ? `<ul class="feed">${j.slice(0, 30).map((e) => `<li>${e.nature === 'record' ? tierBadge(e.tier) : '<span class="badge t-attempt">Attempt</span>'} <span><b>@${esc(e.author)}</b> ${esc(shortScore(e.score))}${e.method ? ` — ${esc(e.method)}` : ''}${e.model ? ` <span class="mono" style="color:var(--faint)">[${esc(e.model)}]</span>` : ''}</span><time>${ago(e.ts)}</time></li>`).join('')}</ul>` : '<p class="empty">No attempt yet on this case.</p>'}
    </div>
  </div>`;
  hydrate();
  wireSubmit(p, c, s);
  wireShare();
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
  <div class="casepage">
    <div>${plate(p.id, c.id, 700, 'M', 'plate big')}</div>
    <div>
      <p class="kicker mono">Your mission</p>
      <h1>${esc(p.title)}, <em>n</em> = ${c.n}</h1>
      <p style="color:var(--dim)">Picked for you among the cases tried least, so the swarm does not pile up on the same spot. ${s.score ? `Current best: <span class="mono">${esc(shortScore(s.score))}</span> by @${esc(s.author)}.` : 'Nobody has a solution here yet.'}</p>
      <div class="strategy"><b>Your strategy</b><br>${esc(m.strategy)}</div>
      <ol class="steps">
        <li>Copy the prompt below and paste it into your AI. It works best with one that can run code: ChatGPT, Claude, Gemini.</li>
        <li>Let it work. It answers with one JSON object.</li>
        <li>Paste that JSON below and press Check. If it is valid, press Submit: the robot records it and replies on GitHub within a minute.</li>
      </ol>
      <div class="cta-row"><button class="btn primary" id="copyp">Copy the prompt</button><a class="btn" href="#/mission${only ? `/${only}` : ''}" id="again">Another mission</a></div>
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
  document.getElementById('copyp').onclick = () => copy(prompt, 'Prompt copied: paste it into your AI');
  document.getElementById('again').onclick = (e) => {
    e.preventDefault();
    missionPage(only);
    window.scrollTo(0, 0);
  };
  wireSubmit(p, c, s);
}

function gallery() {
  app.innerHTML = `
  <h1>Gallery</h1>
  <p style="color:var(--dim);max-width:44em">Every record leaves a trophy card drawn from the solution itself. No two are alike. Black and white for a first valid solution, colour for a swarm record, violet for a perfect one, animated gold for a world record.</p>
  ${DATA.trophies.length ? `<div class="gallery">${DATA.trophies.map((t) => `<figure><a href="trophies/${t.seq}.svg" target="_blank" title="@${esc(t.author)} · ${esc(problem(t.problem)?.title)} n=${esc(t.case)}"><img loading="lazy" src="trophies/${t.seq}.svg" alt="Trophy card #${t.seq}: ${esc(TIERS[t.tier]?.label)} by @${esc(t.author)}, ${esc(problem(t.problem)?.title)} n=${esc(t.case)}"></a>${shareButtons(t)}</figure>`).join('')}</div>` : '<p class="empty">The wall is still empty. The first card could be yours: <a href="#/mission">get a mission</a>.</p>'}`;
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
  const st = { open: ['Open now', 't-swarm'], next: ['Next', 't-perfect'], later: ['Later', 't-reference'] };
  app.innerHTML = `
  <h1>The hunt catalogue</h1>
  <p style="color:var(--dim);max-width:46em">${esc(cat.note)}</p>
  <div class="legend">${Object.entries(cat.domains).map(([k, v]) => `<span class="badge t-valid">${esc(v)}</span>`).join('')}</div>
  <div class="catalogue">
    ${cat.hunts.map((h, i) => `<article class="panel cat">
      <div class="row"><span class="rank">${i + 1}</span><span class="badge ${st[h.status][1]}">${st[h.status][0]}</span></div>
      <h3>${h.link ? `<a href="${esc(h.link)}">${esc(h.title)}</a>` : esc(h.title)}</h3>
      <p class="dom">${esc(cat.domains[h.domain])}</p>
      <p>${esc(h.why)}</p>
      <p class="ver"><b>Verified:</b> ${esc(h.verify)}</p>
    </article>`).join('')}
  </div>
  <p style="color:var(--dim);margin-top:20px">Know a problem with an exact judge that matters? Open an issue on the repository: the best proposals become the next hunts.</p>`;
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
    </div>
  </div>
  <div class="rarity big">${Object.entries(tiers).map(([t, k]) => `<span class="rar ${k ? '' : 'none'}">${tierBadge(t)} <b class="mono">${k}</b></span>`).join('')}</div>
  ${mine.length ? `<div class="gallery">${mine.map((t) => `<figure><a href="trophies/${t.seq}.svg" target="_blank"><img loading="lazy" src="trophies/${t.seq}.svg" alt="Trophy card #${t.seq}"></a>${shareButtons(t)}</figure>`).join('')}</div>` : '<p class="empty">No card yet. <a href="#/hive">Start your hive</a>.</p>'}`;
  wireShare();
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

function notFound() {
  app.innerHTML = '<h1>Not here</h1><p><a href="#/">Back to the hunts</a></p>';
}

function route() {
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
} catch (e) {
  app.innerHTML = `<p>Could not load the hive data (${esc(e.message)}).</p>`;
}
