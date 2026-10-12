// hook.js — runs in the page's MAIN world at document_start.
// It only *observes* claude.ai's own network traffic (fetch / EventSource) so the content script can:
//   • capture usage / limit payloads the page already receives,
//   • know when a message is sent and when the reply finishes (to learn real per-message cost),
//   • mirror Claude Code web session events for backup.
// It never sends requests of its own and never modifies responses.
(() => {
  if (window.__wrHook) return; window.__wrHook = true;
  const SESS = /\/v1\/(?:code\/)?sessions\/|\/v1\/session_ingress\//;
  const COMPLETION = /\/chat_conversations\/([0-9a-f-]{36})\/(?:completion|retry_completion)/i;
  const USAGE_HINT = /message_limit|utilization|five_hour|seven_day|resets_at|extra_usage|"limits"/i;
  const buf = [];
  const send = (kind, url, data) => { const m = { __wr: 1, kind, url, data }; if (kind === 'sess' && buf.length < 5000) buf.push(m); try { window.postMessage(m, location.origin); } catch {} };
  window.addEventListener('message', (e) => { if (e.source === window && e.data && e.data.__wrDump === 1) for (const m of buf) window.postMessage(m, location.origin); });
  const parseNd = (t) => t.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const scanUsage = (obj) => { try { const s = JSON.stringify(obj); if (s && s.length < 200000 && USAGE_HINT.test(s)) send('usage', '', obj); } catch {} };
  const readSSE = async (res, url, isSess, conv) => {
    try {
      const rd = res.body.getReader(), dec = new TextDecoder(); let b = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        b += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n'); let i;
        while ((i = b.indexOf('\n\n')) >= 0) {
          const fr = b.slice(0, i); b = b.slice(i + 2);
          const data = fr.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
          if (!data) continue; let j; try { j = JSON.parse(data); } catch { continue; }
          if (isSess) send('sess', url, j);
          if (j && (j.type === 'message_limit' || j.message_limit)) send('usage', url, j); else scanUsage(j);
        }
      }
    } catch {}
    if (conv) send('turn', url, { phase: 'end', conv });
  };
  const of = window.fetch;
  window.fetch = async function (...a) {
    const x = a[0], init = a[1] || {}; const url = typeof x === 'string' ? x : (x && x.url) || String(x);
    const cm = COMPLETION.exec(url); let model = null;
    if (cm) { try { if (typeof init.body === 'string') model = JSON.parse(init.body).model || null; } catch {} send('turn', url, { phase: 'start', conv: cm[1], model }); }
    let res;
    try { res = await of.apply(this, a); } catch (e) { if (cm) send('turn', url, { phase: 'error', conv: cm[1] }); throw e; }
    try {
      const isSess = SESS.test(url); const ct = res.headers.get('content-type') || '';
      if (ct.includes('event-stream')) readSSE(res.clone(), url, isSess, cm ? cm[1] : null);
      else if (cm) send('turn', url, { phase: 'end', conv: cm[1] });
      else if (ct.includes('ndjson')) { if (isSess) res.clone().text().then((t) => send('sess', url, parseNd(t))).catch(() => {}); }
      else if (ct.includes('json') && /claude\.ai|^\//.test(url)) res.clone().json().then((j) => { if (isSess) send('sess', url, j); if (/\/usage\b/.test(url)) send('usage', url, j); else scanUsage(j); }).catch(() => {});
    } catch {}
    return res;
  };
  const OES = window.EventSource;
  if (OES) window.EventSource = class extends OES {
    constructor(u, c) { super(u, c); const s = String(u);
      const h = (ev) => { let j; try { j = JSON.parse(ev.data); } catch { return; } if (SESS.test(s)) send('sess', s, j); scanUsage(j); };
      this.addEventListener('message', h); this.addEventListener('client_event', h); }
  };
})();
