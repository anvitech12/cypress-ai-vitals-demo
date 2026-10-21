/**
 * A vital-signs trace drawn on a canvas. It scrolls a calm heartbeat; every real model call adds a spike
 * whose height follows its latency, labelled with the model name.
 */
export class Monitor {
  constructor(canvas, { labels = true, beatEvery = 1400, speed = 60 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.labels = labels;
    this.beatEvery = beatEvery;
    this.speed = speed; // px per second
    this.events = [];
    this.offset = 0;
    this.last = performance.now();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    requestAnimationFrame(this.frame);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  stop() {
    this.stopped = true;
  }

  /** Adds a spike for a finished model call. */
  spike(label, latencyMs, ok = true) {
    const strength = ok ? Math.min(1, 0.35 + Math.log10(Math.max(latencyMs ?? 100, 50)) / 5) : 0.9;
    this.events.push({ at: this.offset + this.w * 0.82, strength, label, ok, latencyMs });
    if (this.events.length > 40) this.events.shift();
  }

  /** Height of the trace at a world position x (0 = baseline, 1 = full height). */
  value(x) {
    const beatLen = (this.beatEvery / 1000) * this.speed;
    const phase = ((x % beatLen) + beatLen) % beatLen;
    const p = phase / beatLen;
    let v = 0;
    if (p > 0.1 && p < 0.14) v = -0.12 * Math.sin(((p - 0.1) / 0.04) * Math.PI);
    if (p > 0.16 && p < 0.2) v = 0.32 * Math.sin(((p - 0.16) / 0.04) * Math.PI);
    if (p > 0.2 && p < 0.23) v = -0.18 * Math.sin(((p - 0.2) / 0.03) * Math.PI);
    if (p > 0.32 && p < 0.42) v = 0.08 * Math.sin(((p - 0.32) / 0.1) * Math.PI);
    for (const e of this.events) {
      const d = x - e.at;
      if (d > -14 && d < 14) v += (e.ok ? 1 : -1) * e.strength * Math.cos((d / 14) * (Math.PI / 2)) * (d < 0 ? 1 : -0.35);
    }
    return v;
  }

  frame(now) {
    if (this.stopped) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!document.hidden && !this.reduced) this.offset += dt * this.speed;
    const { ctx, w, h } = this;
    const css = getComputedStyle(this.canvas);
    const stroke = css.getPropertyValue('--trace').trim() || '#3cc48f';
    const grid = css.getPropertyValue('--grid').trim() || 'rgba(127,127,127,0.15)';
    const text = css.getPropertyValue('--trace-text').trim() || '#888';
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    const gridStep = 24;
    const shift = this.offset % gridStep;
    ctx.beginPath();
    for (let x = -shift; x < w; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = gridStep / 2; y < h; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    const mid = h * 0.6;
    const amp = h * 0.5;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    const head = w * 0.82;
    const gradient = ctx.createLinearGradient(0, 0, head, 0);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.25, stroke);
    gradient.addColorStop(1, stroke);
    ctx.strokeStyle = gradient;
    ctx.beginPath();
    for (let x = 0; x <= head; x += 1.5) {
      const y = mid - this.value(this.offset + x) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const yHead = mid - this.value(this.offset + head) * amp;
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.arc(head, yHead, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(head, yHead, 8 + Math.sin(now / 200) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (this.labels) {
      ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (const e of this.events) {
        const x = e.at - this.offset;
        if (x < 30 || x > head) continue;
        ctx.fillStyle = e.ok ? text : css.getPropertyValue('--bad').trim();
        ctx.globalAlpha = Math.min(1, x / 120);
        const latency = e.latencyMs >= 1000 ? `${(e.latencyMs / 1000).toFixed(1)}s` : `${Math.round(e.latencyMs ?? 0)}ms`;
        ctx.fillText(e.ok ? `${e.label} ${latency}` : `${e.label} failed`, x, Math.max(12, mid - e.strength * amp - 8));
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(this.frame);
  }
}
