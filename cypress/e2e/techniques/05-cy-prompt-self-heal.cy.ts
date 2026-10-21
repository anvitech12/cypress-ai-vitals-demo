// Needs a Cypress Cloud login (the free plan works), so it is skipped by default.
// Sign in, then run `npm run cy:open:cloud` (or `npm run test:cloud`).
const STEPS = [
  'type "What is the capital of the USA?" into the question box',
  'click the Ask button',
  'wait until the answer has finished',
];

describe('Technique: from plain English to a self-healing test', { tags: '@needs-cloud' }, () => {
  it('turns a written requirement into a working test', () => {
    cy.visit('/chat?models=gpt-oss-20b');
    cy.prompt(STEPS);
    // cy.prompt writes the steps; the AI checks are still ours.
    cy.get('[data-cy=answer][data-state=done]', { timeout: 60000 }).aiAssert({ mustMention: ['Washington'], model: 'gpt-oss-20b' });
  });

  it('heals itself when the page changes underneath it', () => {
    // ?ui=v2 renames the question box, the button and the answer. The steps above stay the same.
    cy.visit('/chat?models=gpt-oss-20b&ui=v2');
    cy.prompt(STEPS);
    cy.get('[data-cy=response-text][data-state=done]', { timeout: 60000 }).aiAssert({ mustMention: ['Washington'], model: 'gpt-oss-20b' });
  });
});
