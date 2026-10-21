import { bus, getJson } from './api.js';
import { describeModel, escapeHtml, ms, tokens, usd } from './format.js';

export const icons = {
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  tokens: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  brain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5.6V15a3 3 0 0 0 3 3h1m6-14a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5.6V15a3 3 0 0 1-3 3h-1M12 4v16"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.7 2.5 1.8-1 1.5-2.5 1.8-2.5.8-2.5 1.9 1 1.8 2.5 1.8 2.5-.8 2.5-1.8M12 6v1.7M12 16.3V18"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z"/></svg>',
};

// ---- toasts -------------------------------------------------------------------------------------------
export function toast(message, kind = 'info') {
  const host = document.querySelector('[data-cy=toasts]');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), 3800);
}

// ---- lightbox -----------------------------------------------------------------------------------------
export function openLightbox(src, alt) {
  const dialog = document.querySelector('[data-cy=lightbox]');
  const img = dialog.querySelector('img');
  img.src = src;
  img.alt = alt;
  dialog.showModal();
  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
}

export function emptyState({ title, text, icon = icons.inbox, cy = 'empty' }) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.dataset.cy = cy;
  el.innerHTML = `${icon}<h3>${escapeHtml(title)}</h3><p>${text}</p>`;
  return el;
}

// ---- model tags ---------------------------------------------------------------------------------------
const TAG_TITLES = {
  free: 'Runs on a free tier, so this account pays nothing. Cost shows what the same call would cost at list price.',
  beta: 'The provider marks this model as beta.',
};

/** Small labels from AI_MODEL_<NAME>_TAGS, e.g. Free. */
export function tagBadges(model) {
  return (model.tags ?? [])
    .map((t) => `<span class="tag tag-${escapeHtml(t)}" data-cy="tag-${escapeHtml(t)}" title="${escapeHtml(TAG_TITLES[t] ?? t)}">${escapeHtml(t.charAt(0).toUpperCase() + t.slice(1))}</span>`)
    .join('');
}

const isFree = (m) => (m.tags ?? []).includes('free');

// ---- model picker -------------------------------------------------------------------------------------
/**
 * A list of connected models with checkboxes. Selection comes from ?models=a,b in the URL, then the last
 * selection on this page, then the first model.
 */
export function modelPicker({ models, page, title = 'Models', note, onChange, cy = 'model-picker' }) {
  const fromUrl = new URLSearchParams(location.search).get('models')?.split(',').filter(Boolean);
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(`picker:${page}`) ?? 'null');
  } catch {
    stored = null;
  }
  const names = new Set(models.map((m) => m.name));
  let selected = (fromUrl ?? stored ?? []).filter((n) => names.has(n));
  if (!selected.length && models.length) selected = [models[0].name];

  // Same model id with different settings (for example thinking effort) is a variant; fold those away.
  const baseIds = new Set(models.filter((m) => !m.settings).map((m) => m.modelId));
  const isVariant = (m) => m.settings && baseIds.has(m.modelId);
  const item = (m) => `<li><label class="model" data-cy="model-option" data-model="${escapeHtml(m.name)}">
      <input type="checkbox" data-cy="model-toggle" value="${escapeHtml(m.name)}" ${selected.includes(m.name) ? 'checked' : ''}>
      <span class="name"><i class="dot" data-provider="${escapeHtml(m.provider)}"></i><span class="label">${escapeHtml(m.label ?? m.name)}</span></span>
      <span class="meta" title="${escapeHtml(`${m.name} · ${describeModel(m)}`)}">${tagBadges(m)}${escapeHtml(describeModel(m))}</span>
    </label></li>`;
  const variants = models.filter(isVariant);
  const el = document.createElement('aside');
  el.className = 'panel picker';
  el.dataset.cy = cy;
  el.innerHTML = `
    <div class="picker-head"><h2>${escapeHtml(title)}</h2><button type="button" class="link-button" data-cy="toggle-all"></button></div>
    <ul class="models">${models.filter((m) => !isVariant(m) && !isFree(m)).map(item).join('')}${
      models.some((m) => !isVariant(m) && isFree(m)) && models.some((m) => !isVariant(m) && !isFree(m))
        ? `<li class="group" data-cy="free-group">Free, to compare</li>`
        : ''
    }${models.filter((m) => !isVariant(m) && isFree(m)).map(item).join('')}</ul>
    ${
      variants.length
        ? `<details class="variants" data-cy="variants" ${variants.some((m) => selected.includes(m.name)) ? 'open' : ''}>
            <summary>Same model, different settings (${variants.length})</summary>
            <ul class="models">${variants.map(item).join('')}</ul>
          </details>`
        : ''
    }
    <p class="picker-foot">${note ?? `${models.length} connected. Pick one model, or several to compare them side by side.`}</p>`;

  const toggleAll = el.querySelector('[data-cy=toggle-all]');
  const boxes = () => [...el.querySelectorAll('input[type=checkbox]')];
  const read = () => boxes().filter((b) => b.checked).map((b) => b.value);
  const sync = () => {
    selected = read();
    toggleAll.textContent = selected.length === models.length ? 'Select none' : 'Select all';
    try {
      localStorage.setItem(`picker:${page}`, JSON.stringify(selected));
    } catch {
      /* storage can be blocked; the picker still works */
    }
    onChange?.(selected);
  };
  el.addEventListener('change', sync);
  toggleAll.addEventListener('click', () => {
    const all = selected.length !== models.length;
    for (const b of boxes()) b.checked = all;
    sync();
  });
  toggleAll.textContent = selected.length === models.length ? 'Select none' : 'Select all';
  return { el, selected: () => read(), models };
}

