import { getJson } from '../api.js';
import { emptyState, tagBadges, toast } from '../components.js';
import { escapeHtml, ms, tokens, usd } from '../format.js';

function bars(rows, { value, label, cls = '', format }) {
  const data = rows.filter((r) => typeof value(r) === 'number');
  if (!data.length) return '<p class="picker-foot">Nothing to chart yet.</p>';
  const max = Math.max(...data.map(value)) || 1;
  const rowH = 30;
  const labelW = 150;
  const width = 560;
  const barW = width - labelW - 90;
  return `<svg viewBox="0 0 ${width} ${data.length * rowH + 4}" role="img" aria-label="${escapeHtml(label)}">
    ${data
      .map((r, i) => {
        const w = Math.max(2, (value(r) / max) * barW);
        const y = i * rowH;
        return `<text class="name" x="0" y="${y + 19}">${escapeHtml(r.name)}</text>
          <rect class="bar ${cls}" x="${labelW}" y="${y + 6}" width="${w}" height="18" rx="5" style="animation-delay:${i * 70}ms"></rect>
          <text x="${labelW + w + 8}" y="${y + 19}">${escapeHtml(format(value(r)))}</text>`;
      })
      .join('')}
  </svg>`;
}

const shorten = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export async function render(view) {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Reports</h1><p>All of today's model calls across chat, image and audio, and every report your Cypress runs saved. Each page also has its own AI Vitals panel.</p></div>
      <div class="composer-row">
        <button type="button" class="button" data-cy="refresh">Refresh</button>
        <button type="button" class="button" data-cy="reset-session">Reset session</button>
      </div>
    </div>
    <section class="kpis" data-cy="kpis"></section>
    <section class="grid-2">
      <div class="panel chart" data-cy="latency-chart"><h3>Median latency per model</h3><div></div></div>
      <div class="panel chart" data-cy="cost-chart"><h3>Cost per call at list price</h3><div></div></div>
    </section>
    <section class="panel block" data-cy="model-table"><h3>Per model</h3><div class="table-wrap"></div></section>
    <section class="grid-2">
      <div class="panel block" data-cy="reports"><h3>Cypress reports</h3><div></div></div>
      <div class="panel block" data-cy="recent"><h3>Recent calls</h3><div class="table-wrap"></div></div>
    </section>`;

  const kpis = view.querySelector('[data-cy=kpis]');
  const latencyChart = view.querySelector('[data-cy=latency-chart] div');
  const costChart = view.querySelector('[data-cy=cost-chart] div');
  const table = view.querySelector('[data-cy=model-table] .table-wrap');
  const reports = view.querySelector('[data-cy=reports] div');
  const recent = view.querySelector('[data-cy=recent] .table-wrap');

  async function refresh() {
    const [vitals, saved] = await Promise.all([getJson('/api/vitals'), getJson('/api/reports')]);
    const m = vitals.models;
    const sum = (f) => m.reduce((s, r) => s + (f(r) ?? 0), 0);
    const priced = m.filter((r) => typeof r.costUsd === 'number');
    const latencies = m.map((r) => r.p50LatencyMs).filter((v) => typeof v === 'number');
    const kpi = (label, value, note, cy) => `<div class="panel kpi" data-cy="${cy}"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`;
    kpis.innerHTML = [
      kpi('Model calls', vitals.calls, `${sum((r) => r.errors)} failed`, 'kpi-calls'),
      kpi('Tokens', tokens(sum((r) => r.inputTokens) + sum((r) => r.outputTokens)), `${tokens(sum((r) => r.reasoningTokens))} spent thinking`, 'kpi-tokens'),
      kpi('Cost', usd(m.length ? (priced.length ? priced.reduce((s, r) => s + r.costUsd, 0) : null) : 0), priced.length < m.length ? 'some models have no price set' : 'at list price', 'kpi-cost'),
      kpi('Median latency', latencies.length ? ms(latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)]) : '–', `${m.length} models used`, 'kpi-latency'),
    ].join('');

    if (!m.length) {
      for (const el of [latencyChart, costChart, table]) el.replaceChildren(emptyState({ title: 'No calls yet', text: 'Use the Chat, Image or Audio pages, or run the Cypress tests. Numbers appear here as calls finish.' }));
    } else {
      latencyChart.innerHTML = bars(m, { value: (r) => r.p50LatencyMs, label: 'Median latency per model', format: ms });
      costChart.innerHTML = bars(m, { value: (r) => (typeof r.costUsd === 'number' && r.pricedCalls ? r.costUsd / r.pricedCalls : null), label: 'Cost per call', cls: 'cost', format: usd });
      table.innerHTML = `<table><thead><tr><th>Model</th><th>Type</th><th>Calls</th><th>Failed</th><th>p50</th><th>p95</th><th>Tokens in / out</th><th>Thinking</th><th>Cost</th></tr></thead><tbody>${m
        .map(
          (r, i) => `<tr style="animation-delay:${i * 40}ms" data-cy="model-row" data-model="${escapeHtml(r.name)}">
            <td><b>${escapeHtml(r.label ?? r.name)}</b>${tagBadges(r)}<br><small>${escapeHtml([r.provider, r.modelId].filter(Boolean).join(' · '))}</small></td>
            <td><span class="pill">${escapeHtml(r.modality)}</span></td><td>${r.calls}</td><td class="${r.errors ? 'err' : ''}">${r.errors}</td>
            <td>${ms(r.p50LatencyMs)}</td><td>${ms(r.p95LatencyMs)}</td><td>${r.inputTokens || r.outputTokens ? `${tokens(r.inputTokens)} / ${tokens(r.outputTokens)}` : '–'}</td>
            <td>${r.reasoningTokens ? tokens(r.reasoningTokens) : '–'}</td><td>${usd(r.costUsd)}</td></tr>`,
        )
        .join('')}</tbody></table>`;
    }

    recent.innerHTML = vitals.recent.length
      ? `<table><thead><tr><th>Time</th><th>Model</th><th>Result</th></tr></thead><tbody>${vitals.recent
          .map(
            (c) => `<tr><td>${new Date(c.ts).toLocaleTimeString()}</td><td>${escapeHtml(c.model)}</td><td class="${c.ok ? 'ok' : 'err'}">${
              c.ok ? `${ms(c.latencyMs)} · ${usd(c.costUsd)}` : `<span title="${escapeHtml(c.error ?? 'failed')}">${escapeHtml(shorten(c.error ?? 'failed', 80))}</span>`
            }</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="picker-foot">No calls yet.</p>';

    reports.innerHTML = saved.specs.length
      ? `<ul class="reports">${saved.specs
          .map(
            (s) => `<li data-cy="report-link"><a href="${escapeHtml(s.latest)}" target="_blank" rel="noopener">${escapeHtml(s.spec)}</a><span class="runs">${s.runs} run${s.runs === 1 ? '' : 's'} · ${new Date(s.updated).toLocaleString()}</span></li>`,
          )
          .join('')}</ul>
        <p class="picker-foot">${saved.index ? `<a href="${saved.index}" target="_blank" rel="noopener">All reports and history</a>` : ''}${saved.run ? ` · <a href="${saved.run}" target="_blank" rel="noopener">Whole-run report</a>` : ''}</p>`
      : '';
    if (!saved.specs.length) {
      reports.replaceChildren(emptyState({ title: 'No Cypress reports yet', text: 'Run the tests with <code>npm test</code>. Each spec saves an HTML report here as soon as it finishes.' }));
    }
  }

  view.querySelector('[data-cy=refresh]').addEventListener('click', refresh);
  view.querySelector('[data-cy=reset-session]').addEventListener('click', async () => {
    await fetch('/api/vitals/reset', { method: 'POST' });
    toast('Session cleared.');
    window.dispatchEvent(new Event('session-reset'));
    refresh();
  });
  await refresh();
  const timer = setInterval(() => {
    if (!document.hidden) refresh().catch(() => {});
  }, 5000);
  return () => clearInterval(timer);
}
