// Real models through their official APIs: Google Gemini (free key), and ChatGPT if you add an OpenAI key.
// To include ChatGPT, put OPENAI_API_KEY and AI_MODEL_CHATGPT=openai:gpt-6-luna in ai.env.
const QUESTION = 'A customer asks: what is the capital of the USA? Answer in one short sentence.';
const FOLLOW_UP = 'Reply with only the name of the river that city is on.';

function askAndCheck(model: string) {
  cy.aiGenerate(model, QUESTION).aiAssert({ means: 'Washington, D.C. is the capital of the United States.', mustMention: ['Washington'], model });
  cy.aiGenerate(model, `The capital of the USA is Washington, D.C. ${FOLLOW_UP}`).aiAssert({ mustMention: ['Potomac'], model });
}

describe('Real demo: Gemini and ChatGPT through their APIs', () => {
  it('Gemini answers a customer question and a follow-up', () => {
    askAndCheck('gemini-flash-lite');
  });

  it('ChatGPT answers the same questions (needs an OpenAI key)', function () {
    cy.aiModels().then((models: Array<{ name: string }>) => {
      if (!models.some((m) => m.name === 'chatgpt')) {
        Cypress.log({ name: 'skipped', message: 'Add OPENAI_API_KEY and AI_MODEL_CHATGPT=openai:gpt-6-luna to ai.env to run this test.' });
        this.skip();
      }
      askAndCheck('chatgpt');
    });
  });
});
