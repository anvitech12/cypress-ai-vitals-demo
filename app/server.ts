import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import {
  audioDurationSec,
  buildRegistry,
  CassetteMissError,
  computeCost,
  describeSettings,
  generate,
  loadAiEnv,
  makeRedactor,
  padWavWithSilence,
  secretValues,
  sniffMime,
  withCassette,
  withRetry,
  type CassetteMode,
  type GenerateRequest,
  type ModelConfig,
  type ModelKind,
} from 'cypress-ai-vitals/providers';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicDir = path.join(here, 'public');
const generatedDir = path.join(here, 'generated');
const reportsDir = path.join(root, 'cypress/ai-vitals/reports');
mkdirSync(generatedDir, { recursive: true });

const env = loadAiEnv(root);
const registry = buildRegistry(env);
// Error messages go to the browser, so keys and account ids are stripped first.
const redact = makeRedactor(secretValues(env, registry.values()));
const mode = (env.AI_MODE ?? 'live') as CassetteMode;
const call = withCassette(generate, { mode, dir: path.join(root, 'cypress/fixtures/ai-cassettes'), redact });

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' };

// ---- session log: every model call this server made, for the AI Vitals page ---------------------------
interface CallLog {
  ts: number;
  model: string;
  modality: ModelKind;
  ok: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number | null;
  error?: string;
}
let session: CallLog[] = [];

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = ((s.length - 1) * p) / 100;
  return s[Math.floor(pos)] + (s[Math.ceil(pos)] - s[Math.floor(pos)]) * (pos - Math.floor(pos));
}

// ---- helpers ------------------------------------------------------------------------------------------
function describe(m: ModelConfig) {
  return { name: m.name, label: m.label ?? m.name, tags: m.tags ?? [], provider: m.preset, modelId: m.model, modality: m.modality, settings: describeSettings(m.params) ?? null, price: m.price ?? null };
}

function model(name: string | undefined, modality: ModelKind): ModelConfig {
  const config = name ? registry.get(name.toLowerCase()) : [...registry.values()].find((m) => m.modality === modality);
  if (!config) throw Object.assign(new Error(name ? `Unknown model "${name}". Add it to ai.env.` : `No ${modality} model in ai.env.`), { status: 400 });
  if (config.modality !== modality) throw Object.assign(new Error(`"${config.name}" is a ${config.modality} model, not a ${modality} model.`), { status: 400 });
  return config;
}

/** Resolves a URL path to a file inside one of our folders, refusing anything that climbs out of it. */
function localFile(urlPath: string, base: string): string {
  const file = path.resolve(base, `.${path.posix.normalize(`/${urlPath}`)}`);
  if (!file.startsWith(base + path.sep) || !existsSync(file)) throw Object.assign(new Error(`No such file: ${urlPath}`), { status: 400 });
  return file;
}

