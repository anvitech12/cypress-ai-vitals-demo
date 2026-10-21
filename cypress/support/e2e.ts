import { register as registerGrep } from '@cypress/grep';
import { register as registerAiVitals } from 'cypress-ai-vitals';

registerGrep();
registerAiVitals();

// Tag every Playground API call with the test name, so recorded answers replay in the same order per test.
beforeEach(() => {
  cy.intercept({ method: 'POST', url: '/api/**' }, (req) => {
    req.headers['x-ai-scope'] = Cypress.currentTest.titlePath.join(' > ');
  });
});