// ---- result cards -------------------------------------------------------------------------------------
/** One card per model. Shows a live timer while running, then the provider's latency, tokens and cost. */
export function resultCard(model, { kind = 'chat', cy = 'result' } = {}) {
  const el = document.createElement('article');
  el.className = 'panel result';
  el.dataset.cy = cy;
  el.dataset.model = model.name;
  el.dataset.kind = kind;
  el.innerHTML = `
    <header class="result-head">
      <i class="dot" data-provider="${escapeHtml(model.provider)}"></i><strong>${escapeHtml(model.label ?? model.name)}</strong>${tagBadges(model)}
      <span class="badges" data-cy="badges"></span>
      <span class="meta">${escapeHtml(describeModel(model))}</span>
    </header>
    <div class="result-body" data-cy="result-body"></div>
    <footer class="metrics">
      <span class="m" data-cy="latency" title="How long the model took to answer"><small>Time</small><span>–</span></span>
      <span class="m" data-cy="tokens" title="Tokens in: your prompt and instructions. Tokens out: what the model wrote."><small>Tokens in → out</small><span>–</span></span>
      <span class="m" data-cy="thinking" title="Tokens the model spent reasoning before it answered (already counted in tokens out)" hidden><small>Thinking</small><span></span></span>
      <span class="m" data-cy="cost" title="What this call would cost at the provider's list price. Free tiers cost $0."><small>Cost</small><span>–</span></span>
      <span class="actions"><button type="button" class="button small ghost" data-cy="retry">Retry</button></span>
    </footer>`;
  const body = el.querySelector('[data-cy=result-body]');
  const set = (name, text) => (el.querySelector(`[data-cy=${name}] span`).textContent = text);
  let timer;
  let result;

  return {
    el,
    body,
    model,
    get result() {
      return result;
    },
    start() {
      result = undefined;
      el.dataset.state = 'loading';
      el.querySelector('[data-cy=retry]').disabled = true;
      el.querySelector('[data-cy=badges]').innerHTML = '';
      const started = performance.now();
      const latency = el.querySelector('[data-cy=latency]');
      latency.classList.add('live');
      const tick = () => {
        set('latency', ms(performance.now() - started));
        timer = requestAnimationFrame(tick);
      };
      tick();
      for (const name of ['tokens', 'cost']) set(name, '…');
      el.querySelector('[data-cy=thinking]').hidden = true;
    },
    done(data) {
      cancelAnimationFrame(timer);
      result = data;
      el.querySelector('[data-cy=latency]').classList.remove('live');
      const v = data.vitals ?? {};
      set('latency', `${ms(v.latencyMs)}${v.latencySource === 'cassette' ? ' (replay)' : v.latencySource === 'stub' ? ' (stubbed)' : ''}`);
      el.querySelector('[data-cy=retry]').disabled = false;
      const counted = v.usage && (v.usage.inputTokens || v.usage.outputTokens);
      set('tokens', counted ? `${tokens(v.usage.inputTokens)} → ${tokens(v.usage.outputTokens)}` : '–');
      if (v.usage?.reasoningTokens) {
        el.querySelector('[data-cy=thinking]').hidden = false;
        set('thinking', `${tokens(v.usage.reasoningTokens)} thinking`);
      }
      set('cost', usd(v.costUsd));
      if (typeof v.costUsd === 'number') el.querySelector('[data-cy=cost]').title = `${usd(v.costUsd)} for this call, about ${usd(v.costUsd * 1000)} per 1,000 calls at list price.`;
      el.dataset.state = 'done';
    },
    fail(error) {
      cancelAnimationFrame(timer);
      result = { error };
      el.querySelector('[data-cy=retry]').disabled = false;
      el.querySelector('[data-cy=latency]').classList.remove('live');
      set('latency', '–');
      set('tokens', '–');
      set('cost', '–');
      body.innerHTML = `<p class="error-text" data-cy="error">${escapeHtml(error.message)}</p>`;
      el.dataset.state = 'error';
    },
    onRetry(fn) {
      el.querySelector('[data-cy=retry]').addEventListener('click', fn);
    },
  };
}