function save(data: Buffer, mime: string): string {
  const name = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}.${EXT[mime] ?? 'bin'}`;
  const file = path.join(generatedDir, name);
  if (!existsSync(file)) writeFileSync(file, data);
  return `/generated/${name}`;
}

/** Runs one model call, logs it, and answers with the output plus vitals in the body and standard headers. */
async function run(req: Request, res: Response, config: ModelConfig, request: GenerateRequest, shape: (r: Awaited<ReturnType<typeof call>>) => object) {
  const scope = String(req.header('x-ai-scope') ?? '');
  try {
    const result = await withRetry(
      () => call(config, request, { scope }),
      3,
      (err, waitMs) => console.log(`${new Date().toLocaleTimeString()} ${config.name}: ${err.status} from the provider, retrying in ${(waitMs / 1000).toFixed(1)}s`),
    );
    const replayed = result.cassette === 'hit';
    const vitals = {
      model: config.name,
      provider: config.preset,
      modelId: config.model,
      settings: describeSettings(config.params) ?? null,
      latencyMs: Math.round(result.latencyMs),
      latencySource: replayed ? 'cassette' : 'provider',
      usage: result.usage ?? null,
      costUsd: computeCost(config, result.usage, {
        images: request.task === 'image' ? 1 : 0,
        characters: request.task === 'speech' ? (request.prompt ?? '').length : undefined,
        // Per-minute prices apply to the audio a model hears (transcription) or produces (speech).
        audioSeconds:
          request.task === 'transcribe' && request.audio
            ? audioDurationSec(request.audio.data)
            : request.task === 'speech' && result.media
              ? audioDurationSec(result.media.data)
              : undefined,
      }),
    };
    session.push({
      ts: Date.now(),
      model: config.name,
      modality: config.modality,
      ok: true,
      latencyMs: vitals.latencyMs,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      reasoningTokens: result.usage?.reasoningTokens,
      costUsd: vitals.costUsd,
    });
    res.setHeader('Server-Timing', `model;dur=${vitals.latencyMs};desc="${replayed ? 'cassette' : config.name}"`);
    res.setHeader('x-ai-model', config.name);
    res.json({ ...shape(result), model: config.name, servedModel: result.servedModel ?? null, finishReason: result.finishReason ?? null, usage: result.usage ?? null, vitals });
  } catch (err) {
    const status = err instanceof CassetteMissError ? 404 : ((err as { status?: number }).status ?? 502);
    const message = redact((err as Error).message);
    session.push({ ts: Date.now(), model: config.name, modality: config.modality, ok: false, error: message.slice(0, 200) });
    res.status(status).json({ error: message, model: config.name });
  }
}

const app = express();
const port = Number(process.env.PORT ?? 4400);
app.use(express.json({ limit: '25mb' }));
app.use('/generated', express.static(generatedDir));
app.use('/reports', express.static(reportsDir));
app.use(express.static(publicDir, { index: false }));

// ---- API ----------------------------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ ok: true, mode });
});

app.get('/api/models', (_req, res) => {
  res.json({ mode, models: [...registry.values()].map(describe) });
});

app.post('/api/chat', async (req, res) => {
  const { prompt, system, model: name, params } = req.body as { prompt: string; system?: string; model?: string; params?: Record<string, unknown> };
  await run(req, res, model(name, 'chat'), { task: 'text', prompt, system, params }, (r) => ({ text: r.text ?? '' }));
});

app.post('/api/image', async (req, res) => {
  const { prompt, model: name } = req.body as { prompt: string; model?: string };
  await run(req, res, model(name, 'image'), { task: 'image', prompt }, (r) => ({ url: r.media ? save(r.media.data, r.media.mime) : null }));
});

app.post('/api/vision', async (req, res) => {
  const { prompt, imageUrl, model: name } = req.body as { prompt: string; imageUrl: string; model?: string };
  let data: Buffer;
  try {
    data = readFileSync(imageUrl.startsWith('/generated/') ? localFile(imageUrl.slice('/generated'.length), generatedDir) : localFile(imageUrl, publicDir));
  } catch (err) {
    return void res.status(400).json({ error: (err as Error).message });
  }
  await run(req, res, model(name, 'chat'), { task: 'text', prompt, images: [{ data, mime: sniffMime(data, 'image/jpeg') }] }, (r) => ({ text: r.text ?? '' }));
});

app.post('/api/speak', async (req, res) => {
  const { text, voice, model: name } = req.body as { text: string; voice?: string; model?: string };
  await run(req, res, model(name, 'speech'), { task: 'speech', prompt: text, params: voice ? { voice } : undefined }, (r) => {
    if (!r.media) return { url: null };
    // Trailing silence stops browser speech recognition from dropping the last word.
    const data = r.media.mime === 'audio/wav' ? padWavWithSilence(r.media.data, 1.5) : r.media.data;
    return { url: save(data, r.media.mime), mime: r.media.mime };
  });
});

/** Transcribes a clip this server generated ({ url }) or uploaded raw audio bytes. */
app.post('/api/transcribe', express.raw({ type: 'audio/*', limit: '25mb' }), async (req, res) => {
  let data: Buffer;
  if (Buffer.isBuffer(req.body)) {
    data = req.body;
  } else {
    const url = String((req.body as { url?: string }).url ?? '');
    if (!url.startsWith('/generated/')) return void res.status(400).json({ error: 'Send raw audio, or { url } of a generated clip.' });
    try {
      data = readFileSync(localFile(url.slice('/generated'.length), generatedDir));
    } catch (err) {
      return void res.status(400).json({ error: (err as Error).message });
    }
  }
  const name = (req.query.model as string | undefined) ?? (req.body as { model?: string })?.model;
  await run(req, res, model(name, 'transcribe'), { task: 'transcribe', audio: { data, mime: sniffMime(data, 'audio/wav') } }, (r) => ({ text: r.text ?? '' }));
});

app.get('/api/vitals', (_req, res) => {
  const byModel = new Map<string, CallLog[]>();
  for (const c of session) byModel.set(c.model, [...(byModel.get(c.model) ?? []), c]);
  const models = [...byModel.entries()].map(([name, calls]) => {
    const ok = calls.filter((c) => c.ok);
    const latencies = ok.map((c) => c.latencyMs).filter((v): v is number => v !== undefined);
    const costs = ok.map((c) => c.costUsd).filter((c): c is number => typeof c === 'number');
    const config = registry.get(name);
    return {
      name,
      label: config?.label ?? name,
      tags: config?.tags ?? [],
      provider: config?.preset,
      modelId: config?.model,
      modality: calls[0].modality,
      calls: calls.length,
      errors: calls.length - ok.length,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      inputTokens: ok.reduce((s, c) => s + (c.inputTokens ?? 0), 0),
      outputTokens: ok.reduce((s, c) => s + (c.outputTokens ?? 0), 0),
      reasoningTokens: ok.reduce((s, c) => s + (c.reasoningTokens ?? 0), 0),
      // Sum what is priced; pricedCalls says how many calls that covers, so averages stay honest.
      costUsd: costs.length ? costs.reduce((s, c) => s + c, 0) : null,
      pricedCalls: costs.length,
    };
  });
  res.json({ mode, since: session[0]?.ts ?? null, calls: session.length, models, recent: session.slice(-25).reverse() });
});

app.post('/api/vitals/reset', (_req, res) => {
  session = [];
  res.json({ ok: true });
});

app.get('/api/reports', (_req, res) => {
  const specs: Array<{ spec: string; latest: string; runs: number; updated: number }> = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (existsSync(path.join(full, 'latest.html'))) {
        const rel = path.relative(reportsDir, full);
        specs.push({
          spec: rel,
          latest: `/reports/${rel}/latest.html`,
          runs: readdirSync(full).filter((f) => /^report-\d+\.html$/.test(f)).length,
          updated: statSync(path.join(full, 'latest.html')).mtimeMs,
        });
      }
      walk(full);
    }
  };
  walk(reportsDir);
  specs.sort((a, b) => b.updated - a.updated);
  res.json({
    specs,
    index: existsSync(path.join(reportsDir, 'index.html')) ? '/reports/index.html' : null,
    run: existsSync(path.join(reportsDir, 'run.html')) ? '/reports/run.html' : null,
  });
});

// ---- pages: every route serves the single-page app ------------------------------------------------------
const shell = path.join(publicDir, 'index.html');
app.get(['/', '/chat', '/image', '/audio', '/vitals'], (_req, res) => {
  res.sendFile(shell);
});
// Any other page path gets the app too, so a typo lands on the home page instead of a raw error.
app.get('/{*rest}', (req, res, next) => {
  if (/^\/(api|generated|reports)\//.test(req.path) || path.extname(req.path)) return next();
  res.sendFile(shell);
});

// Errors thrown before a model call (unknown model, wrong kind of model) come back as JSON like every other error.
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: express.NextFunction) => {
  res.status(err.status ?? 500).json({ error: redact(err.message) });
});

// Loopback only: on a shared network (a venue's Wi-Fi) nobody else can spend your keys. HOST=0.0.0.0 opens it up.
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => {
  console.log(`AI Playground on http://localhost:${port} (AI_MODE=${mode}, ${registry.size} models)`);
});
