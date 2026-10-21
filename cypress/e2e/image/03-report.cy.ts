import { generate, imageOf, openPage } from '../../support/playground';

// Every model draws every prompt; the report ranks the models on passed checks, latency and cost.
// Two Cloudflare models and a free one. Phoenix costs about $0.026 an image, so a run is about $0.08.
const MODELS = ['flux-schnell', 'phoenix', 'sdxl-lightning'];
const PROMPTS = [
  {
    prompt: 'A friendly orange fox mascot riding a skateboard, flat vector illustration, plain light background',
    checks: { depicts: 'a cartoon fox riding a skateboard', brand: { fixture: 'brand/fox.json' }, judge: { model: 'llama-4-scout', rubric: 'One fox on a skateboard, flat cartoon style.', min: 4 } },
  },
  {
    prompt: 'Exactly three red apples on a wooden table, studio photo',
    checks: { depicts: 'three red apples on a wooden table', judge: { model: 'llama-4-scout', rubric: 'There are exactly three apples, they are red, on a wooden table.', min: 4 } },
  },
  {
    prompt: 'A lighthouse on a rocky cliff at dusk, watercolor painting',
    checks: { depicts: 'a lighthouse on a cliff at dusk', judge: { model: 'llama-4-scout', rubric: 'A lighthouse on a cliff at dusk, watercolor style.', min: 4 } },
  },
];

describe('Image: model arena report', () => {
  for (const { prompt, checks } of PROMPTS) {
    it(`scores every model on: ${prompt.split(',')[0]}`, () => {
      openPage('image', MODELS);
      cy.intercept('POST', '/api/image').as('image');
      generate(prompt);
      for (const model of MODELS) imageOf(model).aiImageAssert({ ...checks, soft: true, label: 'image arena', model });
      for (let i = 0; i < MODELS.length; i++) cy.wait('@image').aiVitals({ soft: true, label: 'image arena vitals' });
    });
  }
});
