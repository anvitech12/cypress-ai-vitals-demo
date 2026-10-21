import { generate, imageOf, openPage } from '../../support/playground';

const MODEL = 'flux-schnell';
const PROMPT = 'A friendly orange fox mascot riding a skateboard, flat vector illustration, plain light background';

describe('Image: one model, one prompt', () => {
  it('generates the mascot and checks it is on brand', () => {
    openPage('image', [MODEL]);
    cy.intercept('POST', '/api/image').as('image');
    generate(PROMPT);

    imageOf(MODEL).aiImageAssert({
      depicts: 'a cartoon fox riding a skateboard',
      notDepicts: ['a dog', 'a cat', 'a photograph of a real fox'],
      brand: { fixture: 'brand/fox.json' },
      judge: { model: 'llama-4-scout', rubric: 'Exactly one fox, riding a skateboard, drawn as a flat cartoon illustration (not a photo).', min: 4 },
      model: MODEL,
    });
    // Image models on a shared provider vary a lot: 2 to 25 s for this one in our runs.
    cy.wait('@image').aiVitals({ latencyMs: 30000 });
  });
});
