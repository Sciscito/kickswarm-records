// Invite a friend to a hunt, fast: the link is copied at once, one tap sends it through WhatsApp, SMS,
// Telegram or e-mail, and a QR code lets a friend next to you scan it. No system share dialog on computers
// (slow and clumsy on Windows); the phone's share sheet stays available as "More apps".

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = QR_LIB; s.async = true;
    s.onload = () => (window.qrcode ? ok(window.qrcode) : ko(new Error('no qr')));
    s.onerror = ko;
    document.head.append(s);
  });
}

/** The link that brings a friend straight into a hunt. */
export function huntLink(site, pid, by) {
  return `${site.replace(/\/$/, '')}/#/join/${pid}${by ? `/${encodeURIComponent(by)}` : ''}`;
}

/** Open the invite sheet. */
export function openInvite({ site, pid, title, by, toast }) {
  const url = huntLink(site, pid, by);
  const text = `${by ? `${by} invites you` : 'Join me'} on the ${title} hunt on Kickswarm: our AIs team up on real science records. Tap, pick a nickname, you're in. Nothing to install.`;
  const msg = `${text}\n${url}`;
  const touch = matchMedia('(pointer: coarse)').matches;
  // On a phone: straight to the share sheet (WhatsApp, SMS, Messenger…), nothing in between.
  if (touch && navigator.share) {
    navigator.share({ title: `Kickswarm · ${title}`, text, url }).catch((e) => { if (e?.name !== 'AbortError') openSheet(); });
    return;
  }
  openSheet();
  function openSheet() {
  document.querySelector('.sheet-wrap')?.remove();
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet invite" role="dialog" aria-modal="true" aria-label="Invite a friend">
    <button class="sheet-x" aria-label="Close">✕</button>
    <p class="kicker mono">Invite a friend</p>
    <h2 class="h3big" style="margin:4px 0 12px">${esc(title)}</h2>
    <div class="invlink"><input readonly value="${esc(url)}" aria-label="Invitation link"><button class="btn primary" data-act="copy">Copy</button></div>
    <p class="hint" data-w="copied">The link is copied: paste it anywhere.</p>
    <div class="invapps">
      <a class="invapp wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}"><b>WhatsApp</b></a>
      <a class="invapp sms" href="sms:?&body=${encodeURIComponent(msg)}"><b>SMS</b></a>
      <a class="invapp tg" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}"><b>Telegram</b></a>
      <a class="invapp mail" href="mailto:?subject=${encodeURIComponent(`Join me on Kickswarm: ${title}`)}&body=${encodeURIComponent(msg)}"><b>E-mail</b></a>
      ${touch && navigator.share ? '<button class="invapp more" data-act="share"><b>More apps…</b></button>' : ''}
    </div>
    <div class="invqr"><div data-w="qr" aria-label="QR code of the invitation"></div><p>A friend next to you? <b>They scan this</b> with their phone camera.</p></div>
    <p class="hint">Your friend opens the link, types a nickname and taps <b>Join</b>: their phone or computer hunts at once, in the browser. ${by ? `They follow you automatically, and they show up in <b>your friends</b>.` : ''}</p>
  </div>`;
  const close = () => w.remove();
  w.onclick = (e) => { if (e.target === w) close(); };
  w.querySelector('.sheet-x').onclick = close;
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  document.body.append(w);
  const input = w.querySelector('input');
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast?.('Link copied'); }
    catch { input.select(); try { document.execCommand('copy'); toast?.('Link copied'); } catch { w.querySelector('[data-w="copied"]').textContent = 'Select the link above and copy it.'; } }
  };
  copy();
  input.onfocus = () => input.select();
  w.querySelector('[data-act="copy"]').onclick = copy;
  w.querySelector('[data-act="share"]')?.addEventListener('click', () => navigator.share({ title: `Kickswarm · ${title}`, text, url }).catch(() => {}));
  loadQr().then((qrcode) => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const box = w.querySelector('[data-w="qr"]');
    if (box) box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }).catch(() => w.querySelector('.invqr')?.remove());
  }
}
