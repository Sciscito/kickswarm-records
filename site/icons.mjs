// The Kickswarm icon set: one hand-drawn family of 24px line icons (1.6px stroke, round joins) and the
// geometric bee mark. Inline SVG strings, coloured by currentColor.

const S = (body, vb = 24) => `<svg class="ic" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** The bee: a hexagonal body cut by two bands, wings drawn as two arcs. */
export const BEE = `<svg class="bee-mark" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M22 18c-7-9-19-5-15 3 3 6 11 7 17 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".7"/>
  <path d="M42 18c7-9 19-5 15 3-3 6-11 7-17 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".7"/>
  <path d="M32 14l12 7v16l-12 7-12-7V21z" fill="currentColor"/>
  <path d="M20 27.5h24M20 33.5h24" stroke="var(--bg)" stroke-width="3"/>
  <path d="M32 44v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

/** The brand hexagon with three cells. */
export const MARK = `<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><path d="M16 2l12 7v14l-12 7-12-7V9z" fill="var(--honey)"/><g fill="var(--bg)"><circle cx="13" cy="14" r="2.6"/><circle cx="19" cy="14" r="2.6"/><circle cx="16" cy="19.5" r="2.6"/></g></svg>`;

export const ICONS = {
  moon: S('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  hive: S('<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 8.5l3 1.75v3.5L12 15.5l-3-1.75v-3.5z"/>'),
  leaf: S('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19l7-7"/>'),
  flame: S('<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-4 3.5-6 4-10 3 2 4.5 4.5 4.5 7 1-1 1.5-2 1.5-3.5 2 1.5 3 4 3 6.5 0 3.4-2.5 6-6.5 6z"/>'),
  cpu: S('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>'),
  laptop: S('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>'),
  phone: S('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  rec: S('<circle cx="12" cy="12" r="6" fill="currentColor"/>'),
  pen: S('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'),
  search: S('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  telescope: S('<path d="M3 13l12-6 2 4-12 6z"/><path d="M15 7l3-1.5 2 4-3 1.5"/><path d="M9 16l-2 5M11 15l3 6"/>'),
  share: S('<path d="M12 15V3M7.5 7.5L12 3l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  download: S('<path d="M12 3v12M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  key: S('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2 2"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  spark: S('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
  install: S('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M12 7v7M9.5 11.5L12 14l2.5-2.5"/>'),
  terminal: S('<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>'),
  x: S('<path d="M5 4l14 16M19 4L5 20"/>'),
  arrow: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};
export const icon = (name) => ICONS[name] ?? '';
