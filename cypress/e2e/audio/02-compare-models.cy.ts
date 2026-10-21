import { clipOf, openPage, playClip, speak, transcribe, transcriptOf } from '../../support/playground';

// Three Cloudflare voices. Gemini's free text-to-speech allows only 10 requests a day.
const VOICES = ['aura-2', 'aura-1', 'melotts'];
// Two Cloudflare listeners and a free one.
const LISTENERS = ['whisper-cf', 'nova-3', 'whisper-turbo'];
const SENTENCE = 'Please confirm the delivery address before four thirty this afternoon.';

describe('Audio: compare voices and listeners', () => {
  it('three voices read the sentence and three listeners write it back', () => {
    openPage('audio', [...VOICES, ...LISTENERS]);
    cy.intercept('POST', '/api/speak').as('speak');
    cy.intercept('POST', '/api/transcribe').as('transcribe');
    speak(SENTENCE);
    // Play each voice out loud first, so everyone hears how they differ before the checks.
    for (const voice of VOICES) playClip(voice);
    for (const voice of VOICES) clipOf(voice).aiAudioAssert({ transcript: { expected: SENTENCE, maxWer: 0.2, engine: 'nova-3' }, soft: true, label: 'voices', model: voice });

    for (let i = 0; i < VOICES.length; i++) cy.wait('@speak').aiVitals({ soft: true, label: 'voice vitals' });

    transcribe(VOICES[0]);
    for (const listener of LISTENERS) transcriptOf(listener).aiAssert({ maxWer: 0.2, reference: SENTENCE, soft: true, label: 'listeners', model: listener });

    for (let i = 0; i < LISTENERS.length; i++) cy.wait('@transcribe').aiVitals({ soft: true, label: 'listener vitals' });

    cy.aiExpectPassRate('voices', 0.66);
    cy.aiExpectPassRate('listeners', 0.66);
  });
});
