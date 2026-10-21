// Every model in ai.env answers once through the app, so a broken key or a renamed model fails here first, not mid-demo.
// Free tiers run out (Gemini text-to-speech allows 10 calls a day, Hugging Face Spaces a few minutes of GPU),
// so a free model that is only out of quota is logged as a warning instead of failing the run.
type Model = { name: string; modality: 'chat' | 'image' | 'speech' | 'transcribe'; tags?: string[] };

const QUOTA = /quota|asks to wait|daily (free )?allocation/i;

/** Calls the app API and checks the reply, tolerating a spent free quota. */
function check(model: Model, url: string, body: object, expectOk: (body: Record<string, string>) => void) {
  return cy.request({ method: 'POST', url, body, failOnStatusCode: false, timeout: 120_000 }).then((res) => {
    if (res.status === 200) return expectOk(res.body);
    const message = String(res.body?.error ?? res.status);
    if ((model.tags ?? []).includes('free') && QUOTA.test(message)) {
      cy.log(`⚠ ${model.name}: free quota used up, skipped. ${message.slice(0, 120)}`);
      return;
    }
    throw new Error(`${model.name} failed (${res.status}): ${message}`);
  });
}

describe('Sanity: every connected model answers', () => {
  let models: Model[] = [];
  before(() => {
    cy.request('/api/models').then((res) => (models = res.body.models));
  });

  it('chat models answer a short question', () => {
    for (const m of models.filter((x) => x.modality === 'chat')) {
      check(m, '/api/chat', { prompt: 'Reply with the single word OK.', model: m.name }, (body) => {
        // A model with a small token cap (gpt-oss-20b-capped) can spend it all thinking; it still answered.
        if (body.finishReason === 'length') return void cy.log(`${m.name}: stopped at its token limit`);
        expect(body.text, m.name).to.match(/ok/i);
      });
    }
  });

  it('image models return an image', () => {
    for (const m of models.filter((x) => x.modality === 'image')) {
      check(m, '/api/image', { prompt: 'A blue coffee mug on a wooden desk, photo', model: m.name }, (body) => expect(body.url, m.name).to.match(/^\/generated\//));
    }
  });

  it('voices speak and listeners transcribe', () => {
    const sentence = 'Testing one two three.';
    for (const voice of models.filter((x) => x.modality === 'speech')) {
      check(voice, '/api/speak', { text: sentence, model: voice.name }, (body) => expect(body.url, voice.name).to.match(/^\/generated\//));
    }
    const firstVoice = models.find((x) => x.modality === 'speech')!;
    cy.request('POST', '/api/speak', { text: sentence, model: firstVoice.name }).its('body.url').then((url) => {
      for (const listener of models.filter((x) => x.modality === 'transcribe')) {
        check(listener, '/api/transcribe', { url, model: listener.name }, (body) => expect(body.text, listener.name).to.match(/testing/i));
      }
    });
  });
});
