import { failsAsExpected, generate, imageOf, openPage } from '../../support/playground';

const MODEL = 'flux-schnell';
const MASCOT = 'A friendly orange fox mascot riding a skateboard, flat vector illustration, plain light background';

describe('Technique: images are unique every time, and CLIP cannot count', () => {
  beforeEach(() => openPage('image', [MODEL]));

  it('pixel snapshot: a second generation never matches the first (fails as expected)', () => {
    failsAsExpected(/expected '\/generated\/.+' to equal '\/generated\/.+'/);
    generate(MASCOT);
    imageOf(MODEL)
      .invoke('attr', 'src')
      .then((first) => {
        generate(MASCOT);
        imageOf(MODEL).invoke('attr', 'src').should('equal', first);
      });
  });

  it('three cats: CLIP says yes, the vision judge counts two', () => {
    cy.intercept('POST', '/api/image', { body: { url: '/stubs/two-cats.jpg', model: MODEL, vitals: { model: MODEL, latencyMs: 0 } } });
    generate('Three cats sitting on a sofa');
    // The picture has two cats. CLIP still matches "three cats"; the judge counts and catches it, so the test passes.
    imageOf(MODEL).aiImageAssert({ depicts: 'three cats sitting on a sofa', judge: { rubric: 'There are exactly three cats in the image.', min: 4 }, shouldFail: true });
  });
});
