// usage.js — shared usage math. Loaded by background.js (importScripts), content.js, popup.js and the tests.
// Pure functions only: no DOM, no chrome.* access.
(() => {
  'use strict';
  const DEFAULTS = {
    position: 'dock', compact: false,
    showSession: true, showWeekly: true, showContext: true, showLeft: true, showModels: true,
    alerts: true, alertAt: [80, 95], resetNotify: true, badge: 'session',
    ctxWindow: 200000, modelWeights: { opus: 5, sonnet: 1, haiku: 0.2 }, hidden: false,
  };

  const frac = (v) => { v = Number(v); if (isNaN(v)) return null; return v > 1 ? Math.min(v / 100, 1.5) : Math.max(0, v); };
  const ms = (v) => { if (v == null) return null; const d = typeof v === 'number' ? new Date(v < 2e10 ? v * 1000 : v) : new Date(v); return isNaN(d) ? null : d.getTime(); };

  // Tolerant parser for claude.ai's (undocumented) usage payloads. Finds every object that looks like a
  // {utilization, resets_at} window, labels it by the key it hangs off, and maps it to session / weekly /
  // per-model buckets. Also understands the live `message_limit` SSE event and the newer `limits[]` list.
  function parseUsage(j, now = Date.now()) {
    const out = { session: null, weekly: null, sessionReset: null, weeklyReset: null, models: {}, extra: null, at: now };
    const found = [];
    const walk = (o, key, depth) => {
      if (!o || typeof o !== 'object' || depth > 6) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, key, depth + 1)); return; }
      const u = o.utilization ?? o.used ?? o.fraction ?? o.percent ?? o.percentage ?? o.usage_fraction;
      const r = o.resets_at ?? o.reset_at ?? o.resetsAt ?? o.resetAt;
      if ((typeof u === 'number' || typeof u === 'string') || r != null) {
        const label = [o.type, o.name, o.window, o.id, o.limit_type, o.bucket, key].filter((x) => typeof x === 'string').join('|').toLowerCase();
        found.push({ key: label, u: u != null ? frac(u) : null, r: ms(r) });
      }
      for (const k of Object.keys(o)) if (k !== 'message_limit') walk(o[k], k, depth + 1);
    };
    walk(j, '', 0);
    for (const f of found) {
      const k = f.key;
      if (/opus/.test(k)) out.models.opus = { u: f.u, r: f.r };
      else if (/sonnet/.test(k)) out.models.sonnet = { u: f.u, r: f.r };
      else if (/haiku/.test(k)) out.models.haiku = { u: f.u, r: f.r };
      else if (/five_hour|5h|5_hour|session/.test(k)) { if (f.u != null) out.session = f.u; if (f.r) out.sessionReset = f.r; }
      else if (/seven_day|weekly|week|7d|7_day/.test(k)) { if (f.u != null) out.weekly = f.u; if (f.r) out.weeklyReset = f.r; }
    }
    if (j && typeof j === 'object' && j.extra_usage && typeof j.extra_usage === 'object') out.extra = j.extra_usage;
    const ml = j && typeof j === 'object' && (j.message_limit || (j.type === 'message_limit' ? j : null));
    if (ml && typeof ml === 'object') {
      const t = String(ml.type || '');
      if (/exceed/i.test(t)) out.session = 1;
      const r = ms(ml.resetsAt || ml.resets_at); if (r) out.sessionReset = r;
      out.limitEvent = t || 'message_limit';
    }
    if (out.sessionReset && out.sessionReset - now > 6 * 3600e3) { if (!out.weeklyReset) out.weeklyReset = out.sessionReset; out.sessionReset = null; }
    return out;
  }

  const modelKey = (s) => { s = String(s || '').toLowerCase(); return /opus/.test(s) ? 'opus' : /haiku/.test(s) ? 'haiku' : /sonnet/.test(s) ? 'sonnet' : null; };

  // How many more messages fit in the current 5-hour window?
  // Learns from observed per-message deltas (samples) when it has them; otherwise uses a documented
  // baseline (≈45 average Sonnet messages per 5 h on Pro) scaled by model weight and chat size.
  function messagesLeft({ session, samples = [], ctx = 20000, model = 'sonnet', weights = DEFAULTS.modelWeights }) {
    if (session == null) return null;
    const remaining = Math.max(0, 1 - session);
    const w = weights[model] ?? 1;
    const ctxK = Math.max(5, (ctx || 20000) / 1000);
    const rel = samples.filter((s) => s && s.delta > 0 && s.ctx > 0).slice(-20).map((s) => s.delta / ((weights[s.model] ?? 1) * Math.max(5, s.ctx / 1000)));
    let perMsg, source;
    if (rel.length >= 2) { rel.sort((a, b) => a - b); perMsg = rel[Math.floor(rel.length / 2)] * w * ctxK; source = 'learned'; }
    else { perMsg = (1 / 45) * w * (ctxK / 20); source = 'estimate'; }
    perMsg = Math.min(0.5, Math.max(0.0015, perMsg));
    return { n: Math.floor(remaining / perMsg), perMsg, source, samples: rel.length };
  }

  // Weekly burn-rate projection from stored history samples [{t, w, wr}].
  function projectWeekly(history = [], now = Date.now()) {
    const pts = history.filter((h) => h && typeof h.w === 'number' && now - h.t < 72 * 3600e3 && h.t <= now);
    if (pts.length < 3) return null;
    let start = 0; for (let i = 1; i < pts.length; i++) if (pts[i].w < pts[i - 1].w - 0.25) start = i; // a reset happened
    const p = pts.slice(start); if (p.length < 3) return null;
    const t0 = p[0].t; const xs = p.map((h) => (h.t - t0) / 3600e3), ys = p.map((h) => h.w);
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (!den) return null;
    const slope = num / den; // fraction per hour
    const last = p[p.length - 1]; const reset = last.wr || null;
    if (slope <= 1e-5) return { pace: 'idle', slopePerDay: 0, reset, unusedAtReset: 1 - last.w, hitAt: null, before: false };
    const hoursToFull = (1 - last.w) / slope; const hitAt = last.t + hoursToFull * 3600e3;
    const before = reset ? hitAt < reset : null;
    const atReset = reset ? Math.min(1, last.w + slope * Math.max(0, (reset - last.t) / 3600e3)) : null;
    return { pace: 'active', slopePerDay: slope * 24, hitAt, reset, before, unusedAtReset: atReset == null ? null : Math.max(0, 1 - atReset) };
  }

  const pct = (f) => (f == null ? null : Math.max(0, Math.min(100, Math.round(f * 100))));
  function resetIn(at, now = Date.now()) {
    if (!at) return ''; const d = at - now; if (d <= 0) return 'resetting…';
    const dd = Math.floor(d / 86400e3), h = Math.floor((d % 86400e3) / 3600e3), m = Math.round((d % 3600e3) / 60e3);
    if (dd) return `${dd}d ${h}h`; if (h) return `${h}h ${m}m`; return `${m}m`;
  }
  const fmtWhen = (at) => { if (!at) return ''; const d = new Date(at); const sameDay = d.toDateString() === new Date().toDateString(); return (sameDay ? '' : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ') + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.round(n)));

  globalThis.WRUsage = { DEFAULTS, parseUsage, modelKey, messagesLeft, projectWeekly, pct, resetIn, fmtWhen, kfmt };
})();