export function skeleton(lines = 3) {
  return `<div class="skeleton" aria-hidden="true">${'<span></span>'.repeat(lines)}</div>`;
}

/** Marks the fastest, cheapest and leanest finished cards, and fills the comparison bar. */
export function compareCards(cards, summaryEl) {
  for (const c of cards) c.el.querySelector('[data-cy=badges]').innerHTML = '';
  const done = cards.filter((c) => c.result && !c.result.error && c.result.vitals);
  if (done.length < 2) {
    summaryEl.hidden = true;
    summaryEl.innerHTML = '';
    return;
  }
  // A badge needs at least two cards reporting the number; zero tokens means "not reported", not "fewest".
  const pick = (score, positive = false) => {
    const known = done.filter((c) => typeof score(c) === 'number' && (!positive || score(c) > 0));
    return known.length < 2 ? undefined : known.sort((a, b) => score(a) - score(b))[0];
  };
  const fastest = pick((c) => c.result.vitals.latencyMs);
  const cheapest = pick((c) => c.result.vitals.costUsd);
  const leanest = pick((c) => c.result.vitals.usage?.totalTokens, true);
  const badge = (card, cls, text, cy) => {
    if (card) card.el.querySelector('[data-cy=badges]').insertAdjacentHTML('beforeend', `<span class="badge ${cls}" data-cy="${cy}">${text}</span>`);
  };
  badge(fastest, '', 'Fastest', 'badge-fastest');
  badge(cheapest, 'cost', 'Cheapest', 'badge-cheapest');
  badge(leanest, 'tokens', 'Fewest tokens', 'badge-leanest');
  const stat = (label, card, value) =>
    card ? `<span class="stat"><span class="label">${label}</span><strong>${escapeHtml(card.model.label ?? card.model.name)}</strong><b>${value}</b></span>` : '';
  summaryEl.innerHTML = [
    stat('Fastest', fastest, fastest && ms(fastest.result.vitals.latencyMs)),
    stat('Cheapest', cheapest, cheapest && usd(cheapest.result.vitals.costUsd)),
    stat('Fewest tokens', leanest, leanest && tokens(leanest.result.vitals.usage?.totalTokens)),
  ].join('');
  summaryEl.hidden = false;
}

/**
 * Runs `task(model, card)` for every selected model in parallel, one card each, then compares them.
 * Each card's Retry button re-runs just that model.
 */
export async function runAcross({ models, resultsEl, summaryEl, kind, cardCy, task, onSettled }) {
  resultsEl.innerHTML = '';
  summaryEl.hidden = true;
  const cards = models.map((m) => resultCard(m, { kind, cy: cardCy }));
  cards.forEach((card, i) => {
    card.el.style.animationDelay = `${i * 60}ms`;
    resultsEl.append(card.el);
  });
  const runOne = async (card) => {
    card.start();
    try {
      await task(card.model, card);
    } catch (err) {
      card.fail(err);
    }
    recordCall(kind, card);
  };
  const current = () => cards.every((c) => c.el.isConnected);
  const settle = () => {
    if (!current()) return;
    compareCards(cards, summaryEl);
    onSettled?.(cards);
  };
  for (const card of cards) {
    card.onRetry(async () => {
      await runOne(card);
      settle();
    });
  }
  await Promise.all(cards.map(runOne));
  settle();
  return cards;
}

