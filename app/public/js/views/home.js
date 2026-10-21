import { getJson } from '../api.js';
import { Monitor } from '../monitor.js';
import { escapeHtml, ms, usd } from '../format.js';

const PAGES = [
  { path: '/chat', kind: 'chat', title: 'Chat', text: 'Ask one question to several language models and compare the answers.' },
  { path: '/image', kind: 'image', title: 'Image', text: 'Generate the same picture with different image models, side by side.' },
  { path: '/audio', kind: ['speech', 'transcribe'], title: 'Audio', text: 'Turn text into speech with several voices, then transcribe it back.' },
];

export async function render(view, { models, monitors }) {
  const vitals = await getJson('/api/vitals').catch(() => ({ calls: 0, models: [] }));
  const providers = (kinds) => [...new Set(models.filter((m) => [].concat(kinds).includes(m.modality)).map((m) => m.provider))];
  const count = (kinds) => models.filter((m) => [].concat(kinds).includes(m.modality)).length;
  const fastest = [...vitals.models].filter((m) => m.p50LatencyMs).sort((a, b) => a.p50LatencyMs - b.p50LatencyMs)[0];
  view.innerHTML = `
    <section class="hero">
      <div>
        <h1>A small AI product, tested like a real one.</h1>
        <p>Chat, image and voice features backed by ${models.length} real models. The Cypress tests beside it check meaning, brand and speech, and measure the tokens, time and cost of every call.</p>
        <div class="actions">
          <a class="button primary" href="/chat" data-link data-cy="cta-chat">Try the chat</a>
          <a class="button" href="/vitals" data-link data-cy="cta-vitals">See the reports</a>
        </div>
      </div>
      <div class="panel monitor" aria-label="Session vitals">
        <div class="monitor-head"><span class="live-dot"></span>live · every spike is a real model call</div>
        <canvas class="trace" data-cy="hero-monitor" aria-hidden="true"></canvas>
        <div class="row"><span>model calls this session</span><b>${vitals.calls}</b></div>
        <div class="row"><span>fastest model (median)</span><b>${fastest ? `${escapeHtml(fastest.name)} · ${ms(fastest.p50LatencyMs)}` : '–'}</b></div>
        <div class="row"><span>models connected</span><b>${models.length}</b></div>
        <div class="row"><span>cost so far</span><b>${usd(vitals.models.filter((m) => typeof m.costUsd === 'number').reduce((s, m) => s + m.costUsd, 0))}</b></div>
      </div>
    </section>
    <section class="tiles">
      ${PAGES.map(
        (p) => `<a class="panel tile" href="${p.path}" data-link data-cy="tile-${p.title.toLowerCase()}">
          <h3>${p.title}</h3><p>${p.text}</p>
          <span class="providers">${providers(p.kind)
            .map((pr) => `<i class="dot" data-provider="${escapeHtml(pr)}"></i>${escapeHtml(pr)}`)
            .join(' ')} · ${count(p.kind)} models</span>
        </a>`,
      ).join('')}
    </section>
    <section class="how">
      <pre><code>cy.visit('/chat');
cy.get('[data-cy=question]').type('What is the capital of the USA?');
cy.get('[data-cy=ask]').click();

cy.get('[data-cy=answer][data-state=done]').aiAssert({
  means: 'Washington, D.C. is the capital of the United States.',
  mustMention: ['Washington'],
  groundedIn: { fixture: 'golden/usa.md' },
});</code></pre>
      <ol>
        <li><b>Use the app like a person would.</b> Cypress types the question and clicks Ask.</li>
        <li><b>Check what the answer means.</b> <code>aiAssert</code> scores meaning, key facts and grounding with small models that run locally.</li>
        <li><b>Measure every call.</b> Tokens, thinking, latency and cost show up in the Cypress runner and in a report per spec.</li>
        <li><b>Compare models.</b> Pick several models on any page, or run <code>cy.aiCompare</code> to rank them on the numbers.</li>
      </ol>
    </section>`;

  const monitor = new Monitor(view.querySelector('[data-cy=hero-monitor]'), { labels: true, speed: 70 });
  // Replay the last few calls so the trace is never empty on a fresh visit.
  for (const c of (vitals.recent ?? []).slice(0, 4).reverse()) {
    monitor.events.push({ at: monitor.w * (0.2 + Math.random() * 0.5), strength: 0.6, label: c.model, ok: c.ok, latencyMs: c.latencyMs });
  }
  monitors.add(monitor);

  for (const tile of view.querySelectorAll('.tile')) {
    tile.addEventListener('pointermove', (e) => {
      const r = tile.getBoundingClientRect();
      tile.style.setProperty('--mx', `${e.clientX - r.left}px`);
      tile.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
  return () => {
    monitor.stop();
    monitors.delete(monitor);
  };
}
