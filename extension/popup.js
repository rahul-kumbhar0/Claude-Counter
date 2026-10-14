// popup.js — the toolbar control center: usage, actions on the active claude.ai tab, prompts, settings, about.
(() => {
  'use strict';
  const { DEFAULTS, pct, resetIn, fmtWhen, projectWeekly, messagesLeft, kfmt } = globalThis.WRUsage;
  const $ = (s) => document.querySelector(s);
  const get = (k) => new Promise((r) => chrome.storage.local.get(k, r));
  const set = (o) => new Promise((r) => chrome.storage.local.set(o, r));
  const msg = (m) => new Promise((r) => { try { chrome.runtime.sendMessage(m, (x) => { void chrome.runtime.lastError; r(x); }); } catch { r(null); } });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const level = (p) => (p == null ? '' : p >= 95 ? 'hot' : p >= 80 ? 'warn' : p >= 50 ? 'mid' : '');
  const bar = (lab, p, v, sub) => `<div class="row"><span>${esc(lab)}</span><div class="track ${level(p)}"><span style="width:${p ?? 0}%"></span></div><b>${esc(v)}</b></div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`;
  $('#ver').textContent = chrome.runtime.getManifest().version;
  let tab = 'usage', S = { ...DEFAULTS }, tabState = null;

  function spark(c, history) {
    const g = c.getContext('2d'), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    const now = Date.now(), from = now - 7 * 86400e3; const pts = history.filter((h) => h.t > from);
    g.strokeStyle = 'rgba(128,128,128,.25)'; g.lineWidth = 1; for (let d = 1; d < 7; d++) { const x = d / 7 * (W - 4) + 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    const line = (key, color) => { const p = pts.filter((h) => h[key] != null); if (p.length < 2) return; g.beginPath(); g.strokeStyle = color; g.lineWidth = 2.5; p.forEach((h, i) => { const x = (h.t - from) / (now - from) * (W - 4) + 2, y = H - 4 - Math.min(1, h[key]) * (H - 14); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
    line('w', '#c45a3a'); line('s', '#3f7d5a');
    g.font = '12px Inter, sans-serif'; g.fillStyle = '#c45a3a'; g.fillText('weekly', 6, 13); g.fillStyle = '#3f7d5a'; g.fillText('5-hour', 56, 13); g.fillStyle = 'rgba(128,128,128,.9)'; g.fillText('last 7 days', W - 76, 13);
  }

  async function draw() {
    const { usage: u, usageError, history = [], settings = {}, prompts = [], jobStatus, samples = [] } = await get(['usage', 'usageError', 'history', 'settings', 'prompts', 'jobStatus', 'samples']);
    S = { ...DEFAULTS, ...settings };
    $('#upd').textContent = u && u.at ? 'updated ' + new Date(u.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'no data yet';
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const m = $('#main'); const stale = !u || !u.at || Date.now() - u.at > 15 * 60e3;
    if (tab === 'usage') {
      let h = (usageError && stale) ? `<div class="err">${esc(usageError)}</div>` : '';
      if (u) {
        h += `<h5>Your room right now</h5>` + bar('5-hour window', pct(u.session), pct(u.session) == null ? '—' : pct(u.session) + '%', u.sessionReset ? `resets in ${resetIn(u.sessionReset)} · ${fmtWhen(u.sessionReset)}` : '') + bar('Weekly limit', pct(u.weekly), pct(u.weekly) == null ? '—' : pct(u.weekly) + '%', u.weeklyReset ? `resets ${fmtWhen(u.weeklyReset)}` : '');
        if (S.showModels !== false) for (const k of ['opus', 'sonnet', 'haiku']) { const x = u.models && u.models[k]; if (x && x.u != null) h += bar(`Weekly · ${k[0].toUpperCase() + k.slice(1)}`, pct(x.u), pct(x.u) + '%'); }
        const ml = messagesLeft({ session: u.session, samples, ctx: tabState?.ctx?.tokens || 20000, model: (tabState?.model || 'sonnet').toLowerCase().split(' ')[0], weights: S.modelWeights });
        h += `<div class="stat2"><div><b>${ml ? '~' + ml.n : '—'}</b><span>messages left${ml && ml.source === 'learned' ? ' · learned' : ' · estimate'}${tabState?.model ? ' · ' + esc(tabState.model) : ''}</span></div><div><b>${tabState?.ctx?.tokens ? '~' + kfmt(tabState.ctx.tokens) : '—'}</b><span>this chat · of ${kfmt(S.ctxWindow)}</span></div></div>`;
      } else h += `<div class="tip">No usage yet. Open claude.ai once (signed in) and it fills in.</div>`;
      const pj = projectWeekly(history);
      h += `<h5>Weekly pace</h5><div class="mut" style="font-size:12.5px">${!pj ? 'Needs a few hours of readings — keep the extension installed and check back.' : pj.pace === 'idle' ? `Quiet lately. ${pj.unusedAtReset != null ? `About <b>${pct(pj.unusedAtReset)}%</b> would go unused at reset.` : ''}` : `Burning ≈<b>${pct(pj.slopePerDay)}% / day</b>. ${pj.before ? `<b>You hit the weekly cap ${fmtWhen(pj.hitAt)}</b>, before the reset (${fmtWhen(pj.reset)}). Spread heavy work out or use Sonnet for routine tasks.` : pj.reset ? `Reset comes first — about <b>${pct(pj.unusedAtReset)}%</b> would stay unused. Room to spare.` : `100% around ${fmtWhen(pj.hitAt)}.`}`}</div><canvas id="spark" width="740" height="112"></canvas>`;
      h += `<div class="grid" style="margin-top:10px"><button class="primary" id="open">Open Claude</button><button id="refresh">Refresh</button></div><div class="tiny" style="margin-top:8px">Percentages are Claude's own numbers. ~ figures are estimates.</div>`;
      m.innerHTML = h; spark($('#spark'), history);
      $('#open').onclick = () => msg({ type: 'open-claude' }); $('#refresh').onclick = async () => { $('#upd').textContent = 'refreshing…'; await msg({ type: 'refresh' }); draw(); };
    } else if (tab === 'actions') {
      const inChat = !!(tabState && (tabState.conv || tabState.code)); const has = !!tabState;
      const dis = (ok) => (ok ? '' : ' disabled');
      m.innerHTML = `${has ? '' : '<div class="tip">Open claude.ai in a tab to run these. They act on the active Claude tab.</div>'}${has && !inChat ? '<div class="tip">Open a chat (or a Claude Code session) in the Claude tab to enable chat actions.</div>' : ''}
        <h5>Start fresh</h5><div class="tiny" style="margin-bottom:4px">Summary of goal, decisions, latest code and recent messages → new chat.</div><div class="grid"><button class="primary" data-a="startFresh"${dis(inChat)}>✦ New chat</button><button data-a="startFreshProject"${dis(inChat)}>✦ Inside project</button></div>
        <h5>Carry to another AI</h5><div class="grid3"><button data-a="carryChatgpt"${dis(inChat)}>→ ChatGPT</button><button data-a="carryGemini"${dis(inChat)}>→ Gemini</button><button data-a="carryGrok"${dis(inChat)}>→ Grok</button></div><div class="grid" style="margin-top:6px"><button data-a="copySummary"${dis(inChat)}>Copy summary</button><button data-a="downloadMd"${dis(inChat)}>Download .md</button></div>
        <h5>Backup</h5><div class="grid"><button class="primary" data-a="exportChat"${dis(inChat)}>Export this chat</button><button data-a="exportAll"${dis(has)}>Export ALL chats</button><button data-a="exportCode"${dis(has)}>All Claude Code (web)</button><button id="local">Local Claude Code…</button></div>
        <div class="tiny" style="margin-top:6px">Saves as ZIP by default. To save into a folder (incremental), choose it once from ⋯ → Backup on claude.ai.</div>
        <button class="w" id="stop" style="display:${jobStatus && jobStatus.busy ? '' : 'none'}">Stop</button><div class="prog"><span id="pbar" style="width:${jobStatus && jobStatus.progress != null ? jobStatus.progress : 0}%"></span></div><div class="st" id="st">${jobStatus && Date.now() - (jobStatus.at || 0) < 3600e3 ? esc(jobStatus.text || '') : ''}</div>
        <h5>Bar</h5><div class="grid"><button id="show">${S.hidden ? 'Show the bar on claude.ai' : 'Hide the bar on claude.ai'}</button><button id="details">Open details panel</button></div>`;
      m.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => { $('#st').textContent = 'Working…'; const r = await msg({ type: 'tab-action', name: b.dataset.a }); if (!r || !r.ok) $('#st').textContent = '❌ ' + ((r && r.error) || 'Could not reach the Claude tab. Reload it and try again.'); }));
      $('#local').onclick = () => msg({ type: 'open-code' }); $('#stop').onclick = () => msg({ type: 'tab-action', name: 'stop' });
      $('#show').onclick = async () => { await set({ settings: { ...S, hidden: !S.hidden } }); draw(); }; $('#details').onclick = () => msg({ type: 'open-claude', then: 'details' });
    } else if (tab === 'prompts') {
      m.innerHTML = `<div class="tiny">Type <span class="kbd">//</span> in Claude's message box to insert one. <span class="kbd">{placeholders}</span> ask you for values.</div><input type="text" id="pName" placeholder="Name (e.g. Code review)"><textarea id="pBody" placeholder="Review this {language} code for {focus}. Be specific and list concrete fixes."></textarea><button class="sm" id="pAdd" style="margin-top:6px">Save prompt</button><div id="plist"></div>`;
      const list = () => { const box = $('#plist'); box.innerHTML = prompts.length ? '' : '<div class="tiny" style="margin-top:8px">No prompts yet.</div>'; prompts.forEach((p, i) => { const d = document.createElement('div'); d.className = 'pitem'; const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name; nm.title = p.body; const ed = document.createElement('button'); ed.className = 'sm'; ed.textContent = 'Edit'; ed.onclick = () => { $('#pName').value = p.name; $('#pBody').value = p.body; prompts.splice(i, 1); set({ prompts }).then(draw); }; const del = document.createElement('button'); del.className = 'sm'; del.textContent = '✕'; del.onclick = async () => { prompts.splice(i, 1); await set({ prompts }); draw(); }; d.append(nm, ed, del); box.appendChild(d); }); };
      $('#pAdd').onclick = async () => { const name = $('#pName').value.trim(), body = $('#pBody').value.trim(); if (!name || !body) return; prompts.unshift({ name, body }); await set({ prompts }); draw(); }; list();
    } else if (tab === 'settings') {
      const chk = (id, lab, on) => `<label class="opt"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${lab}</label>`;
      m.innerHTML = `<h5>Bar on claude.ai</h5><label class="opt">Position <select id="pos"><option value="dock"${S.position === 'dock' ? ' selected' : ''}>Under the message box</option><option value="float"${S.position === 'float' ? ' selected' : ''}>Floating, bottom-right</option></select></label>
        ${chk('compact', 'Compact (hide labels)', S.compact)}${chk('showSession', 'Show 5-hour window', S.showSession)}${chk('showWeekly', 'Show weekly limit', S.showWeekly)}${chk('showContext', "Show this chat's size", S.showContext)}${chk('showLeft', 'Show messages left', S.showLeft)}${chk('showModels', 'Show per-model weekly caps', S.showModels)}
        <h5>Alerts</h5>${chk('alerts', 'Warn me in the page at', S.alerts)}<div class="row" style="margin-left:22px"><input type="number" id="a1" min="1" max="99" value="${S.alertAt[0]}"><span style="width:auto">% and</span><input type="number" id="a2" min="1" max="100" value="${S.alertAt[1]}"><span style="width:auto">%</span></div>
        ${chk('resetNotify', 'Desktop notification when a window resets', S.resetNotify)}<label class="opt">Toolbar badge shows <select id="badge"><option value="session"${S.badge === 'session' ? ' selected' : ''}>5-hour %</option><option value="weekly"${S.badge === 'weekly' ? ' selected' : ''}>weekly %</option><option value="off"${S.badge === 'off' ? ' selected' : ''}>nothing</option></select></label>
        <h5>Estimates</h5><label class="opt">Context window <input type="number" id="ctxw" value="${S.ctxWindow}" step="1000" style="width:100px"> tokens</label><div class="row"><span style="width:auto">Opus cost ×</span><input type="number" id="wOpus" step="0.1" value="${S.modelWeights.opus}"><span style="width:auto">Haiku ×</span><input type="number" id="wHaiku" step="0.1" value="${S.modelWeights.haiku}"></div><div class="tiny">Sonnet = 1×. Only used until Wiggleroom has learned from your real messages.</div>
        <h5>Data</h5><div class="grid"><button id="clearSamples">Forget learned costs</button><button id="clearHistory">Clear usage history</button></div><div class="tiny" style="margin-top:6px">Everything lives in this browser's extension storage. Nothing is sent anywhere.</div>`;
      const upd = async () => { S = { ...S, position: $('#pos').value, compact: $('#compact').checked, showSession: $('#showSession').checked, showWeekly: $('#showWeekly').checked, showContext: $('#showContext').checked, showLeft: $('#showLeft').checked, showModels: $('#showModels').checked, alerts: $('#alerts').checked, alertAt: [Math.min(99, Math.max(1, +$('#a1').value || 80)), Math.min(100, Math.max(1, +$('#a2').value || 95))], resetNotify: $('#resetNotify').checked, badge: $('#badge').value, ctxWindow: Math.max(10000, +$('#ctxw').value || 200000), modelWeights: { opus: +$('#wOpus').value || 5, sonnet: 1, haiku: +$('#wHaiku').value || 0.2 } }; await set({ settings: S }); msg({ type: 'settings-changed' }); };
      m.querySelectorAll('input,select').forEach((el) => (el.onchange = upd));
      $('#clearSamples').onclick = async () => { await set({ samples: [] }); $('#clearSamples').textContent = 'Forgotten'; }; $('#clearHistory').onclick = async () => { await set({ history: [] }); $('#clearHistory').textContent = 'Cleared'; };
    } else {
      m.innerHTML = `<h5>Wiggleroom v${chrome.runtime.getManifest().version}</h5><p style="margin:0 0 8px">Know how much Claude you've got left. Keep every chat. Carry on anywhere. Free for everyone.</p>
        <h5>Shortcuts</h5><div class="tiny"><span class="kbd">Alt</span>+<span class="kbd">Shift</span>+<span class="kbd">W</span> show/hide the bar · <span class="kbd">Alt</span>+<span class="kbd">Shift</span>+<span class="kbd">F</span> start fresh · <span class="kbd">//</span> prompts · change at chrome://extensions/shortcuts</div>
        <h5>Privacy</h5><div class="tiny">Reads your own usage and chats in this browser with your existing login. Never sends anything to any server. Backups go only where you choose.</div>
        <h5>Links</h5><div class="tiny"><a href="https://wiggleroom-sigma.vercel.app" target="_blank">Website</a> · <a href="https://wiggleroom-sigma.vercel.app/privacy" target="_blank">Privacy policy</a> · <a href="https://github.com/rahul-kumbhar0/Claude-Counter" target="_blank">Source &amp; issues</a> · <a href="https://claude.ai/settings/usage" target="_blank">Claude's usage page</a></div>
        <div class="tiny" style="margin-top:12px">Independent tool, not affiliated with Anthropic, OpenAI, Google or xAI.</div>`;
    }
  }
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
  chrome.storage.onChanged.addListener((ch) => { if (ch.jobStatus && tab === 'actions') { const j = ch.jobStatus.newValue || {}; const st = $('#st'), pb = $('#pbar'), stop = $('#stop'); if (st && j.text) st.textContent = j.text; if (pb && j.progress != null) pb.style.width = j.progress + '%'; if (stop) stop.style.display = j.busy ? '' : 'none'; return; } if (ch.usage || ch.history || ch.prompts || ch.settings || ch.samples) draw(); });
  (async () => { tabState = await msg({ type: 'tab-state' }); await draw(); msg({ type: 'refresh' }).then(() => draw()); })();
})();
