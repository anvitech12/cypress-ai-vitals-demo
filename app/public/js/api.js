/** Fires 'call' whenever a model call finishes, so the header and AI Vitals page can refresh. */
export const bus = new EventTarget();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return res.json();
}

export async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  bus.dispatchEvent(new CustomEvent('call', { detail: json }));
  if (!res.ok) throw new ApiError(friendlyError(json.error ?? `HTTP ${res.status}`, res.status), res.status);
  return json;
}

function friendlyError(message, status) {
  if (/daily free allocation/i.test(message)) return "Cloudflare's free daily allowance (10,000 neurons) is used up. It resets at 00:00 UTC.";
  if (/ZeroGPU quota/i.test(message)) {
    const wait = /try again in ([\d:]+)/i.exec(message)?.[1];
    const back = wait && /[1-9]/.test(wait) ? ` (back in ${wait})` : ' for today';
    const noToken = /HF_TOKEN|Authenticate with a Hugging Face token/i.test(message);
    return `Hugging Face's free GPU time for Spaces is used up${back}.${noToken ? ' Without a token it is 2 minutes a day per network; a free HF_TOKEN in ai.env gives 5.' : ''}`;
  }
  const wait = /asks to wait ([\d.]+ (?:min|h))/.exec(message)?.[1];
  if (status === 429 && wait) return `This model's free quota is used up for now. The provider asks to wait ${wait}.`;
  if (status === 429) return 'The provider is rate limiting this model. Wait a few seconds and retry.';
  if (status === 503 || /high demand|overloaded/i.test(message)) return 'The provider is overloaded right now. Retry in a moment.';
  if (status === 404 && /recording/i.test(message)) return 'Replay mode has no recording for this request. Record it first with AI_MODE=record.';
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

let modelsPromise;
export function loadModels() {
  modelsPromise ??= getJson('/api/models');
  return modelsPromise;
}