// ---- this tab's AI Vitals ------------------------------------------------------------------------------
// Every call you run on a page is logged in this browser tab (sessionStorage), so the panel shows your runs only,
// not the server's whole history or the Cypress suite's calls.
const AREA_OF = { chat: 'text', image: 'image', speech: 'audio', transcribe: 'audio' };
const PALETTE = ['#4f5be8', '#3cc48f', '#f59e0b', '#8b5cf6', '#22b8cf', '#f25f5c', '#ec4899', '#84cc16'];
const logKey = (area) => `vitals-log:${area}`;

function readLog(area) {
  try {
    return JSON.parse(sessionStorage.getItem(logKey(area)) ?? '[]');
  } catch {
    return [];
  }
}

function writeLog(area, log) {
  try {
    sessionStorage.setItem(logKey(area), JSON.stringify(log.slice(-300)));
  } catch {
    /* storage can be blocked; the panel then shows only what is in memory */
  }
}

function recordCall(kind, card) {
  const area = AREA_OF[kind];
  if (!area || !card.result) return;
  const m = card.model;
  const v = card.result.vitals ?? {};
  const u = v.usage ?? {};
  const log = readLog(area);
  log.push({
    ts: Date.now(),
    name: m.name,
    label: m.label ?? m.name,
    provider: m.provider,
    modelId: m.modelId,
    tags: m.tags ?? [],
    ok: !card.result.error,
    latencyMs: card.result.error ? null : (v.latencyMs ?? null),
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    reasoningTokens: u.reasoningTokens ?? 0,
    costUsd: typeof v.costUsd === 'number' ? v.costUsd : null,
    error: card.result.error?.message ?? null,
  });
  writeLog(area, log);
  bus.dispatchEvent(new CustomEvent('vitals', { detail: { area } }));
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
}

/** One row per model, in the order the models were first run. */
function summarize(log) {
  const byName = new Map();
  for (const c of log) {
    if (!byName.has(c.name)) byName.set(c.name, { ...c, calls: [], color: PALETTE[byName.size % PALETTE.length] });
    byName.get(c.name).calls.push(c);
  }
  return [...byName.values()].map((r) => {
    const ok = r.calls.filter((c) => c.ok);
    const priced = ok.filter((c) => typeof c.costUsd === 'number');
    const n = Math.max(1, ok.length);
    return {
      ...r,
      count: r.calls.length,
      failed: r.calls.length - ok.length,
      p50: percentile(ok.map((c) => c.latencyMs).filter((x) => x !== null), 50),
      p95: percentile(ok.map((c) => c.latencyMs).filter((x) => x !== null), 95),
      avgIn: ok.reduce((s, c) => s + c.inputTokens, 0) / n,
      avgOut: ok.reduce((s, c) => s + c.outputTokens, 0) / n,
      avgThinking: ok.reduce((s, c) => s + c.reasoningTokens, 0) / n,
      per100: priced.length ? (priced.reduce((s, c) => s + c.costUsd, 0) / priced.length) * 100 : null,
      cost: priced.reduce((s, c) => s + c.costUsd, 0),
    };
  });
}

