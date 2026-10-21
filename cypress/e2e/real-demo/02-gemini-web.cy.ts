// The real gemini.google.com chat page, in Chrome. It works signed out; to use your account, run
// `npm run cy:open:real` (it pauses at the start so you can sign in yourself, then press Resume).
// Google's own page code throws errors we do not own, so this spec ignores them.
const EDITOR = 'rich-textarea [contenteditable="true"]';
const ANSWER = 'model-response';

/** Waits until the latest answer has stopped changing for 2 seconds, so Gemini has finished writing. */
function finishedAnswer(index: number) {
  let last = '';
  let since = 0;
  return cy
    .get(ANSWER, { timeout: 90_000 })
    .should('have.length.at.least', index + 1)
    // The timeout here also covers the stability check below; Cypress's default 4 s is too short for Gemini.
    .eq(index, { timeout: 90_000 })
    .should(($answer) => {
      const text = $answer.text().trim();
      if (!text || text !== last) {
        last = text;
        since = Date.now();
        throw new Error('Gemini is still writing');
      }
      if (Date.now() - since < 2000) throw new Error('Gemini is still writing');
    });
}

function send(message: string) {
  cy.get(EDITOR, { timeout: 30_000 }).first().click().type(`${message}{enter}`, { delay: 0 });
}

describe('Real demo: chatting with Gemini on gemini.google.com', { tags: '@real-web' }, () => {
  before(() => {
    Cypress.on('uncaught:exception', () => false);
  });

  it('answers a question, then a follow-up in the same chat thread', () => {
    cy.visit('https://gemini.google.com/app');
    if (Cypress.expose('pauseForLogin')) {
      Cypress.log({ name: 'sign in', message: 'Sign in to Gemini in this window if you want your account, then press Resume.' });
      cy.pause();
    }

    const started = Date.now();
    send('What is the capital of the USA? Answer in one sentence.');
    finishedAnswer(0)
      .then(($answer) => {
        Cypress.log({ name: 'gemini', message: `answered in ${((Date.now() - started) / 1000).toFixed(1)} s` });
        return $answer;
      })
      .aiAssert({ means: 'Washington, D.C. is the capital of the United States.', thresholds: { means: 0.6 }, mustMention: ['Washington'], model: 'gemini-web' });

    // The follow-up only makes sense if Gemini remembers the first question.
    send('Which river is that city on? Reply with just its name.');
    finishedAnswer(1).aiAssert({ mustMention: ['Potomac'], model: 'gemini-web' });
  });
});
