# Try it yourself

Everything runs on live models by default (your keys in `ai.env`). Open a terminal in the project folder.

## 1. Start the AI Playground

```bash
npm run app            # http://localhost:4400
```

| Page | What you can do |
|---|---|
| `/chat` | Pick one or more chat models, ask once, compare answers, time, tokens and cost side by side. |
| `/image` | Pick image models, generate the same prompt, compare pictures, speed and cost. |
| `/audio` | Pick voices to read a sentence, then listeners (including Chrome on-device) to write it back, scored word by word. |
| `/vitals` | Live session analytics (calls, latency, tokens, cost per model) and every saved Cypress report. |

Every page reads `?models=a,b` to pre-select models, for example `/chat?models=gpt-oss-120b,gemini-flash-lite`.

## 2. Check every model answers

```bash
npm run models         # lists the models in ai.env (keys masked) and calls each one once
npm run test:sanity    # Cypress: the app works and every model answers
```

## 3. Run the tests in the Cypress app

With the app running, in a second terminal:

```bash
npm run cy:open        # or `npm run demo`, which starts the app and Cypress together
```

```
cypress/e2e/
  00-sanity/      app pages work, every connected model answers
  text/           01 single model · 02 compare models · 03 arena report
  image/          01 single model · 02 compare models · 03 arena report
  audio/          01 single voice + Chrome captions · 02 compare voices and listeners · 03 listener report
  techniques/     the talk's lessons: brittle vs semantic, grounding and guardrails,
                  images need a judge, the flaky-AI playbook
  real-demo/      Gemini through its API, and the real gemini.google.com chat page
```

The single and compare specs keep the model names and prompt at the top of the file. Edit them and save, and Cypress reruns the spec. Tests marked "fails as expected" show a classic check breaking; they pass when it breaks for that reason. The `cy.prompt()` tests are skipped unless you sign in to Cypress Cloud and run `npm run cy:open:cloud`.

## 4. Reports

Every spec run saves an HTML report, numbered per run, next to Cypress's videos and screenshots:

```
cypress/ai-vitals/reports/text/02-compare-models.cy.ts/report-001.html, report-002.html, … latest.html
cypress/ai-vitals/reports/index.html      every spec with its history
```

```bash
npm run open:reports   # open the index
npm run report         # merge the whole last run into run.html
npm run clean:reports  # delete all saved results and reports
```

The Playground's AI Vitals page links to the same reports.

## 5. Record a demo video

Every `cypress run` saves an MP4 per spec in `cypress/videos/`, including the Command Log and the AI VITALS panel. For a narrated take, run `npm run cy:open` and record with Cmd+Shift+5.

## Test lanes and budgets

| Command | Uses | When |
|---|---|---|
| `npm test` | real models | rehearsals, the live demo |
| `npm run test:record` | real models, saves every answer | once, when your free quotas are fresh |
| `npm run test:replay` | answers saved by `test:record`, no model calls | CI, rehearsing without spending quota, Wi-Fi backup. Run `test:record` once first; a fresh clone has no saved answers. |

Free tiers have daily limits:

- Cloudflare: 10,000 "neurons" a day, shared by every Cloudflare model and reset at 00:00 UTC. A FLUX schnell image uses about 60.
- Hugging Face Spaces: 2 minutes of GPU time a day without a token, 5 with a free `HF_TOKEN`. An image uses about 16 seconds.

Record once, then rehearse in replay.
