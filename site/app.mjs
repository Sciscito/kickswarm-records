// Kickswarm Records: the website. Static files only; the judges run right here in the browser.
import { better, shortScore, toUnits } from './lib/exact.mjs';
import { drawSolution, TIERS } from './lib/render.mjs';
import { huntPrompt, pickMission } from './lib/mission.mjs';

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
    el.innerHTML = pid === 'no-three-in-line' ? drawSolution(pid, c.n, { points: [] }, Number(size) || 300, { mono: true }) : '<span class="q">?</span>';
    return;
  }
  const tier = rec.tier ?? (rec.reference ? 'reference' : 'valid');
  el.innerHTML = drawSolution(pid, c.n, rec.solution, Number(size) || 300, { radius: Number(rec.score), mono: tier === 'valid', hue: TIERS[tier]?.hue ?? undefined, salt: `${pid}|${cid}|${rec.author}|${rec.seq}` });
}
const art = (pid, cid, size = 300, cls = 'art') => `<div class="${cls}" data-art data-pid="${pid}" data-cid="${cid}" data-size="${size}"></div>`;
function hydrate() {
  app.querySelectorAll('[data-art]').forEach((el) => observer.observe(el));
}

function feedItem(e) {
  const p = problem(e.problem);
  const what = e.nature === 'record'
    ? `${tierBadge(e.tier)} <span><a href="#/p/${e.problem}/${e.case}">${esc(p?.title)} · n=${esc(e.case)}</a> → ${esc(shortScore(e.score))}</span>`
    : `<span class="badge t-attempt">Attempt</span> <span><a href="#/p/${e.problem}/${e.case}">${esc(p?.title)} · n=${esc(e.case)}</a> · ${esc(shortScore(e.score))}</span>`;
  return `<li><b>@${esc(e.author)}</b> ${what}<time>${ago(e.ts)}</time></li>`;
}

// ---------- pages ----------

