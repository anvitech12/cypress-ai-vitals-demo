import { clipOf, openPage, playClip, speak, transcribe, transcriptOf } from '../../support/playground';

const VOICE = 'aura-2';
const LISTENER = 'chrome-on-device';
const SENTENCE = 'Your order ships tomorrow morning. Thank you for testing with Cypress.';

describe('Audio: one voice, one listener', () => {
  it('speaks, captions it live in Chrome, and checks the words', () => {
    openPage('audio', [VOICE, LISTENER]);
    cy.intercept('POST', '/api/speak').as('speak');
    speak(SENTENCE);
    // Play the clip out loud first, so everyone hears what the voice said before it is checked.
    playClip(VOICE);

    // The audio file itself, transcribed independently on the server side.
    // Brand names are the usual miss ("Cyprus" for "Cypress"), so allow two wrong words in eleven.
    clipOf(VOICE).aiAudioAssert({ transcript: { expected: SENTENCE, maxWer: 0.2, engine: 'nova-3' }, model: VOICE });
    cy.wait('@speak').aiVitals({ latencyMs: 20000 });

    // What Chrome heard, live, while the clip played. Word error rate tolerates "Cyprus" for "Cypress".
    transcribe(VOICE);
    transcriptOf(LISTENER).aiAssert({ maxWer: 0.2, reference: SENTENCE, mustMention: ['order', 'tomorrow'], model: LISTENER });
  });
});
