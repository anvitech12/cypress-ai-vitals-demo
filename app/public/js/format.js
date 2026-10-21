export const ms = (v) => (v === null || v === undefined ? '–' : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} s` : `${Math.round(v)} ms`);
export const tokens = (v) => (v === null || v === undefined ? '–' : v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(v));
export const usd = (v) => (v === null || v === undefined ? 'n/a' : v === 0 ? '$0' : v < 0.001 ? `$${v.toFixed(6)}` : v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
export const pct = (v) => `${Math.round(v * 100)}%`;

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function describeModel(m) {
  return [m.provider, m.modelId, m.settings].filter(Boolean).join(' · ');
}

const norm = (t) =>
  String(t ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Word error rate plus which hypothesis words differ from the reference, for highlighting. */
export function wordErrors(reference, hypothesis) {
  const ref = norm(reference);
  const hyp = norm(hypothesis);
  const d = Array.from({ length: ref.length + 1 }, (_, i) => Array.from({ length: hyp.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
  }
  const wrong = new Set();
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 && j > 0) {
    if (ref[i - 1] === hyp[j - 1]) {
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j - 1] + 1) {
      wrong.add(j - 1);
      i--;
      j--;
    } else if (d[i][j] === d[i][j - 1] + 1) {
      wrong.add(j - 1);
      j--;
    } else {
      i--;
    }
  }
  while (j > 0) wrong.add(--j);
  return { wer: ref.length ? d[ref.length][hyp.length] / ref.length : 0, words: hyp, wrong };
}