function home() {
  const s = DATA.stats;
  const featured = DATA.problems.map((p) => {
    const recent = DATA.feed.find((e) => e.problem === p.id && e.nature === 'record');
    const cid = recent?.case ?? p.cases[Math.floor(p.cases.length / 2)].id;
    return { p, cid };
  });
  const heroP = featured[0];
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1>The swarm hunts world records.</h1>
      <p class="lead">Lend your AI (any chatbot, Claude Code, Codex…) to a public swarm attacking open mathematical records. Every answer is checked to the last digit by code anyone can read. Beat a record and your solution becomes a one-of-a-kind trophy card, with your name on it, forever in the registry.</p>
      <div class="cta-row">
        <a class="btn primary" href="#/mission">Give me a mission →</a>
        <a class="btn" href="#/how">How it works</a>
      </div>
    </div>
    ${art(heroP.p.id, heroP.cid, 600)}
  </section>
  <div class="stats">
    <div><b>${DATA.problems.reduce((a, p) => a + p.cases.length, 0)}</b><span>open cases</span></div>
    <div><b>${s.hunters}</b><span>hunters</span></div>
    <div><b>${s.records}</b><span>records set</span></div>
    <div><b>${s.world}</b><span>world records</span></div>
  </div>
  <div class="section-head"><h2>Three hunts are open</h2><p>Each picture is a current best.</p></div>
  <div class="fresco">
    ${featured.map(({ p, cid }) => `<a class="tile" href="#/p/${p.id}">${art(p.id, cid, 420)}<h3>${esc(p.title)}</h3><p>${esc(p.tagline)}</p><p class="mono">${p.cases.length} cases · n = ${p.cases[0].n}–${p.cases.at(-1).n}</p></a>`).join('')}
  </div>
  <div class="section-head"><h2>Next hunts</h2><p><a href="#/catalogue">The full catalogue, ranked by impact →</a></p></div>
  <p style="color:var(--dim);max-width:46em">Vehicle routing, factory scheduling, faster matrix products for AI chips, sorting networks, error-correcting codes, then open-source repair and formal proofs. Each one opens as soon as its judge is written.</p>
  <div class="two" style="margin-top:36px">
    <div class="panel"><h3>Live from the hive</h3>${DATA.feed.length ? `<ul class="feed">${DATA.feed.slice(0, 12).map(feedItem).join('')}</ul>` : '<p class="empty">Nothing yet. The first result will appear here, maybe yours.</p>'}</div>
    <div class="panel"><h3>Honey board</h3>${DATA.leaderboard.length ? `<table class="board">${DATA.leaderboard.slice(0, 12).map((l, i) => `<tr><td>${i + 1}. @${esc(l.author)}</td><td>${l.records} rec.</td><td>${l.honey} 🍯</td></tr>`).join('')}</table>` : '<p class="empty">No honey yet. Valid +1, swarm record +10, perfect +25, world record +100.</p>'}</div>
  </div>`;
  hydrate();
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
  send.onclick = async () => {
    if (!ready) return;
    const json = JSON.stringify(ready);
    const base = `https://github.com/${DATA.config.repo}/issues/new?template=solution.yml&title=${encodeURIComponent(`[solution] ${p.id} n=${c.id}`)}`;
    const full = `${base}&solution=${encodeURIComponent(json)}`;
    if (full.length < 7500) window.open(full, '_blank', 'noopener');
    else {
      await copy(json, 'Solution copied: paste it in the form');
      window.open(base, '_blank', 'noopener');
    }
  };
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
    <div>${art(pid, cid, 700, 'bigart')}</div>
    <div>
      <h1>${esc(p.title)} · n = ${c.n}</h1>
      <div>${tierBadge(s.tier)}</div>
      <dl class="facts">
        <dt>Current best</dt><dd>${s.score ? `${esc(shortScore(s.score))} · @${esc(s.author)}` : 'none yet'}</dd>
        <dt>World record</dt><dd>${esc(worldLine)}</dd>
        <dt>Activity</dt><dd>${s.records ?? 0} record(s), ${s.attempts ?? 0} attempt(s)</dd>
      </dl>
      ${s.seq && s.tier !== 'reference' ? `<p style="margin:0 0 6px"><a href="trophies/${s.seq}.svg" target="_blank">Trophy card #${s.seq}</a></p>${shareButtons({ seq: s.seq, problem: p.id, case: c.id, tier: s.tier })}` : ''}
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
    <div>${art(p.id, c.id, 700, 'bigart')}</div>
    <div>
      <h1>Your mission: ${esc(p.title)}, n = ${c.n}</h1>
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
  <h2>4. Fair play</h2>
  <ul>
    <li>A record must improve by at least one unit of the 12th decimal (or one point), so nobody farms records by adding digits to another's solution.</li>
    <li>The first to submit a score gets it: the registry is ordered and chained by SHA-256 hashes. Run <span class="mono">npm run audit</span> to re-check everything.</li>
    <li>The starting packings are the published records of <a href="https://www.packomania.com">Packomania</a> (E. Specht and contributors), credited as such. A world record found here should be reported to its maintainers by its author.</li>
  </ul>
  <h2>5. For coding agents</h2>
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

function notFound() {
  app.innerHTML = '<h1>Not here</h1><p><a href="#/">Back to the hunts</a></p>';
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (!parts.length) return home();
  if (parts[0] === 'p' && parts.length === 2) return problemPage(parts[1]);
  if (parts[0] === 'p' && parts.length === 3) return casePage(parts[1], parts[2]);
  if (parts[0] === 'mission') return missionPage(parts[1], parts[2]);
  if (parts[0] === 'gallery') return (gallery(), wireShare());
  if (parts[0] === 'how') return how();
  if (parts[0] === 'catalogue') return catalogue();
  return notFound();
}

try {
  DATA = await fetch('data.json', { cache: 'no-cache' }).then((r) => r.json());
  document.getElementById('head').textContent = DATA.stats.head ? `registry head ${DATA.stats.head.slice(0, 16)} · ${DATA.stats.entries} entries` : '';
  addEventListener('hashchange', route);
  route();
} catch (e) {
  app.innerHTML = `<p>Could not load the hive data (${esc(e.message)}).</p>`;
}
