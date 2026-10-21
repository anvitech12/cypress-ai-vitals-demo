import { postJson } from '../api.js';
import { emptyState, modelPicker, tabVitals, runAcross, toast } from '../components.js';
import { escapeHtml, pct, wordErrors } from '../format.js';

const DEFAULT_TEXT = 'Your order ships tomorrow morning. Thank you for testing with Cypress.';
const CHROME = { name: 'chrome-on-device', label: 'Chrome (on-device)', tags: ['free'], provider: 'chrome', modelId: 'Web Speech API in this browser', modality: 'transcribe', settings: null, browser: true };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function bars() {
  return `<div class="bars" aria-hidden="true">${'<i></i>'.repeat(18)}</div>`;
}

/** Shows the transcript with words that differ from the original highlighted, plus the word error rate. */
function showTranscript(card, original, text) {
  const { wer, words, wrong } = wordErrors(original, text);
  const marked = words.map((w, i) => (wrong.has(i) ? `<span class="bad-word">${escapeHtml(w)}</span>` : escapeHtml(w))).join(' ');
  card.body.innerHTML = `
    <p class="transcript" data-cy="transcript" data-state="done">${marked || '<em>(nothing heard)</em>'}</p>
    <p>Word error rate <span class="wer ${wer <= 0.15 ? 'ok' : 'err'}" data-cy="wer">${pct(wer)}</span></p>`;
  card.body.querySelector('[data-cy=transcript]').dataset.text = text;
}

/** Must start inside the click handler: installing the on-device language pack needs a user gesture. */
async function prepareChrome() {
  if (!SR?.available) return 'unavailable';
  const options = { langs: ['en-US'], processLocally: true };
  let status = await SR.available(options);
  if (status === 'downloadable' || status === 'downloading') status = (await SR.install(options)) ? 'available' : status;
  return status;
}

/** Plays the clip into Chrome's speech recognition and resolves with what it heard. Rejects on errors, or if it never ends. */
async function listenWithChrome(clipUrl, local, onText) {
  const blob = await (await fetch(clipUrl)).blob();
  const audio = new Audio(URL.createObjectURL(blob));
  await new Promise((resolve, reject) => {
    audio.addEventListener('canplay', resolve, { once: true });
    audio.addEventListener('error', () => reject(new Error('The clip could not be loaded.')), { once: true });
  });
  const track = audio.captureStream().getAudioTracks()[0];
  const rec = new SR();
  Object.assign(rec, { lang: 'en-US', continuous: true, interimResults: true });
  if (local) rec.processLocally = true;
  return new Promise((resolve, reject) => {
    let text = '';
    const seconds = Number.isFinite(audio.duration) ? audio.duration : 30;
    const limit = setTimeout(() => {
      rec.abort();
      reject(new Error('Chrome speech recognition did not finish in time.'));
    }, (seconds + 30) * 1000);
    rec.onresult = (e) => {
      text = [...e.results].map((r) => r[0].transcript).join(' ').trim();
      onText(text);
    };
    rec.onerror = (e) => {
      clearTimeout(limit);
      reject(new Error(`Chrome speech recognition: ${e.error}`));
    };
    rec.onend = () => {
      clearTimeout(limit);
      resolve(text);
    };
    audio.addEventListener('ended', () => setTimeout(() => rec.stop(), 1500), { once: true });
    audio
      .play()
      .then(() => rec.start(track.clone()))
      .catch((err) => {
        clearTimeout(limit);
        reject(err);
      });
  });
}

