import { answerOf, ask, openPage } from '../../support/playground';

// Two Cloudflare models and one free model.
const MODELS = ['gpt-oss-120b', 'llama-4-scout', 'gemini-flash-lite'];
const QUESTION = 'In one sentence, what is the capital of the USA?';
const EXPECTED = 'Washington, D.C. is the capital of the United States.';
// The judge is not one of the contestants, so no model grades its own answer.
const JUDGE = { model: 'mistral-small', rubric: 'Correct: names Washington, D.C. as the capital of the United States. One sentence.', min: 4 };

describe('Text: compare models side by side', () => {
  it('asks three models the same question and scores every answer', () => {
    openPage('chat', MODELS);
    cy.intercept('POST', '/api/chat').as('chat');
    ask(QUESTION);

    for (const model of MODELS) {
      answerOf(model).aiAssert({ means: EXPECTED, thresholds: { means: 0.6 }, mustMention: ['Washington'], judge: JUDGE, soft: true, label: 'capital', model });
    }
    for (let i = 0; i < MODELS.length; i++) cy.wait('@chat').aiVitals({ latencyMs: 10000, soft: true, label: 'capital-vitals' });

    cy.get('[data-cy=compare-summary]').should('be.visible').and('contain', 'Fastest').and('contain', 'Cheapest');
    cy.aiExpectPassRate('capital', 0.66);
  });
});
