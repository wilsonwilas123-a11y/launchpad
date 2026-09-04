/**
 * Sitelet — a tiny, deterministic SVG "website thumbnail" generator.
 *
 * Used for design-gallery previews, dashboard card thumbnails and landing-page
 * examples. Everything is drawn from the palette + layout kind, so a thumbnail
 * always matches the site it represents. No third-party imagery, no network.
 */

const hex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

function mix(a, b, amount) {
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parse(h) {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function prng(seed) {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const bar = (x, y, w, h, fill, opacity = 1, r = 3) =>
  `<rect x="${x}" y="${y}" width="${Math.max(w, 2)}" height="${h}" rx="${r}" fill="${fill}" opacity="${opacity}"/>`;

function imageBlock(x, y, w, h, { bg, accent, seed, id }) {
  const rand = prng(seed);
  const g1 = mix(bg, accent, 0.35 + rand() * 0.3);
  const g2 = mix(bg, '#000000', 0.25);
  const cx = x + w * (0.25 + rand() * 0.5);
  const cy = y + h * (0.2 + rand() * 0.5);
  return `
    <defs>
      <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${g1}"/><stop offset="100%" stop-color="${g2}"/>
      </linearGradient>
    </defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="url(#g${id})"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) * 0.42}" fill="${accent}" opacity="0.16"/>
    <rect x="${x}" y="${y + h * 0.62}" width="${w}" height="${h * 0.38}" rx="8" fill="${bg}" opacity="0.55"/>`;
}

/**
 * @param {{palette:string[], kind:string, seed?:number, width?:number, height?:number,
 *           sections?:string[], tagline?:boolean}} opts
 */
function renderSitelet(opts = {}) {
  const palette = Array.isArray(opts.palette) && opts.palette.length >= 2 ? opts.palette : ['#0a0a0c', '#f5f5f7', '#ffffff'];
  const bg = hex(palette[0], '#0a0a0c');
  const fg = hex(palette[1], '#f5f5f7');
  const accent = hex(palette[2] || palette[1], '#ffffff');
  const kind = opts.kind || 'hero-centered';
  const W = opts.width || 640;
  const H = opts.height || 400;
  const seed = opts.seed || 7;
  const rand = prng(seed);

  const soft = mix(fg, bg, 0.72);
  const softer = mix(fg, bg, 0.86);
  const card = mix(bg, fg, bg === '#0a0a0c' ? 0.05 : 0.04);
  const onDark = parse(bg).reduce((a, v) => a + v, 0) < 380;
  const sections = opts.sections || [];

  let i = 0;
  const uid = () => `${seed}${i++}`;
  const parts = [];

  // Browser chrome (the frame Launchpad renders previews inside)
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="${bg}"/>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="26" rx="0" fill="${mix(bg, fg, onDark ? 0.03 : 0.02)}"/>`);
  parts.push(bar(14, 10, 6, 6, soft, 0.5, 6), bar(26, 10, 6, 6, soft, 0.35, 6), bar(38, 10, 6, 6, soft, 0.25, 6));
  parts.push(bar(W - 120, 9, 106, 8, softer, 0.35, 4));

  let y = 40;
  const pad = 24;
  const cw = W - pad * 2;

  // Nav
  parts.push(bar(pad, y, 34, 8, accent, 0.95, 4));
  [0.5, 0.36, 0.3].forEach((o, idx) => parts.push(bar(W - pad - 30 - idx * 34, y + 1, 24, 6, fg, o, 3)));
  y += 22;

  if (kind === 'hero-fullbleed') {
    const h = H * 0.5;
    parts.push(imageBlock(pad, y, cw, h, { bg, accent, seed: seed + 3, id: uid() }));
    parts.push(bar(pad + 20, y + h - 74, cw * 0.6, 13, fg, 0.95, 4));
    parts.push(bar(pad + 20, y + h - 54, cw * 0.42, 13, fg, 0.75, 4));
    parts.push(bar(pad + 20, y + h - 30, cw * 0.26, 7, soft, 0.7, 3));
    parts.push(bar(pad + 20, y + h - 18, 60, 0, accent, 0, 3));
    y += h + 16;
  } else if (kind === 'hero-split') {
    const h = H * 0.34;
    parts.push(bar(pad, y + 4, cw * 0.34, 12, fg, 0.95, 4));
    parts.push(bar(pad, y + 22, cw * 0.3, 12, fg, 0.7, 4));
    parts.push(bar(pad, y + 44, cw * 0.28, 6, soft, 0.55, 3));
    parts.push(bar(pad, y + 56, cw * 0.22, 6, soft, 0.4, 3));
    parts.push(bar(pad, y + 74, 70, 14, accent, 0.9, 7));
    parts.push(imageBlock(pad + cw * 0.44, y, cw * 0.56, h, { bg, accent, seed: seed + 5, id: uid() }));
    y += h + 16;
  } else if (kind === 'magazine') {
    parts.push(bar(pad, y + 2, cw * 0.78, 18, fg, 0.95, 4));
    parts.push(bar(pad, y + 26, cw * 0.62, 18, fg, 0.55, 4));
    parts.push(bar(pad, y + 52, cw, 1, soft, 0.35, 1));
    y += 62;
  } else {
    const h = H * 0.3;
    parts.push(bar(W / 2 - cw * 0.2, y + 6, cw * 0.4, 6, accent, 0.5, 3));
    parts.push(bar(W / 2 - cw * 0.34, y + 20, cw * 0.68, 14, fg, 0.95, 4));
    parts.push(bar(W / 2 - cw * 0.24, y + 40, cw * 0.48, 14, fg, 0.6, 4));
    parts.push(bar(W / 2 - cw * 0.28, y + 60, cw * 0.56, 6, soft, 0.5, 3));
    parts.push(bar(W / 2 - 44, y + 78, 88, 16, accent, 0.9, 8));
    y += h * 0.72 + 18;
  }

  // Content rhythm derived from the real section list where we have one
  const remaining = H - y - 22;
  const rows = sections.length ? sections.filter((s) => s !== 'hero' && s !== 'footer') : ['features', 'gallery', 'cta'];
  const slice = rows.slice(0, 3);
  if (remaining > 40) {
    const rh = Math.max(26, Math.min(64, remaining / slice.length - 8));
    slice.forEach((s, idx) => {
      const ry = y + idx * (rh + 10);
      if (s === 'gallery' || s === 'productShowcase') {
        const cols = s === 'gallery' ? 4 : 3;
        const w = (cw - (cols - 1) * 8) / cols;
        for (let c = 0; c < cols; c++) {
          parts.push(imageBlock(pad + c * (w + 8), ry, w, rh, { bg, accent, seed: seed + 11 + c, id: uid() }));
        }
      } else if (s === 'features' || s === 'stats') {
        const cols = 3;
        const w = (cw - (cols - 1) * 10) / cols;
        for (let c = 0; c < cols; c++) {
          const x = pad + c * (w + 10);
          parts.push(`<rect x="${x}" y="${ry}" width="${w}" height="${rh}" rx="8" fill="${card}" opacity="0.9"/>`);
          parts.push(bar(x + 10, ry + 10, 14, 14, accent, 0.6, 5));
          parts.push(bar(x + 10, ry + 30, w * 0.7, 6, fg, 0.75, 3));
          parts.push(bar(x + 10, ry + 40, w * 0.5, 5, soft, 0.5, 3));
        }
      } else if (s === 'testimonials') {
        parts.push(bar(pad, ry + 4, 3, rh - 8, accent, 0.8, 2));
        parts.push(bar(pad + 14, ry + 6, cw * 0.62, 7, fg, 0.7, 3));
        parts.push(bar(pad + 14, ry + 18, cw * 0.48, 7, soft, 0.5, 3));
        parts.push(bar(pad + 14, ry + 30, cw * 0.24, 6, softer, 0.6, 3));
      } else if (s === 'countdown') {
        for (let c = 0; c < 4; c++) {
          const w = 46;
          const x = pad + c * (w + 8);
          parts.push(`<rect x="${x}" y="${ry}" width="${w}" height="${Math.min(rh, 34)}" rx="8" fill="${card}"/>`);
          parts.push(bar(x + 12, ry + 12, w - 24, 10, fg, 0.85, 3));
        }
      } else if (s === 'waitlist' || s === 'cta' || s === 'newsletter' || s === 'preSave') {
        parts.push(`<rect x="${pad}" y="${ry}" width="${cw}" height="${Math.min(rh, 40)}" rx="10" fill="${mix(bg, accent, onDark ? 0.14 : 0.1)}" opacity="0.95"/>`);
        parts.push(bar(pad + 16, ry + 12, cw * 0.3, 7, fg, 0.85, 3));
        parts.push(bar(W - pad - 84, ry + 10, 68, 18, accent, 0.9, 9));
      } else {
        parts.push(bar(pad, ry + 4, cw * 0.28, 8, fg, 0.8, 3));
        parts.push(bar(pad, ry + 18, cw * 0.7, 6, soft, 0.5, 3));
        parts.push(bar(pad, ry + 28, cw * 0.55, 6, softer, 0.35, 3));
      }
    });
  }

  // Footer strip
  parts.push(bar(pad, H - 16, cw * 0.3, 5, softer, 0.35, 3));
  parts.push(bar(W - pad - 60, H - 16, 60, 5, softer, 0.25, 3));

  const glowId = 'glow';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="${glowId}" cx="50%" cy="0%" r="75%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${parts.join('')}
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#${glowId})" rx="14"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${fg}" stroke-opacity="0.08"/>
</svg>`;
}

function toDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

function siteletThumb(opts) {
  return toDataUri(renderSitelet(opts));
}

module.exports = { renderSitelet, toDataUri, siteletThumb, mix, prng };
