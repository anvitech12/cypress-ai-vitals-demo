import { answerOf, ask, card, openPage, stubAnswers } from '../../support/playground';

const MODEL = 'gpt-oss-20b';

describe('Technique: the flaky-AI playbook', () => {
  beforeEach(() => openPage('chat', [MODEL]));

  it('a provider overload shows a clear error, and Retry recovers', () => {
    let calls = 0;
    cy.intercept('POST', '/api/chat', (req) => {
      if (calls++ === 0) req.reply({ statusCode: 503, body: { error: 'This model is currently experiencing high demand.', model: MODEL } });
    }).as('chat');
    ask('What is the capital of the USA?');
    card(MODEL).should('have.attr', 'data-state', 'error').find('[data-cy=error]').should('contain', 'overloaded');
    card(MODEL).find('[data-cy=retry]').click();
    answerOf(MODEL).aiAssert({ mustMention: ['Washington'], model: MODEL });
  });

  it('a latency budget catches a slow model', () => {
    cy.intercept('POST', '/api/chat', {
      headers: { 'server-timing': 'model;dur=4200' },
      body: { text: 'Washington, D.C. is the capital of the United States.', model: MODEL, usage: { inputTokens: 40, outputTokens: 12 } },
    }).as('chat');
    ask('What is the capital of the USA?');
    answerOf(MODEL);
    // The stub's 4.2 s is fake, so it is reported under its own name rather than the real model's.
    cy.wait('@chat').aiVitals({ latencyMs: 3000, model: 'slow model (stub)', shouldFail: true });
  });

  it('malformed JSON is caught before it reaches users', () => {
    stubAnswers(['{"city": "Washington, D.C.", "country": ']);
    ask('Return only JSON with the capital of the USA.');
    answerOf(MODEL).aiAssert({ jsonSchema: { type: 'object', required: ['city'] }, shouldFail: true });
  });

  it('non-determinism: gate on a pass rate, not a single run', () => {
    for (let i = 0; i < 5; i++) {
      ask('Name the largest planet in our solar system in one sentence.');
      answerOf(MODEL).aiAssert({ mustMention: ['Jupiter'], soft: true, label: 'planet', model: MODEL });
    }
    cy.aiExpectPassRate('planet', 0.8);
  });
});
