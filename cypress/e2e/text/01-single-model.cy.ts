import { answerOf, ask, openPage } from '../../support/playground';

// Change these to demo a different model or question. Cypress reruns the spec when you save.
const MODEL = 'gpt-oss-120b';
const QUESTION = 'What is the capital of the USA?';

describe('Text: one model, one question', () => {
  it('answers the capital question correctly', () => {
    openPage('chat', [MODEL]);
    cy.intercept('POST', '/api/chat').as('chat');
    ask(QUESTION, { source: 'usa' });

    // Wait for the finished answer, then score it.
    answerOf(MODEL).aiAssert({
      means: 'Washington, D.C. is the capital of the United States.',
      mustMention: ['Washington'],
      groundedIn: { fixture: 'golden/usa.md' },
      guardrails: ['no-prompt-leak', 'no-pii'],
      canary: 'PLAYGROUND-7731',
      model: MODEL,
    });

    // Tokens, time and cost of the call the app made.
    cy.wait('@chat').aiVitals({ latencyMs: 5000, totalTokens: 2000 });
  });
});
