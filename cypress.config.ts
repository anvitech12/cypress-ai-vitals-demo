import { defineConfig } from 'cypress';
import { plugin as grepPlugin } from '@cypress/grep/plugin';
import { aiVitalsPlugin } from 'cypress-ai-vitals/plugin';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4400',
    // A desktop-sized page; the default 1000x660 shows the app small and cramped in the runner.
    viewportWidth: 1280,
    viewportHeight: 800,
    // Cypress scrolls each element it acts on into view; centring it keeps the question on screen in recordings.
    scrollBehavior: 'center',
    video: true,
    // Lets after:spec run in cypress open too, so each spec still saves its AI Vitals report.
    experimentalInteractiveRunEvents: true,
    // cy.prompt() needs a Cypress Cloud login, so those tests are skipped unless you ask for them
    // (npm run cy:open:cloud). A command-line --expose grepTags=... replaces this default.
    expose: { grepTags: '-@needs-cloud' },
    setupNodeEvents(on, config) {
      // Recorded (headless) runs get a full-HD window, so the page is shown at 100% instead of shrunk to fit 1280x720.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.isHeadless) launchOptions.args.push('--window-size=1920,1080');
        return launchOptions;
      });
      grepPlugin(config);
      return aiVitalsPlugin(on, config);
    },
  },
});
