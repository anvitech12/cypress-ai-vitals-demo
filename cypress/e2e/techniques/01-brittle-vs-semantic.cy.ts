import { answerOf, ask, failsAsExpected, openPage, stubAnswers } from '../../support/playground';

const MODEL = 'gpt-oss-20b';
const QUESTION = 'What is the capital of the USA?';
const EXACT = 'The capital is Washington, D.C.';
const THREE_RIGHT_ANSWERS = ['Washington, D.C.', "The USA's capital is Washington, D.C.", 'Washington, D.C. is the capital of the United States.'];

describe('Technique: three right answers, one brittle test', () => {
  beforeEach(() => openPage('chat', [MODEL]));

  it('brittle: an exact-string check fails on all three correct answers (fails as expected)', () => {
    failsAsExpected(/to have a length of 3 but got 0/);
    stubAnswers(THREE_RIGHT_ANSWERS);
    const answers: string[] = [];
    for (let i = 0; i < 3; i++) {
      ask(QUESTION);
      answerOf(MODEL).invoke('text').then((text) => answers.push(text));
    }
    // A classic check on each finished answer: the wording differs every time, so none contains the exact sentence.
    cy.then(() => {
      expect(answers, 'answers on the page').to.have.length(3);
      for (const text of answers) Cypress.log({ name: 'contains', message: `${text.includes(EXACT) ? '✓' : '✗'} "${text}"` });
      expect(answers.filter((text) => text.includes(EXACT)), `right answers containing '${EXACT}'`).to.have.length(3);
    });
  });

  it('semantic: the same three answers all pass on meaning and facts', () => {
    stubAnswers(THREE_RIGHT_ANSWERS);
    for (let i = 0; i < 3; i++) {
      ask(QUESTION);
      answerOf(MODEL).aiAssert({ means: 'Washington, D.C. is the capital of the United States.', thresholds: { means: 0.6 }, mustMention: ['Washington'], label: 'capital-stub' });
    }
  });

  it('live: the real model words it differently every time, the meaning holds', () => {
    for (let i = 0; i < 3; i++) {
      ask(QUESTION);
      answerOf(MODEL).aiAssert({ means: 'Washington, D.C. is the capital of the United States.', mustMention: ['Washington'], soft: true, label: 'capital-live', model: MODEL });
    }
    cy.aiExpectPassRate('capital-live', 1);
  });
});