export async function render(view, { models }) {
  const voices = models.filter((m) => m.modality === 'speech');
  const listeners = [...models.filter((m) => m.modality === 'transcribe'), ...(SR ? [CHROME] : [])];
  view.innerHTML = `
    <div class="page-head"><div>
      <h1>Audio</h1>
      <p>Pick voices to read your sentence aloud, then pick listeners to write it back down. Every transcript is scored against what you typed, word by word.</p>
    </div></div>
    <section class="lab"><div class="rail" style="display:grid;gap:16px;align-content:start"></div></section>`;
  const lab = view.querySelector('.lab');
  const rail = lab.querySelector('.rail');
  const voicePicker = modelPicker({ models: voices, page: 'audio-voices', title: 'Voices', cy: 'voice-picker', note: `${voices.length} text-to-speech models connected.` });
  const listenerPicker = modelPicker({
    models: listeners,
    page: 'audio-listeners',
    title: 'Listeners',
    cy: 'listener-picker',
    note: 'Speech-to-text engines. chrome-on-device listens to the clip live in this browser.',
  });
  rail.append(voicePicker.el, listenerPicker.el);
  voicePicker.el.style.position = 'static';
  listenerPicker.el.style.position = 'static';

  const bench = document.createElement('div');
  bench.className = 'workbench';
  bench.innerHTML = `
    <form class="panel composer" data-cy="speak-form">
      <label class="field" for="speech-text">What should the voices say?
        <textarea id="speech-text" data-cy="speech-text" rows="2">${escapeHtml(DEFAULT_TEXT)}</textarea>
      </label>
      <div class="composer-row"><span class="spacer"></span>
        <button type="button" class="button ghost" data-cy="clear">Clear results</button>
        <button type="submit" class="button primary" data-cy="speak">Speak <kbd>⌘↵</kbd></button>
      </div>
    </form>
    <div class="compare" data-cy="compare-summary" hidden></div>
    <div class="results media" data-cy="results"></div>
    <div class="section-title"><h2>Listen back</h2><span>Transcribe one of the clips with every listener you picked.</span></div>
    <form class="panel composer" data-cy="listen-form">
      <div class="composer-row">
        <label class="field" for="clip-select">Clip
          <select id="clip-select" data-cy="clip-select" disabled><option value="">Speak first</option></select>
        </label>
        <span class="spacer"></span>
        <button type="submit" class="button primary" data-cy="transcribe" disabled>Transcribe</button>
      </div>
    </form>
    <div class="compare" data-cy="transcript-summary" hidden></div>
    <div class="results" data-cy="transcripts"></div>`;
  lab.append(bench);
  const vitals = tabVitals({ modalities: ['speech', 'transcribe'], area: 'audio', title: 'AI Vitals for audio' });
  view.append(vitals.el);

  const speakForm = bench.querySelector('[data-cy=speak-form]');
  const text = bench.querySelector('[data-cy=speech-text]');
  const resultsEl = bench.querySelector('[data-cy=results]');
  const summaryEl = bench.querySelector('[data-cy=compare-summary]');
  const clipSelect = bench.querySelector('[data-cy=clip-select]');
  const transcribeButton = bench.querySelector('[data-cy=transcribe]');
  const transcriptsEl = bench.querySelector('[data-cy=transcripts]');
  const transcriptSummary = bench.querySelector('[data-cy=transcript-summary]');
  let spokenText = text.value;

  const showEmpty = () => {
    resultsEl.replaceChildren(emptyState({ title: 'No clips yet', text: 'Pick voices on the left and press <b>Speak</b>. Then transcribe a clip to see how well each listener heard it.' }));
    transcriptsEl.replaceChildren();
    clipSelect.innerHTML = '<option value="">Speak first</option>';
    clipSelect.disabled = true;
    transcribeButton.disabled = true;
  };
  showEmpty();
  bench.querySelector('[data-cy=clear]').addEventListener('click', () => {
    summaryEl.hidden = true;
    transcriptSummary.hidden = true;
    showEmpty();
  });
  text.addEventListener('keydown', (e) => {
    // The button is disabled while a run is in progress; the shortcut must not start a second, paid run.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !speakForm.querySelector('[type=submit]')?.disabled) speakForm.requestSubmit();
  });

  const refreshClips = (cards) => {
    const ready = cards.filter((c) => c.result?.url);
    clipSelect.innerHTML = ready.map((c) => `<option value="${escapeHtml(c.result.url)}">${escapeHtml(c.model.name)}</option>`).join('') || '<option value="">No clips</option>';
    clipSelect.disabled = !ready.length;
    transcribeButton.disabled = !ready.length;
  };

  speakForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosen = voices.filter((m) => voicePicker.selected().includes(m.name));
    if (!chosen.length) return toast('Pick at least one voice first.', 'error');
    spokenText = text.value;
    bench.querySelector('[data-cy=speak]').disabled = true;
    transcriptsEl.replaceChildren();
    transcriptSummary.hidden = true;
    await runAcross({
      models: chosen,
      resultsEl,
      summaryEl,
      kind: 'speech',
      task: async (model, card) => {
        card.body.innerHTML = `<div class="voice">${bars()}<audio data-cy="speech" controls preload="auto" data-state="loading"></audio><small data-cy="duration"></small></div>`;
        const data = await postJson('/api/speak', { text: spokenText, model: model.name });
        const audio = card.body.querySelector('[data-cy=speech]');
        audio.src = data.url;
        audio.dataset.src = data.url;
        await new Promise((resolve) => {
          audio.addEventListener('loadedmetadata', resolve, { once: true });
          audio.addEventListener('error', resolve, { once: true });
        });
        card.body.querySelector('[data-cy=duration]').textContent = Number.isFinite(audio.duration) ? `${audio.duration.toFixed(1)} s of audio` : '';
        audio.addEventListener('play', () => card.el.classList.add('playing'));
        for (const ev of ['pause', 'ended']) audio.addEventListener(ev, () => card.el.classList.remove('playing'));
        audio.dataset.state = 'done';
        card.done(data);
      },
      onSettled: refreshClips,
    });
    bench.querySelector('[data-cy=speak]').disabled = false;
  });

  bench.querySelector('[data-cy=listen-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clip = clipSelect.value;
    const chosen = listeners.filter((m) => listenerPicker.selected().includes(m.name));
    if (!clip) return toast('Speak first, then pick a clip.', 'error');
    if (!chosen.length) return toast('Pick at least one listener first.', 'error');
    // Start the on-device check now, while the click still counts as a user gesture.
    const chromeReady = chosen.some((m) => m.browser) ? prepareChrome() : Promise.resolve('n/a');
    transcribeButton.disabled = true;
    await runAcross({
      models: chosen,
      resultsEl: transcriptsEl,
      summaryEl: transcriptSummary,
      kind: 'transcribe',
      cardCy: 'transcript-result',
      task: async (model, card) => {
        card.body.innerHTML = `<p class="transcript" data-cy="transcript" data-state="loading">Listening…</p>`;
        if (model.browser) {
          const started = performance.now();
          const local = (await chromeReady) === 'available';
          const heard = await listenWithChrome(clip, local, (live) => {
            card.body.querySelector('[data-cy=transcript]').textContent = live;
          });
          if (!heard.trim()) throw new Error('Chrome heard nothing. On-device speech recognition may not be available in this browser, for example in headless Chrome.');
          showTranscript(card, spokenText, heard);
          card.done({ vitals: { model: model.name, latencyMs: Math.round(performance.now() - started), costUsd: 0, usage: null } });
          card.el.querySelector('.meta').textContent = `chrome · Web Speech API · ${local ? 'on-device' : 'cloud'}`;
          return;
        }
        const data = await postJson('/api/transcribe', { url: clip, model: model.name });
        showTranscript(card, spokenText, data.text);
        card.done(data);
      },
    });
    transcribeButton.disabled = false;
  });

  return vitals.dispose;
}
