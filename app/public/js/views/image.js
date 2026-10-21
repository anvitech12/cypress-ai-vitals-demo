import { postJson } from '../api.js';
import { emptyState, modelPicker, tabVitals, openLightbox, runAcross, toast } from '../components.js';
import { escapeHtml } from '../format.js';

const EXAMPLES = [
  'A friendly orange fox mascot riding a skateboard, flat vector illustration, plain light background',
  'Three cats sitting on a grey sofa, photograph',
  'A lighthouse on a cliff at dusk, watercolor',
  'An isometric illustration of a tiny data center, soft pastel colours',
];

export async function render(view, { models }) {
  const imageModels = models.filter((m) => m.modality === 'image');
  view.innerHTML = `
    <div class="page-head"><div>
      <h1>Image</h1>
      <p>One prompt, one picture per model. Compare style, detail and brand fit, and see how long each image took and what it would cost.</p>
    </div></div>
    <section class="lab"></section>`;
  const lab = view.querySelector('.lab');
  const picker = modelPicker({ models: imageModels, page: 'image' });
  lab.append(picker.el);

  const bench = document.createElement('div');
  bench.className = 'workbench';
  bench.innerHTML = `
    <form class="panel composer" data-cy="composer">
      <label class="field" for="image-prompt">Describe the image
        <textarea id="image-prompt" data-cy="image-prompt" rows="3">${escapeHtml(EXAMPLES[0])}</textarea>
      </label>
      <div class="chips" data-cy="examples">${EXAMPLES.map((e) => `<button type="button" class="chip" data-example="${escapeHtml(e)}">${escapeHtml(e.split(',')[0])}</button>`).join('')}</div>
      <div class="composer-row">
        <span class="spacer"></span>
        <button type="button" class="button ghost" data-cy="clear">Clear results</button>
        <button type="submit" class="button primary" data-cy="generate">Generate <kbd>⌘↵</kbd></button>
      </div>
    </form>
    <div class="compare" data-cy="compare-summary" hidden></div>
    <div class="results media" data-cy="results"></div>`;
  lab.append(bench);
  const vitals = tabVitals({ modalities: ['image'], area: 'image', title: 'AI Vitals for images' });
  view.append(vitals.el);

  const form = bench.querySelector('form');
  const prompt = bench.querySelector('[data-cy=image-prompt]');
  const resultsEl = bench.querySelector('[data-cy=results]');
  const summaryEl = bench.querySelector('[data-cy=compare-summary]');
  const button = bench.querySelector('[data-cy=generate]');
  const showEmpty = () =>
    resultsEl.replaceChildren(emptyState({ title: 'No images yet', text: 'Pick image models on the left and press <b>Generate</b>. Click any image to see it full size.' }));
  showEmpty();

  bench.querySelector('[data-cy=examples]').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-example]');
    if (chip) prompt.value = chip.dataset.example;
  });
  bench.querySelector('[data-cy=clear]').addEventListener('click', () => {
    summaryEl.hidden = true;
    showEmpty();
  });
  prompt.addEventListener('keydown', (e) => {
    // The button is disabled while a run is in progress; the shortcut must not start a second, paid run.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !form.querySelector('[type=submit]')?.disabled) form.requestSubmit();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosen = imageModels.filter((m) => picker.selected().includes(m.name));
    if (!chosen.length) return toast('Pick at least one image model first.', 'error');
    button.disabled = true;
    await runAcross({
      models: chosen,
      resultsEl,
      summaryEl,
      kind: 'image',
      task: async (model, card) => {
        card.body.innerHTML = `<div class="frame"><div class="skeleton-block"></div><img data-cy="image" alt="" data-state="loading"></div>`;
        const img = card.body.querySelector('[data-cy=image]');
        const data = await postJson('/api/image', { prompt: prompt.value, model: model.name });
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('The image did not load.'));
          img.alt = `${model.name}: ${prompt.value}`;
          img.src = data.url;
        });
        card.body.querySelector('.skeleton-block')?.remove();
        requestAnimationFrame(() => img.classList.add('loaded'));
        img.dataset.state = 'done';
        img.addEventListener('click', () => openLightbox(img.src, img.alt));
        card.done(data);
      },
    });
    button.disabled = false;
  });

  return vitals.dispose;
}
