/** Helpers for driving the AI Playground. Every page reads ?models=a,b to pre-select models. */

const LONG = { timeout: 90_000 };

export function openPage(page: 'chat' | 'image' | 'audio', models: string[]) {
  cy.visit(`/${page}?models=${models.join(',')}`);
  for (const m of models) cy.get(`[data-cy=model-option][data-model="${m}"] input`).should('be.checked');
}

/** Waits until a model's card finishes. If the call failed, fails right away with the card's own message instead of timing out. */
export function settled(model: string, cy_ = 'result') {
  return cy.get(`[data-cy=${cy_}][data-model="${model}"]:is([data-state=done], [data-state=error])`, LONG).then(($card) => {
    if ($card.attr('data-state') === 'error') throw new Error(`${model} failed: ${$card.find('[data-cy=error]').text().trim()}`);
  });
}

/** Card for one model's result on the current page. */
export function card(model: string, cy_ = 'result') {
  return cy.get(`[data-cy=${cy_}][data-model="${model}"]`, LONG);
}

/**
 * For teaching tests that show a classic check breaking: the test passes when it fails for exactly this reason,
 * and fails for any other. The red assertion stays in the Command Log, so the audience still sees it break.
 */
export function failsAsExpected(reason: RegExp) {
  cy.on('fail', (err) => {
    if (reason.test(err.message)) return false;
    throw err;
  });
}

// ---- chat ---------------------------------------------------------------------------------------------
export function ask(question: string, options: { source?: '' | 'usa' } = {}) {
  cy.get('[data-cy=question]').clear().type(question, { delay: 0, parseSpecialCharSequences: false });
  if (options.source !== undefined) cy.get('[data-cy=chat-source]').select(options.source);
  cy.get('[data-cy=ask]').click();
}

export function answerOf(model: string) {
  settled(model);
  return cy.get(`[data-cy=result][data-model="${model}"] [data-cy=answer][data-state=done]`, LONG);
}

/** Stubs /api/chat so each call returns the next canned answer. For demos that must fail the same way every time. */
export function stubAnswers(answers: string[], model = 'gpt-oss-20b') {
  let i = 0;
  cy.intercept('POST', '/api/chat', (req) => {
    const text = answers[i++ % answers.length];
    req.reply({ body: { text, model, vitals: { model, latencyMs: 0, latencySource: 'stub' } } });
  }).as('chat');
}

// ---- image --------------------------------------------------------------------------------------------
export function generate(prompt: string) {
  cy.get('[data-cy=image-prompt]').clear().type(prompt, { delay: 0 });
  cy.get('[data-cy=generate]').click();
}

export function imageOf(model: string) {
  settled(model);
  return cy.get(`[data-cy=result][data-model="${model}"] [data-cy=image][data-state=done]`, LONG);
}

// ---- audio --------------------------------------------------------------------------------------------
export function speak(text: string) {
  cy.get('[data-cy=speech-text]').clear().type(text, { delay: 0 });
  cy.get('[data-cy=speak]').click();
}

export function clipOf(voice: string) {
  settled(voice);
  return cy.get(`[data-cy=result][data-model="${voice}"] [data-cy=speech][data-state=done]`, LONG);
}

/** Plays a voice's clip out loud from the start and waits until it ends, so the room hears it before the checks run. */
export function playClip(voice: string) {
  return clipOf(voice).then(($audio) => {
    const audio = $audio[0] as HTMLAudioElement;
    const seconds = Number.isFinite(audio.duration) ? audio.duration : 30;
    Cypress.log({ name: 'play', message: `${voice} (${seconds.toFixed(1)} s)` });
    audio.currentTime = 0;
    const ended = new Promise<void>((resolve, reject) => {
      audio.addEventListener('ended', () => resolve(), { once: true });
      audio.play().catch(reject);
    });
    return cy.wrap(ended, { log: false, timeout: (seconds + 10) * 1000 });
  });
}

export function transcribe(clipFromVoice: string) {
  // The clip list fills once every voice has finished, so give the slowest voice time.
  cy.get('[data-cy=clip-select]', LONG).should('not.be.disabled').select(clipFromVoice);
  cy.get('[data-cy=transcribe]').click();
}

export function transcriptOf(listener: string) {
  settled(listener, 'transcript-result');
  return cy.get(`[data-cy=transcript-result][data-model="${listener}"] [data-cy=transcript][data-state=done]`, LONG);
}
