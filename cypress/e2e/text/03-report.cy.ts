// Results first: run fixed question sets against several models and let the report rank them.
describe('Text: model arena report', () => {
  it('ranks four Cloudflare models and a free one on accuracy, latency, tokens and cost', () => {
    cy.aiCompare({
      dataset: 'golden/qa.jsonl',
      models: ['gpt-oss-120b', 'llama-4-scout', 'gemma-4', 'mistral-small', 'gpt-oss-20b'],
      system: 'Answer in one short sentence.',
      runs: 2,
      label: 'text arena',
      gates: { accuracy: 0.75 },
      soft: true,
    })
      .its('winner')
      .should('be.a', 'string');
  });

  // Groq reports thinking tokens separately, so this comparison runs on its free GPT-OSS 20B.
  it('shows whether extra thinking pays off', () => {
    cy.aiCompare({
      dataset: 'golden/reasoning.jsonl',
      models: ['gpt-oss-20b-low', 'gpt-oss-20b-high', 'gpt-oss-20b-capped'],
      system: 'Solve the problem. Reply with only the final answer, no explanation.',
      label: 'thinking budget',
      gates: { accuracy: 0.8 },
      soft: true,
    }).then((result) => {
      const by = Object.fromEntries(result.models.map((m) => [m.model, m]));
      expect(Number(by['gpt-oss-20b-high']?.reasoningTokens), 'high effort thinks more').to.be.greaterThan(Number(by['gpt-oss-20b-low']?.reasoningTokens));
    });
  });
});