/** A live chart: every call as a dot, in the order it finished, by how long it took. */
function timeline(log, rows, width) {
  const done = log.filter((c) => c.ok && c.latencyMs !== null);
  if (!done.length) return '';
  // Drawn at the panel's real width, so text stays its normal size on any screen.
  const W = Math.max(300, Math.round(width));
  const H = 200;
  const pad = { l: 52, r: 16, t: 14, b: 30 };
  const maxY = Math.max(...done.map((c) => c.latencyMs)) * 1.15 || 1;
  const inset = 18; // keeps the first and last dots clear of the axis labels and the edge
  const x = (i) => pad.l + inset + (done.length === 1 ? (W - pad.l - pad.r - 2 * inset) / 2 : (i / (done.length - 1)) * (W - pad.l - pad.r - 2 * inset));
  const y = (v) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const color = Object.fromEntries(rows.map((r) => [r.name, r.color]));
  const ticks = [0, maxY / 2, maxY].map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${escapeHtml(ms(v))}</text>`);
  const dots = done.map(
    (c, i) =>
      `<circle cx="${x(i)}" cy="${y(c.latencyMs)}" r="6" fill="${color[c.name]}" class="dot${i === done.length - 1 ? ' latest' : ''}" style="animation-delay:${Math.min(i, 20) * 25}ms"><title>${escapeHtml(`${c.label}: ${ms(c.latencyMs)}, ${usd(c.costUsd)}`)}</title></circle>`,
  );
  return `<figure class="vitals-chart" data-cy="tab-vitals-chart">
      <figcaption>Time per call, in the order they finished</figcaption>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Time per call">${ticks.join('')}<line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" class="axis"/><text x="${(W + pad.l) / 2}" y="${H - 8}" text-anchor="middle" class="tick">calls →</text>${dots.join('')}</svg>
      <div class="chart-legend">${rows.map((r) => `<span><i style="background:${r.color}"></i>${escapeHtml(r.label)}</span>`).join('')}</div>
    </figure>`;
}

/**
 * Analytics for one page (chat, image or audio): your calls in this tab, per model, with a live chart, plus links to
 * the latest Cypress reports for the matching spec folder. Open by default; Reset clears this page's log.
 */
export function tabVitals({ area, title }) {
  const openKey = `vitals-open-v2:${area}`;
  const el = document.createElement('details');
  el.className = 'panel tab-vitals';
  el.dataset.cy = 'tab-vitals';
  try {
    el.open = localStorage.getItem(openKey) !== '0';
  } catch {
    el.open = true;
  }
  el.addEventListener('toggle', () => {
    try {
      localStorage.setItem(openKey, el.open ? '1' : '0');
    } catch {}
  });
  el.innerHTML = `
    <summary data-cy="tab-vitals-toggle">
      <span class="chevron" aria-hidden="true"></span>
      <span class="summary-text"><h2>${escapeHtml(title)}</h2><span class="summary-stats" data-cy="tab-vitals-summary">No calls yet</span></span>
      <span class="vitals-actions">
        <button type="button" class="button small ghost" data-cy="vitals-refresh" title="Redraw from this tab's calls and reload the report list">Refresh</button>
        <button type="button" class="button small ghost" data-cy="vitals-reset" title="Clear this page's analytics">Reset</button>
        <a class="button small" href="/vitals" data-link>All reports</a>
      </span>
    </summary>
    <div class="vitals-body">
      <div class="vitals-kpis" data-cy="tab-vitals-kpis"></div>
      <div data-cy="tab-vitals-visual"></div>
      <div class="table-wrap" data-cy="tab-vitals-table"></div>
      <p class="legend"><b>Median</b>: half the calls were faster. <b>p95</b>: 95 of every 100 calls were faster, so it shows the slow tail. <b>Cost</b> is at list price; models tagged Free cost this account nothing.</p>
      <div data-cy="tab-reports"></div>
    </div>`;
  const $ = (cy) => el.querySelector(`[data-cy=${cy}]`);

  function draw() {
    const log = readLog(area);
    const rows = summarize(log);
    const failed = log.filter((c) => !c.ok).length;
    $('tab-vitals-summary').innerHTML = log.length
      ? `${log.length} call${log.length === 1 ? '' : 's'} · ${rows.length} model${rows.length === 1 ? '' : 's'}${failed ? ` · <span class="err">${failed} failed</span>` : ''}`
      : 'No calls yet';
    if (!log.length) {
      $('tab-vitals-kpis').innerHTML = '';
      $('tab-vitals-visual').innerHTML = '';
      $('tab-vitals-table').replaceChildren(emptyState({ title: 'No calls yet', text: 'Pick models above and run a prompt. Each model you run gets a row here, with a live chart of every call.' }));
      return;
    }
    const ok = log.filter((c) => c.ok);
    const fastest = rows.filter((r) => r.p50 !== null).sort((a, b) => a.p50 - b.p50)[0];
    const kpi = (label, value, note, cy) => `<div class="vk" data-cy="${cy}"><span class="label">${label}</span><b>${value}</b><span class="note">${note}</span></div>`;
    $('tab-vitals-kpis').innerHTML = [
      kpi('Calls', log.length, failed ? `${failed} failed` : 'all succeeded', 'vk-calls'),
      kpi('Tokens', tokens(ok.reduce((s, c) => s + c.inputTokens + c.outputTokens, 0)), `${tokens(ok.reduce((s, c) => s + c.reasoningTokens, 0))} spent thinking`, 'vk-tokens'),
      kpi('Cost', usd(rows.reduce((s, r) => s + r.cost, 0)), 'at list price', 'vk-cost'),
      kpi('Fastest', fastest ? escapeHtml(fastest.label) : '–', fastest ? `median ${ms(fastest.p50)}` : '', 'vk-fastest'),
    ].join('');
    $('tab-vitals-visual').innerHTML = timeline(log, rows, $('tab-vitals-visual').clientWidth - 30);
    const maxP50 = Math.max(...rows.map((r) => r.p50 ?? 0)) || 1;
    const maxCost = Math.max(...rows.map((r) => r.per100 ?? 0)) || 1;
    $('tab-vitals-table').innerHTML = `<table><thead><tr><th>Model</th><th>Calls</th><th>Median time</th><th>p95</th><th>Avg tokens in → out</th><th>Avg thinking</th><th>Cost per 100 calls</th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr data-cy="tab-vitals-row" data-model="${escapeHtml(r.name)}">
        <td><i class="swatch" style="background:${r.color}"></i><b>${escapeHtml(r.label)}</b>${tagBadges(r)}<br><small>${escapeHtml([r.provider, r.modelId].filter(Boolean).join(' · '))}</small></td>
        <td>${r.count}${r.failed ? ` <span class="err">(${r.failed} failed)</span>` : ''}</td>
        <td>${ms(r.p50 ?? undefined)}<i class="spark" style="width:${Math.round(((r.p50 ?? 0) / maxP50) * 60)}px"></i></td>
        <td>${ms(r.p95 ?? undefined)}</td>
        <td>${r.avgIn || r.avgOut ? `${tokens(Math.round(r.avgIn))} → ${tokens(Math.round(r.avgOut))}` : '–'}</td>
        <td>${r.avgThinking ? tokens(Math.round(r.avgThinking)) : '–'}</td>
        <td>${usd(r.per100)}<i class="spark cost" style="width:${Math.round(((r.per100 ?? 0) / maxCost) * 60)}px"></i></td></tr>`,
      )
      .join('')}</tbody></table>`;
  }

  async function loadReports() {
    const saved = await getJson('/api/reports');
    const mine = saved.specs.filter((s) => s.spec.startsWith(`${area}/`));
    $('tab-reports').innerHTML = mine.length
      ? `<h3>Cypress reports for ${escapeHtml(area)}</h3><ul class="reports">${mine
          .map((s) => `<li data-cy="report-link"><a href="${escapeHtml(s.latest)}" target="_blank" rel="noopener">${escapeHtml(s.spec)}</a><span class="runs">${s.runs} run${s.runs === 1 ? '' : 's'}</span></li>`)
          .join('')}</ul>`
      : `<p class="legend">No Cypress reports for ${escapeHtml(area)} yet. Run <code>npm run test:${escapeHtml(area)}</code>.</p>`;
  }

  $('vitals-refresh').addEventListener('click', async (e) => {
    e.preventDefault();
    const button = e.currentTarget;
    button.classList.add('spinning');
    draw();
    await loadReports().catch(() => {});
    setTimeout(() => button.classList.remove('spinning'), 400);
  });
  $('vitals-reset').addEventListener('click', (e) => {
    e.preventDefault();
    writeLog(area, []);
    draw();
    toast('AI Vitals for this page cleared.');
  });
  const onVitals = (e) => {
    if (e.detail?.area === area) draw();
  };
  bus.addEventListener('vitals', onVitals);
  // Redraw when the panel changes width (window resize, panel opened), so the chart always fits.
  let lastWidth = 0;
  const resize = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width && Math.abs(width - lastWidth) > 8) {
      lastWidth = width;
      draw();
    }
  });
  resize.observe($('tab-vitals-visual'));
  draw();
  loadReports().catch(() => {});
  return {
    el,
    dispose: () => {
      bus.removeEventListener('vitals', onVitals);
      resize.disconnect();
    },
  };
}
