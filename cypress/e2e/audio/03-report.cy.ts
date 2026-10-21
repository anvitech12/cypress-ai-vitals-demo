import { openPage, playClip, speak, transcribe, transcriptOf } from '../../support/playground';

// Every listener transcribes every voice; the report ranks listeners on word error rate, speed and cost.
// Three Cloudflare voices. Gemini's free text-to-speech allows only 10 requests a day.
const VOICES = ['aura-2', 'aura-1', 'melotts'];
// Two Cloudflare listeners and a free one.
const LISTENERS = ['whisper-cf', 'nova-3', 'whisper-turbo'];
const SENTENCE = 'The quarterly report is due on Friday, the twelfth of December.';

describe('Audio: listener arena report', () => {
  for (const voice of VOICES) {
    it(`every listener transcribes ${voice}`, () => {
      openPage('audio', [...VOICES, ...LISTENERS]);
      cy.intercept('POST', '/api/transcribe').as('transcribe');
      speak(SENTENCE);
      playClip(voice);
      transcribe(voice);
      for (const listener of LISTENERS) transcriptOf(listener).aiAssert({ maxWer: 0.2, reference: SENTENCE, soft: true, label: 'audio arena', model: listener });
      for (let i = 0; i < LISTENERS.length; i++) cy.wait('@transcribe').aiVitals({ soft: true, label: 'audio arena vitals' });
    });
  }
});
