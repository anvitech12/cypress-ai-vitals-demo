import { generate, imageOf, openPage } from '../../support/playground';

// Two Cloudflare models and a free one (SDXL Lightning costs $0 while in beta).
const MODELS = ['flux-schnell', 'phoenix', 'sdxl-lightning'];
const PROMPT = 'A lighthouse on a rocky cliff at dusk, watercolor painting';

describe('Image: compare models side by side', () => {
  it('draws the same scene with three models and scores each image', () => {
    openPage('image', MODELS);
    cy.intercept('POST', '/api/image').as('image');
    generate(PROMPT);

    for (const model of MODELS) {
      imageOf(model).aiImageAssert({
        depicts: 'a lighthouse on a cliff at dusk',
        notDepicts: ['a city skyline', 'a person', 'a car'],
        judge: { model: 'llama-4-scout', rubric: 'A lighthouse on a cliff, dusk light, painted in a watercolor style.', min: 4 },
        soft: true,
        label: 'lighthouse',
        model,
      });
    }
    for (let i = 0; i < MODELS.length; i++) cy.wait('@image').aiVitals({ latencyMs: 20000, soft: true, label: 'lighthouse-vitals' });

    cy.get('[data-cy=compare-summary]').should('be.visible').and('contain', 'Fastest');
    cy.aiExpectPassRate('lighthouse', 0.5);
  });
});
