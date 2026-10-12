// popup.js — toolbar popup: usage from any tab, weekly pace, quick actions.
(() => {
  'use strict';
  const { pct, resetIn, fmtWhen, projectWeekly } = globalThis.WRUsage;
  const $ = (s) => document.querySelector(s);
  const get = (k) => new Promise((r) => chrome.storage.local.get(k, r));
  const level = (p) => (p == null ? '' : p >= 95 ? 'hot' : p >= 80 ? 'warn' : p >= 50 ? 'mid' : '');
  $('#ver').textContent = chrome.runtime.getManifest().version;
  function bar(t, v, r, val, reset, resetText) { const p = pct(val); $(t).className = 'track ' + level(p); $(t).querySelector('span').style.width = (p ?? 0) + '%'; $(v).textContent = p == null ? '—' : p + '%'; $(r).textContent = reset ? resetText : ''; }
  function spark(history) {
    const c = $('#spark'), g = c.getContext('2d'), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    const now = Date.now(), from = now - 7 * 86400e3; const pts = history.filter((h) => h.t > from);
    g.strokeStyle = 'rgba(128,128,128,.25)'; g.lineWidth = 1; for (let d = 1; d < 7; d++) { const x = d / 7 * (W - 4) + 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    const line = (key, color) => { const p = pts.filter((h) => h[key] != null); if (p.length < 2) return; g.beginPath(); g.strokeStyle = color; g.lineWidth = 2.5; p.forEach((h, i) => { const x = (h.t - from) / (now - from) * (W - 4) + 2, y = H - 4 - Math.min(1, h[key]) * (H - 14); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
    line('w', '#c45a3a'); line('s', '#3f7d5a');
    g.font = '12px Inter, sans-serif'; g.fillStyle = '#c45a3a'; g.fillText('weekly', 6, 13); g.fillStyle = '#3f7d5a'; g.fillText('5-hour', 56, 13); g.fillStyle = 'rgba(128,128,128,.9)'; g.fillText('last 7 days', W - 76, 13);
  }
  async function draw() {
    const { usage: u, usageError, history = [], settings = {} } = await get(['usage', 'usageError', 'history', 'settings']);
    $('#err').hidden = !usageError || !!(u && u.at && Date.now() - u.at < 15 * 60e3); $('#err').textContent = usageError || '';
    if (u) {
      $('#upd').textContent = u.at ? 'updated ' + new Date(u.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      bar('#tS', '#vS', '#rS', u.session, u.sessionReset, u.sessionReset ? `resets in ${resetIn(u.sessionReset)} · ${fmtWhen(u.sessionReset)}` : '');
      bar('#tW', '#vW', '#rW', u.weekly, u.weeklyReset, u.weeklyReset ? `resets ${fmtWhen(u.weeklyReset)}` : '');
      const m = $('#models'); m.innerHTML = '';
      if (settings.showModels !== false) for (const k of ['opus', 'sonnet', 'haiku']) { const x = u.models && u.models[k]; if (!x || x.u == null) continue; const p = pct(x.u); m.insertAdjacentHTML('beforeend', `<div class="row"><span>Weekly · ${k[0].toUpperCase() + k.slice(1)}</span><div class="track ${level(p)}"><span style="width:${p}%"></span></div><b>${p}%</b></div>`); }
    } else $('#upd').textContent = 'no data yet';
    const pj = projectWeekly(history);
    $('#pace').innerHTML = !pj ? '<span class="mut">Needs a few hours of readings — keep the extension installed and check back.</span>' : pj.pace === 'idle' ? `Quiet lately. ${pj.unusedAtReset != null ? `About <b>${pct(pj.unusedAtReset)}%</b> would go unused at reset.` : ''}` : `Burning ≈<b>${pct(pj.slopePerDay)}% / day</b>. ${pj.before ? `<b>You hit the weekly cap ${fmtWhen(pj.hitAt)}</b>, before the reset (${fmtWhen(pj.reset)}).` : pj.reset ? `Reset comes first — about <b>${pct(pj.unusedAtReset)}%</b> would stay unused. Room to spare.` : `100% around ${fmtWhen(pj.hitAt)}.`}`;
    spark(history);
  }
  $('#open').onclick = () => chrome.runtime.sendMessage({ type: 'open-claude' });
  $('#refresh').onclick = async () => { $('#upd').textContent = 'refreshing…'; await new Promise((r) => chrome.runtime.sendMessage({ type: 'refresh' }, r)); draw(); };
  $('#backup').onclick = () => chrome.runtime.sendMessage({ type: 'open-claude', then: 'backup' });
  $('#local').onclick = () => chrome.runtime.sendMessage({ type: 'open-code' });
  $('#show').onclick = async () => { const { settings = {} } = await get('settings'); await new Promise((r) => chrome.storage.local.set({ settings: { ...settings, hidden: false } }, r)); chrome.runtime.sendMessage({ type: 'open-claude', then: 'show' }); };
  chrome.storage.onChanged.addListener(() => draw());
  draw(); chrome.runtime.sendMessage({ type: 'refresh' }, () => draw());
})();
