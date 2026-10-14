// content.js — Wiggleroom on claude.ai.
// Live meter under the message box · alerts · "Start fresh" handoff · carry to ChatGPT/Gemini/Grok ·
// backup menu · prompt library · settings. Everything runs locally in this tab.
(() => {
  'use strict';
  if (window.__wrLoaded) return; window.__wrLoaded = true;

  const C = globalThis.CCE, Tok = globalThis.CCETok, U = globalThis.WRUsage, X = globalThis.WR.exporter;
  const { sleep, safe, fence, saveBlob, trunc, toText } = C;
  const { DEFAULTS, parseUsage, modelKey, messagesLeft, projectWeekly, pct, resetIn, fmtWhen, kfmt } = U;

  /* ================= storage (chrome.storage.local — shared with popup, background, other sites) ================= */
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; } };
  const sget = (k) => new Promise((r) => { try { chrome.storage.local.get(k, (v) => r(v ? (typeof k === 'string' ? v[k] : v) : undefined)); } catch { r(undefined); } });
  const sset = (o) => new Promise((r) => { try { chrome.storage.local.set(o, r); } catch { r(); } });
  const msg = (m) => new Promise((r) => { try { chrome.runtime.sendMessage(m, (x) => { void chrome.runtime.lastError; r(x); }); } catch { r(null); } });
  const timers = []; const every = (fn, ms) => timers.push(setInterval(() => { if (!alive()) { teardown(); return; } try { fn(); } catch (e) { console.debug('[Wiggleroom]', e); } }, ms));
  function teardown() { timers.forEach(clearInterval); timers.length = 0; try { host && host.remove(); } catch {} window.__wrLoaded = false; }
  let S = { ...DEFAULTS };
  async function loadSettings() { S = { ...DEFAULTS, ...((await sget('settings')) || {}) }; }
  async function saveSettings(patch) { S = { ...S, ...patch }; await sset({ settings: S }); msg({ type: 'settings-changed' }); render(); }

  /* ================= usage state ================= */
  let usage = { session: null, weekly: null, sessionReset: null, weeklyReset: null, models: {}, extra: null, at: 0 };
  let samples = [];            // learned per-message cost: [{delta, ctx, model, t}]
  let lastPush = 0;
  function merge(u) {
    for (const k of ['session', 'weekly', 'sessionReset', 'weeklyReset', 'extra']) if (u[k] != null) usage[k] = u[k];
    if (u.models) for (const m of Object.keys(u.models)) if (u.models[m]) usage.models[m] = { ...(usage.models[m] || {}), ...u.models[m] };
    if (u.limitEvent) usage.limitEvent = u.limitEvent;
    const past = Date.now() - 120e3; if (usage.sessionReset && usage.sessionReset < past) usage.sessionReset = null; if (usage.weeklyReset && usage.weeklyReset < past) usage.weeklyReset = null;
    usage.at = Date.now();
  }
  function ingest(j, source = 'page') {
    try {
      const u = parseUsage(j);
      if (u.session == null && u.weekly == null && !Object.keys(u.models).length && !u.limitEvent) return;
      merge(u); render(); checkAlerts();
      if (Date.now() - lastPush > 8000) { lastPush = Date.now(); msg({ type: 'usage', usage: { ...usage, source } }); }
    } catch {}
  }
  async function fetchUsage() {
    if (document.hidden && usage.at && Date.now() - usage.at < 10 * 60e3) return false;
    try { const org = await X.getOrgId(); const j = await X.api(`/api/organizations/${org}/usage`); ingest(j, 'page'); return true; }
    catch (e) { console.debug('[Wiggleroom] usage fetch failed', e && e.message); return false; }
  }

  /* ================= model + context size ================= */
  const convId = () => (location.pathname.match(/\/chat\/([0-9a-f-]{36})/i) || [])[1] || null;
  let model = { key: 'sonnet', name: 'Sonnet', from: 'default' };
  // "claude-opus-4-5-20251101" → "Opus 4.5", "Sonnet 4.5" → "Sonnet 4.5"
  function modelLabel(str) { const k = modelKey(str) || 'sonnet'; const v = (String(str || '').toLowerCase().match(/(?:opus|sonnet|haiku)[- ]?(\d+)(?:[-.](\d+))?/) || []); return k[0].toUpperCase() + k.slice(1) + (v[1] ? ' ' + v[1] + (v[2] && v[2].length < 3 ? '.' + v[2] : '') : ''); }
  function detectModelFromDom() {
    try {
      const card = composerCard(); const ctrls = [...(card ? card.querySelectorAll('button,[role="button"],[data-testid*="model"]') : []), ...document.querySelectorAll('[data-testid*="model"]')];
      const txt = ctrls.map((b) => b.innerText || b.textContent || '').join(' | ');
      const m = txt.match(/\b(Opus|Sonnet|Haiku)\b[^|\n]{0,12}/i);
      if (m && model.from !== 'request') model = { key: modelKey(m[1]), name: modelLabel(m[0]), from: 'dom' };
    } catch {}
  }
  let ctx = { tokens: 0, chat: 0, project: 0, files: 0, at: 0, conv: null };
  let ctxPending = null;
  async function refreshContext(force = false) {
    const id = convId();
    if (!force && (document.hidden || (ctx.conv === id && Date.now() - ctx.at < 60000))) return ctx;
    if (ctxPending) return ctxPending;
    ctxPending = (async () => {
      const est = (t) => (Tok ? Tok.estimate(t || '') : Math.round((t || '').length / 4));
      const out = { tokens: 0, chat: 0, project: 0, files: 0, at: Date.now(), conv: id };
      try {
        if (id) {
          const org = await X.getOrgId(); const conv = await X.getConv(org, id);
          for (const m of X.activeBranch(conv)) {
            for (const b of (Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.text || '' }])) {
              if (b.type === 'text') out.chat += est(b.text); else if (b.type === 'thinking') out.chat += Math.round(est(b.thinking) * 0.15);
              else if (b.type === 'tool_use') out.chat += est(JSON.stringify(b.input || {})); else if (b.type === 'tool_result') out.chat += est(toText(b.content));
            }
            for (const a of m.attachments || []) out.files += a.extracted_content ? est(a.extracted_content) : 800;
            for (const f of [...(m.files_v2 || []), ...(m.files || [])]) out.files += /image/i.test(f.file_kind || f.kind || f.file_type || '') ? 1500 : 2500;
          }
          const pid = conv.project_uuid || conv.project?.uuid;
          if (pid) { try { const p = await X.api(`/api/organizations/${org}/projects/${pid}`); out.project += est(p.prompt_template || ''); const docs = await X.api(`/api/organizations/${org}/projects/${pid}/docs`); if (Array.isArray(docs)) for (const d of docs) out.project += est(d.content || ''); } catch {} }
          if (conv.model && model.from === 'default') model = { key: modelKey(conv.model) || model.key, name: modelLabel(conv.model), from: 'conv' };
        }
      } catch {}
      out.tokens = out.chat + out.project + out.files + est(composerText());
      ctx = out; ctxPending = null; render(); return out;
    })();
    return ctxPending;
  }

  /* ================= learn real per-message cost from turn start/end ================= */
  let turn = null;
  async function onTurn(d) {
    if (d.phase === 'start') {
      if (d.model) model = { key: modelKey(d.model) || model.key, name: modelLabel(d.model), from: 'request' };
      turn = { conv: d.conv, pre: usage.session, reset: usage.sessionReset, ctx: ctx.tokens || 0, model: model.key, t: Date.now() };
      return;
    }
    if (d.phase === 'end') {
      await sleep(2500); await fetchUsage(); await refreshContext(true);
      if (turn && turn.pre != null && usage.session != null && usage.sessionReset === turn.reset) {
        const delta = usage.session - turn.pre;
        if (delta > 0 && delta < 0.5) { samples.push({ delta, ctx: Math.max(1000, turn.ctx), model: turn.model, t: Date.now() }); samples = samples.slice(-40); sset({ samples }); }
      }
      turn = null; render();
    }
    if (d.phase === 'error') turn = null;
  }

  /* ================= alerts ================= */
  let alerted = {};
  async function checkAlerts() {
    if (!S.alerts) return;
    const levels = (S.alertAt || [80, 95]).slice().sort((a, b) => a - b);
    const fire = async (kind, v, reset0) => {
      const p = pct(v); if (p == null) return; const reset = reset0 || 'b' + Math.floor(Date.now() / (kind === 'session' ? 5 * 3600e3 : 7 * 86400e3));
      for (const lv of levels) { const key = `${kind}:${reset || 'x'}:${lv}`; if (p >= lv && !alerted[key]) { alerted[key] = Date.now(); await sset({ alerted }); toast(kind === 'session' ? `${p}% of your 5-hour window used${reset ? ` · resets in ${resetIn(reset)}` : ''}. Long chat? ✦ Start fresh keeps context for far less usage.` : `${p}% of your weekly limit used${reset ? ` · resets ${fmtWhen(reset)}` : ''}. Consider moving heavy work to a fresh chat or another AI.`, 7000); } }
      if (p >= 100) { const key = `${kind}:${reset || 'x'}:full`; if (!alerted[key]) { alerted[key] = Date.now(); await sset({ alerted }); toast(kind === 'session' ? `5-hour limit reached${reset ? ` · back at ${fmtWhen(reset)}` : ''}. Carry this chat to ChatGPT / Gemini / Grok from the ⋯ menu.` : `Weekly limit reached${reset ? ` · back ${fmtWhen(reset)}` : ''}.`, 9000); } }
    };
    await fire('session', usage.session, usage.sessionReset); await fire('weekly', usage.weekly, usage.weeklyReset);
    // tidy: drop alert keys older than 8 days
    const cutoff = Date.now() - 8 * 86400e3; let changed = false; for (const k of Object.keys(alerted)) if (alerted[k] < cutoff) { delete alerted[k]; changed = true; } if (changed) sset({ alerted });
  }

  /* ================= composer helpers ================= */
  const findComposer = () => document.querySelector('div[contenteditable="true"].ProseMirror') || document.querySelector('div[contenteditable="true"][data-placeholder]') || document.querySelector('fieldset div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
  const composerText = () => { const el = findComposer(); return el ? (el.tagName === 'TEXTAREA' ? el.value : el.innerText || '') : ''; };
  // the visual "card" around the composer: walk up while the parent is barely wider than the child
  let cardCache = { el: null, card: null, at: 0 };
  function composerCard() {
    const el = findComposer(); if (!el) return null;
    if (cardCache.el === el && cardCache.card && cardCache.card.isConnected && Date.now() - cardCache.at < 5000) return cardCache.card;
    const er = el.getBoundingClientRect(); let node = el, best = el, boxed = null;
    for (let i = 0; i < 10 && node.parentElement && node.parentElement !== document.body; i++) {
      const p = node.parentElement, pr = p.getBoundingClientRect();
      if (pr.width - er.width > 160 || pr.height > 520 || pr.width < er.width) break;
      try { const cs = getComputedStyle(p); const hasBox = (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') || (cs.boxShadow && cs.boxShadow !== 'none') || (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) && p.tagName !== 'FORM'); if (hasBox) boxed = p; } catch {}
      node = p; best = p;
    }
    const card = boxed || best; cardCache = { el, card, at: Date.now() }; return card;
  }
  function insertText(text) {
    const el = findComposer(); if (!el) return false; el.focus();
    if (el.tagName === 'TEXTAREA') { const s = el.selectionStart ?? el.value.length; el.value = el.value.slice(0, s) + text + el.value.slice(s); el.selectionStart = el.selectionEnd = s + text.length; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }
    try { const dt = new DataTransfer(); dt.setData('text/plain', text); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); const before = el.innerText.length; el.dispatchEvent(ev); if (el.innerText.length > before) return true; } catch {}
    let ok = false; try { ok = document.execCommand('insertText', false, text); } catch {}
    if (!ok) { const sel = window.getSelection(); if (sel && sel.rangeCount) { const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(document.createTextNode(text)); sel.collapseToEnd(); } el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })); }
    return true;
  }

  /* ================= "Start fresh" summary + carry to another AI ================= */
  const msgText = (m) => { const c = Array.isArray(m.content) ? m.content : []; return c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || m.text || ''; };
  async function loadConv() { const id = convId(); if (!id) throw new Error('Open a chat first.'); const org = await X.getOrgId(); const conv = await X.getConv(org, id); return { org, conv, branch: X.activeBranch(conv) }; }
  async function buildSummary() {
    const { conv, branch } = await loadConv();
    const L = [`# Continuing: ${conv.name || 'previous chat'}`, '', 'This continues an earlier Claude conversation. Context so we can keep going without re-sending the whole history:', ''];
    const firstHuman = branch.find((m) => m.sender === 'human');
    if (firstHuman) L.push('## Original goal', trunc(msgText(firstHuman), 700), '');
    // decisions / facts: bullet-ish lines from the last 12 assistant messages
    const bullets = []; for (const m of branch.filter((m) => m.sender === 'assistant').slice(-12)) for (const line of msgText(m).split('\n')) { const t = line.trim(); if (/^([-*•]|\d+[.)])\s+\S/.test(t) && t.length > 12 && t.length < 220) bullets.push(t.replace(/^([-*•]|\d+[.)])\s+/, '')); }
    if (bullets.length) L.push('## Key points & decisions so far', ...[...new Set(bullets)].slice(-14).map((b) => '- ' + b), '');
    const arts = new Map(); for (const m of branch) for (const b of (Array.isArray(m.content) ? m.content : [])) if (b.type === 'tool_use' && b.name === 'artifacts' && b.input?.id) X.applyArtifact(arts, b.input);
    if (arts.size) { L.push('## Latest artifacts / code (final versions)', ''); for (const a of [...arts.values()].slice(-4)) L.push(`### ${a.title || a.id}`, fence(trunc(a.content, 4000).replace(/ …$/, '\n…'), a.language || ''), ''); }
    const tail = branch.slice(-6); L.push('## Most recent messages', '');
    for (const m of tail) { const who = m.sender === 'human' ? 'Me' : 'Claude'; const t = trunc(msgText(m).replace(/\n{3,}/g, '\n\n'), m === tail[tail.length - 1] ? 2500 : 1200); if (t) L.push(`**${who}:** ${t}`, ''); }
    L.push('---', 'Please pick up from here. Ask me to confirm anything important before continuing.');
    return { text: L.join('\n'), conv };
  }
  async function fullChatMarkdown() {
    const { conv, branch } = await loadConv();
    const L = [`# ${conv.name || 'Claude conversation'}`, '']; const text = (m) => { let out = msgText(m); for (const b of (Array.isArray(m.content) ? m.content : [])) if (b.type === 'tool_use' && b.name === 'artifacts' && b.input?.content) out += `\n\n[Artifact: ${b.input.title || b.input.id}]\n` + fence(b.input.content, b.input.language || ''); return out; };
    for (const m of branch) { const who = m.sender === 'human' ? 'User' : 'Claude'; const t = text(m).trim(); if (t) L.push(`## ${who}`, t, ''); }
    return { name: safe(conv.name || 'claude-chat', 60), md: L.join('\n') };
  }
  async function startFresh(st, where = 'new') {
    st('Building a summary of this chat…'); const { text, conv } = await buildSummary();
    await sset({ pendingSummary: { text, at: Date.now() } });
    try { await navigator.clipboard.writeText(text); } catch {}
    const pid = conv.project_uuid || conv.project?.uuid;
    const url = where === 'project' && pid ? `https://claude.ai/project/${pid}` : 'https://claude.ai/new';
    st('✅ Summary ready (also copied). Opening a new chat — review it, then press send.'); await sleep(600); location.href = url;
  }
  const AI = { chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' }, gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' }, grok: { name: 'Grok', url: 'https://grok.com/' } };
  async function carryTo(target, st) {
    const t = AI[target]; if (!t) return; st(`Preparing for ${t.name}…`);
    const { text } = await buildSummary(); const { name, md } = await fullChatMarkdown();
    saveBlob(new Blob([md], { type: 'text/markdown' }), `${name} - for ${t.name}.md`);
    const intro = `I'm continuing a conversation I had with Claude. Here's a summary; I've also attached the full conversation as a Markdown file for complete context.\n\n${text}`;
    try { await navigator.clipboard.writeText(intro); } catch {}
    await sset({ pendingSummary: null, pendingMove: { target, intro, at: Date.now() } });
    st(`✅ Opening ${t.name}. The summary fills the box (and is copied). Attach the downloaded .md file for full context.`); await sleep(300); const ok = await msg({ type: 'open-url', url: t.url }); if (!ok) window.open(t.url, '_blank');
  }
  async function maybeFillPending() {
    try {
      const p = await sget('pendingSummary'); if (!p || !p.text || Date.now() - p.at > 10 * 60e3) return;
      if (!/^\/(new)?$|^\/chat\/?$|^\/project\//.test(location.pathname)) return;
      for (let i = 0; i < 60; i++) { if (findComposer()) break; await sleep(250); }
      if (findComposer()) { await sleep(300); insertText(p.text); await sset({ pendingSummary: null }); toast('Summary inserted — review it, then press send.'); }
    } catch {}
  }

  /* ================= prompt library (type // in the box) ================= */
  let prompts = [];
  async function loadPrompts() { prompts = (await sget('prompts')) || []; if (!prompts.length) { try { const old = await X.kvGet('prompts'); if (Array.isArray(old) && old.length) { prompts = old; await sset({ prompts }); } } catch {} } }
  function fillVariables(body) { const vars = [...new Set((body.match(/\{([a-z0-9_ -]{1,40})\}/gi) || []).map((v) => v.slice(1, -1)))]; for (const v of vars) { const val = prompt(`Value for “${v}”:`, ''); if (val == null) return null; body = body.split(`{${v}}`).join(val); } return body; }
  let menu = null; const closeMenu = () => { if (menu) { document.removeEventListener('keydown', menu._key, true); menu.remove(); menu = null; } };
  function openMenu() {
    if (!prompts.length) { toast('No saved prompts yet — add some from ⋯ → Prompts.'); return; }
    closeMenu(); const el = findComposer(); if (!el) return; const rect = el.getBoundingClientRect(); ensureHost();
    menu = document.createElement('div'); menu.className = 'pmenu card'; menu.style.cssText = `left:${Math.round(rect.left)}px;bottom:${Math.round(window.innerHeight - rect.top + 8)}px`;
    menu.innerHTML = `<div class="ch">Insert prompt — type to filter · ↑↓ · Enter · Esc</div><div class="plist"></div>`;
    const list = menu.querySelector('.plist'); let filter = '', sel = 0;
    const render = () => { const items = prompts.filter((p) => (p.name + ' ' + p.body).toLowerCase().includes(filter.toLowerCase())); menu._items = items; list.innerHTML = ''; if (!items.length) { list.innerHTML = '<div class="empty">No match</div>'; return; } sel = Math.min(sel, items.length - 1); items.forEach((p, i) => { const row = document.createElement('div'); row.className = 'prow' + (i === sel ? ' on' : ''); row.innerHTML = `<div class="nm"></div><div class="bd"></div>`; row.querySelector('.nm').textContent = p.name; row.querySelector('.bd').textContent = p.body.slice(0, 90); row.onmouseenter = () => { sel = i; render(); }; row.onclick = () => choose(p); list.appendChild(row); }); };
    const choose = (p) => { closeMenu(); const el2 = findComposer(); const b = fillVariables(p.body); if (b == null) return;
      if (el2 && el2.tagName === 'TEXTAREA') { el2.value = el2.value.replace(/\/\/$/, ''); el2.dispatchEvent(new Event('input', { bubbles: true })); }
      else if (el2) { try { el2.focus(); const sel = window.getSelection(); if (sel && /\/\/$/.test(el2.innerText)) { sel.modify('extend', 'backward', 'character'); sel.modify('extend', 'backward', 'character'); if (sel.toString() === '//') document.execCommand('delete'); else sel.collapseToEnd(); } } catch {} }
      insertText(b); };
    menu._key = (e) => { if (e.key === 'Escape') { closeMenu(); return; } if (e.key === 'ArrowDown') { sel++; e.preventDefault(); render(); return; } if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); e.preventDefault(); render(); return; } if (e.key === 'Enter' && menu._items && menu._items[sel]) { e.preventDefault(); e.stopPropagation(); choose(menu._items[sel]); return; } if (e.key === 'Backspace') { filter = filter.slice(0, -1); render(); return; } if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { filter += e.key; render(); } };
    document.addEventListener('keydown', menu._key, true); render(); shadow.appendChild(menu);
  }
  document.addEventListener('input', (e) => { const el = e.target; if (!el || !(el.matches?.('[contenteditable="true"]') || el.tagName === 'TEXTAREA')) return; const text = el.tagName === 'TEXTAREA' ? el.value : el.textContent; if (/\/\/$/.test(text || '')) openMenu(); else if (menu && !/\/\//.test(text || '')) closeMenu(); }, true);
  document.addEventListener('click', (e) => { if (menu && !e.composedPath().includes(menu)) closeMenu(); }, true);

  /* ================= UI ================= */
  let host = null, shadow = null, busy = false;
  const $ = (s) => shadow && shadow.querySelector(s);
  const STYLE = `<style>
  :host{all:initial}*{box-sizing:border-box;font-family:Inter,-apple-system,"Segoe UI",Roboto,sans-serif}
  :host{--bg:#fffdf8;--fg:#1a1916;--mut:#726f67;--line:#e9e4da;--card:#fffdf8;--acc:#c45a3a;--acc2:#e07a52;--soft:#f6f2ea;--ok:#3f7d5a;--warn:#b5751a;--hot:#c0392b}
  @media(prefers-color-scheme:dark){:host{--bg:#1e1d1a;--fg:#ece9e2;--mut:#9a968c;--line:#34322c;--card:#1e1d1a;--soft:#171614}}
  :host([data-theme=dark]){--bg:#1e1d1a;--fg:#ece9e2;--mut:#9a968c;--line:#34322c;--card:#1e1d1a;--soft:#171614}
  .bar{position:fixed;z-index:2147483000;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 28px rgba(50,30,15,.14);display:flex;align-items:center;gap:12px;padding:7px 10px;font-size:12px;line-height:1.25;transition:opacity .2s;max-width:100vw}
  .bar.float{right:16px;bottom:16px;left:auto;width:auto!important;max-width:calc(100vw - 32px)}.bar{overflow:hidden}
  .bar.compact .lab{display:none}.bar.compact .stat{min-width:0}.bar.compact .track{width:48px}
  .stat{display:flex;flex-direction:column;gap:3px;min-width:118px;cursor:pointer;flex:1 1 auto}.stat:hover .lab{color:var(--fg)}
  .lab{color:var(--mut);font-size:10.5px;letter-spacing:.02em;white-space:nowrap}.val{font-weight:700;font-size:12px;white-space:nowrap;display:flex;gap:5px;align-items:baseline}.val small{font-weight:500;color:var(--mut)}
  .track{height:5px;border-radius:4px;background:var(--line);overflow:hidden}.track>span{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#4caf6a,#2e8b57);transition:width .4s}
  .track.warn>span{background:linear-gradient(90deg,#e0a048,#b5751a)}.track.hot>span{background:linear-gradient(90deg,#e06a55,#c0392b)}.track.mid>span{background:linear-gradient(90deg,var(--acc2),var(--acc))}
  .grow{flex:1 1 0}
  .btn{border:1px solid var(--line);background:var(--soft);color:var(--fg);border-radius:9px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
  .btn:hover{border-color:var(--acc)}.btn.hot{border-color:var(--acc);color:var(--acc)}.btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}.btn.icon{padding:6px 8px}.btn.sm{padding:4px 8px;font-size:11.5px}.btn.w{width:100%;justify-content:center;margin-top:6px}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:none;box-shadow:0 0 0 0 rgba(63,125,90,.5);animation:p 2s ease-out infinite}.dot.off{background:var(--mut);animation:none}
  @keyframes p{0%{box-shadow:0 0 0 0 rgba(63,125,90,.5)}70%{box-shadow:0 0 0 6px rgba(63,125,90,0)}100%{box-shadow:0 0 0 0 rgba(63,125,90,0)}}
  .card{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:14px;box-shadow:0 14px 44px rgba(50,30,15,.22);overflow:hidden}
  .panel{position:fixed;z-index:2147483500;width:380px;max-width:calc(100vw - 24px);max-height:min(72vh,640px);display:flex;flex-direction:column}
  .ph{display:flex;align-items:center;gap:4px;padding:8px 8px 0;border-bottom:1px solid var(--line)}
  .tab{border:none;background:none;color:var(--mut);font-weight:600;font-size:12px;padding:7px 9px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}.tab.on{color:var(--acc);border-color:var(--acc)}
  .ph .x{margin-left:auto;border:none;background:none;color:var(--mut);font-size:16px;cursor:pointer;padding:2px 6px}
  .pb{overflow:auto;flex:1;min-height:0;padding:12px 14px;font-size:12.5px;line-height:1.5}.pb h5{margin:10px 0 6px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}.pb h5:first-child{margin-top:0}.pb p{margin:0 0 8px}.mut{color:var(--mut)}.tiny{font-size:11px;color:var(--mut)}
  .row{display:flex;align-items:center;gap:8px;margin:5px 0}.row>span:first-child{width:120px;color:var(--mut);flex:none}.row .track{flex:1;height:8px}.row b{width:58px;text-align:right}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
  .tip{background:var(--soft);border:1px solid var(--line);border-radius:9px;padding:8px 10px;margin:8px 0;font-size:12px}
  .opt{display:flex;gap:8px;align-items:center;margin:6px 0;cursor:pointer}.opt input{margin:0}
  input[type=text],input[type=number],textarea,select{width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--soft);color:inherit;font:12.5px inherit;margin-top:5px}textarea{min-height:60px;resize:vertical;font-family:ui-monospace,Menlo,monospace}
  .pitem{display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:9px;padding:6px 9px;margin-top:6px}.pitem .nm{flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .st{padding:8px 0 0;font-size:11.5px;color:var(--mut);word-break:break-word}.prog{height:4px;background:var(--line);border-radius:3px;overflow:hidden;margin-top:8px}.prog>span{display:block;height:100%;width:0;background:var(--acc)}
  .pmenu{position:fixed;z-index:2147483600;width:320px;max-height:280px;overflow:auto}.ch{padding:8px 12px;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)}
  .prow{padding:7px 12px;cursor:pointer;border-top:1px solid var(--line)}.prow.on{background:rgba(196,90,58,.14)}.prow .nm{font-weight:600;font-size:12.5px}.prow .bd{color:var(--mut);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.empty{padding:10px 12px;color:var(--mut)}
  .toast{position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:2147483646;background:#201d19;color:#faf8f3;font-size:12.5px;padding:10px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:min(560px,calc(100vw - 32px))}
  .kbd{font-family:ui-monospace,Menlo,monospace;background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:11px}
  .spark{width:100%;height:46px;display:block}
  </style>`;
  const MARKUP = `
  <div class="bar" id="bar" hidden>
    <span class="dot" id="dot" title="Wiggleroom is reading Claude's usage"></span>
    <div class="stat" data-k="session" id="sSession"><span class="lab">5-hour window</span><div class="track"><span></span></div><span class="val"><span class="v">—</span><small class="r"></small></span></div>
    <div class="stat" data-k="weekly" id="sWeekly"><span class="lab">Weekly limit</span><div class="track"><span></span></div><span class="val"><span class="v">—</span><small class="r"></small></span></div>
    <div class="stat" data-k="ctx" id="sCtx"><span class="lab">This chat</span><div class="track"><span></span></div><span class="val"><span class="v">—</span><small class="r"></small></span></div>
    <div class="stat" data-k="left" id="sLeft" style="min-width:92px"><span class="lab">Messages left</span><span class="val" style="margin-top:4px"><span class="v">—</span><small class="r"></small></span></div>
    <div class="grow"></div>
    <button class="btn hot" id="fresh" title="Continue in a new chat with a summary (Alt+Shift+F)">✦ Start fresh</button>
    <button class="btn icon" id="more" title="Carry, backup, prompts, settings">⋯</button>
  </div>
  <div class="card panel" id="panel" hidden>
    <div class="ph">
      <button class="tab on" data-t="details">Details</button><button class="tab" data-t="carry">Carry</button><button class="tab" data-t="backup">Backup</button><button class="tab" data-t="prompts">Prompts</button><button class="tab" data-t="settings">Settings</button>
      <button class="x" id="close" title="Close">✕</button>
    </div>
    <div class="pb" id="pb"></div>
  </div>`;

  function ensureHost() {
    if (host && host.isConnected) return;
    if (!host) { host = document.createElement('div'); host.id = 'wiggleroom-host'; shadow = host.attachShadow({ mode: 'open' }); shadow.innerHTML = STYLE + MARKUP; wire(); }
    (document.body || document.documentElement).appendChild(host);
  }
  function toast(msg, ms = 4000) { ensureHost(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; shadow.appendChild(t); setTimeout(() => t.remove(), ms); }

  const level = (p) => (p == null ? '' : p >= 95 ? 'hot' : p >= 80 ? 'warn' : p >= 50 ? 'mid' : '');
  function setStat(id, p, v, r, show) { const el = $(id); if (!el) return; el.style.display = show ? '' : 'none'; const tr = el.querySelector('.track'); if (tr) { tr.className = 'track ' + level(p); tr.querySelector('span').style.width = (p ?? 0) + '%'; } el.querySelector('.v').textContent = v; el.querySelector('.r').textContent = r || ''; }
  function heavy() { const cp = ctx.tokens / S.ctxWindow * 100; return cp > 50 || (usage.session != null && usage.session > 0.7) || (usage.weekly != null && usage.weekly > 0.75); }
  function render() {
    if (!shadow) return; const bar = $('#bar'); if (!bar) return;
    bar.hidden = !!S.hidden; bar.classList.toggle('compact', !!S.compact); bar.classList.toggle('float', S.position === 'float');
    const sp = pct(usage.session), wp = pct(usage.weekly);
    setStat('#sSession', sp, sp == null ? '—' : sp + '%', usage.sessionReset ? '· resets ' + resetIn(usage.sessionReset) : '', S.showSession);
    setStat('#sWeekly', wp, wp == null ? '—' : wp + '%', usage.weeklyReset ? '· resets ' + fmtWhen(usage.weeklyReset) : '', S.showWeekly);
    const cp = Math.min(100, Math.round(ctx.tokens / S.ctxWindow * 100));
    setStat('#sCtx', cp, ctx.tokens ? '~' + kfmt(ctx.tokens) : '—', ctx.tokens ? '/ ' + kfmt(S.ctxWindow) : '', S.showContext);
    const ml = messagesLeft({ session: usage.session, samples, ctx: ctx.tokens, model: model.key, weights: S.modelWeights });
    setStat('#sLeft', null, ml ? '~' + ml.n : '—', ml ? `(${model.name}${ml.source === 'learned' ? ' · learned' : ''})` : '', S.showLeft);
    $('#dot').classList.toggle('off', !usage.at || Date.now() - usage.at > 10 * 60e3);
    $('#fresh').classList.toggle('primary', heavy()); $('#fresh').style.display = convId() ? '' : 'none';
    if (cp > 85 && !window.__wrNudged && convId()) { window.__wrNudged = true; toast('This chat is getting long — every message now re-sends ~' + kfmt(ctx.tokens) + ' tokens. ✦ Start fresh keeps your context for a fraction of the usage.', 7000); }
    place();
  }
  function place() {
    if (!shadow) return; const bar = $('#bar'), panel = $('#panel'); if (!bar || bar.hidden) return;
    if (S.position === 'float') { bar.style.left = bar.style.top = bar.style.width = ''; }
    else {
      const card = composerCard(); const r = card && card.getBoundingClientRect();
      if (!r || r.width < 300 || r.top < 0 || r.top > window.innerHeight) { bar.classList.add('float'); bar.style.left = bar.style.top = bar.style.width = ''; }
      else {
        bar.classList.remove('float'); const h = bar.offsetHeight || 52; const below = r.bottom + 6 + h <= window.innerHeight - 4;
        bar.style.left = Math.round(r.left) + 'px'; bar.style.width = Math.round(r.width) + 'px';
        bar.style.top = Math.round(below ? r.bottom + 6 : Math.max(4, r.top - h - 8)) + 'px';
        bar.classList.toggle('above', !below); bar.classList.toggle('compact', !!S.compact || r.width < 640);
      }
    }
    if (!panel.hidden) { const br = bar.getBoundingClientRect(); const above = br.top > window.innerHeight / 2; panel.style.left = Math.max(12, Math.min(window.innerWidth - 392, br.right - 380)) + 'px'; if (above) { panel.style.bottom = Math.max(12, window.innerHeight - br.top + 8) + 'px'; panel.style.top = ''; panel.style.maxHeight = Math.min(640, br.top - 24) + 'px'; } else { panel.style.top = Math.round(br.bottom + 8) + 'px'; panel.style.bottom = ''; panel.style.maxHeight = Math.min(640, window.innerHeight - br.bottom - 24) + 'px'; } }
  }

  /* ---- panel ---- */
  let tab = 'details';
  function openPanel(t) { ensureHost(); if (t) tab = t; const p = $('#panel'); p.hidden = false; shadow.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.t === tab)); drawPanel(); place(); }
  function closePanel() { if (shadow) $('#panel').hidden = true; }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bar = (lab, p, v) => `<div class="row"><span>${esc(lab)}</span><div class="track ${level(p)}"><span style="width:${p ?? 0}%"></span></div><b>${esc(v)}</b></div>`;
  let drawSeq = 0;
  async function drawPanel() {
    const pb = $('#pb'); if (!pb) return; const my = ++drawSeq; const stale = () => my !== drawSeq;
    if (tab === 'details') {
      const sp = pct(usage.session), wp = pct(usage.weekly);
      const ml = messagesLeft({ session: usage.session, samples, ctx: ctx.tokens, model: model.key, weights: S.modelWeights });
      const history = (await sget('history')) || []; const pj = projectWeekly(history);
      let html = `<h5>Your room right now</h5>` + bar('5-hour window', sp, sp == null ? '—' : sp + '%') + (usage.sessionReset ? `<div class="tiny" style="margin:-2px 0 6px 128px">resets in ${resetIn(usage.sessionReset)} (${fmtWhen(usage.sessionReset)})</div>` : '') + bar('Weekly limit', wp, wp == null ? '—' : wp + '%') + (usage.weeklyReset ? `<div class="tiny" style="margin:-2px 0 6px 128px">resets ${fmtWhen(usage.weeklyReset)}</div>` : '');
      for (const m of ['opus', 'sonnet', 'haiku']) { const x = usage.models[m]; if (x && x.u != null && S.showModels) html += bar(`Weekly · ${m[0].toUpperCase() + m.slice(1)}`, pct(x.u), pct(x.u) + '%'); }
      if (usage.extra && typeof usage.extra === 'object') { const e = usage.extra; const spent = e.used_credits ?? e.spent ?? e.used ?? e.amount; const lim = e.monthly_limit ?? e.limit ?? e.cap; if (spent != null) html += `<div class="tiny">Extra usage: ${esc(String(spent))}${lim != null ? ' / ' + esc(String(lim)) : ''}</div>`; }
      html += `<h5>Messages left in this window</h5><p><b>~${ml ? ml.n : '—'}</b> more messages like your last ones on <b>${esc(model.name)}</b>. ${ml && ml.source === 'learned' ? `Learned from ${ml.samples} of your real messages.` : 'Estimate until Wiggleroom has watched a couple of your messages — it learns your real cost per message.'} Opus costs ≈${S.modelWeights.opus}× Sonnet; long chats cost more per message.</p>`;
      html += `<h5>What this chat re-sends every message</h5>` + bar('Conversation', Math.round(ctx.chat / Math.max(1, ctx.tokens) * 100), '~' + kfmt(ctx.chat)) + (ctx.project ? bar('Project knowledge', Math.round(ctx.project / Math.max(1, ctx.tokens) * 100), '~' + kfmt(ctx.project)) : '') + (ctx.files ? bar('Files & attachments', Math.round(ctx.files / Math.max(1, ctx.tokens) * 100), '~' + kfmt(ctx.files)) : '') + `<div class="tiny">≈${kfmt(ctx.tokens)} of ${kfmt(S.ctxWindow)} context. ${ctx.project > ctx.chat ? 'Project knowledge is the biggest share — trimming it frees usage on every message.' : ctx.tokens > S.ctxWindow * 0.5 ? 'Over half the window: Claude will start forgetting the top and each message costs more. ✦ Start fresh.' : 'Healthy.'}</div>`;
      html += `<h5>Weekly pace</h5>` + (pj ? (pj.pace === 'idle' ? `<p>No weekly usage movement in the last days. ${pj.unusedAtReset != null ? `About ${pct(pj.unusedAtReset)}% would go unused at reset.` : ''}</p>` : `<p>Burning ≈<b>${pct(pj.slopePerDay)}% per day</b>. ${pj.before ? `<b>On this pace you hit the weekly cap ${fmtWhen(pj.hitAt)}</b>, before it resets ${fmtWhen(pj.reset)}. Spread heavy work out or use Sonnet for routine tasks.` : pj.reset ? `You'd reach 100% ${fmtWhen(pj.hitAt)} — after the reset, so about ${pct(pj.unusedAtReset)}% stays unused. Room to spare.` : `You'd reach 100% ${fmtWhen(pj.hitAt)}.`}</p>`) : `<p class="mut">Needs a few hours of readings — check back later.</p>`) + `<canvas class="spark" id="spark" width="700" height="92"></canvas>`;
      html += `<h5>Why do I hit limits?</h5><p class="mut">Claude counts <b>two windows at once</b>: a rolling 5-hour window and a weekly cap (plus per-model weekly caps on some plans). Every message re-sends the whole chat, so a long conversation can burn 10× what a short one does. Peak hours can drain the 5-hour window faster.</p><div class="tiny">Updated ${usage.at ? new Date(usage.at).toLocaleTimeString() : 'never'} · <a href="#" id="refresh" style="color:var(--acc)">refresh</a> · <a href="https://claude.ai/settings/usage" target="_blank" style="color:var(--acc)">Claude's usage page</a></div>`;
      if (stale()) return; pb.innerHTML = html; $('#refresh').onclick = (e) => { e.preventDefault(); fetchUsage().then(() => refreshContext(true)).then(drawPanel); }; drawSpark(history);
    } else if (tab === 'carry') {
      const inChat = !!convId();
      pb.innerHTML = `<h5>Start fresh in Claude</h5><p class="mut">Builds a summary (goal, decisions, latest code, recent messages), opens a new chat and drops it into the box. Keeps your context, costs a fraction per message.</p>
        <button class="btn primary w" id="cFresh"${inChat ? '' : ' disabled'}>✦ Start fresh in a new chat</button><button class="btn w" id="cFreshProj"${inChat ? '' : ' disabled'}>✦ Start fresh inside this project</button>
        <h5>Carry to another AI</h5><p class="mut">When Claude is out of room: summary is typed into the other AI's box, and the full chat downloads as Markdown so you can attach it. Nothing is uploaded by Wiggleroom.</p>
        <div class="grid3"><button class="btn" data-ai="chatgpt"${inChat ? '' : ' disabled'}>→ ChatGPT</button><button class="btn" data-ai="gemini"${inChat ? '' : ' disabled'}>→ Gemini</button><button class="btn" data-ai="grok"${inChat ? '' : ' disabled'}>→ Grok</button></div>
        <h5>Just the text</h5><div class="grid2"><button class="btn" id="cCopy"${inChat ? '' : ' disabled'}>Copy summary</button><button class="btn" id="cMd"${inChat ? '' : ' disabled'}>Download chat .md</button></div>
        ${inChat ? '' : '<div class="tip">Open a chat to use these.</div>'}<div class="st" id="cst"></div>`;
      const st = (t) => { $('#cst').textContent = t; };
      $('#cFresh').onclick = () => run((s) => startFresh(s, 'new'), st); $('#cFreshProj').onclick = () => run((s) => startFresh(s, 'project'), st);
      pb.querySelectorAll('[data-ai]').forEach((b) => (b.onclick = () => run((s) => carryTo(b.dataset.ai, s), st)));
      $('#cCopy').onclick = () => run(async (s) => { const { text } = await buildSummary(); await navigator.clipboard.writeText(text); s('✅ Summary copied.'); }, st);
      $('#cMd').onclick = () => run(async (s) => { const { name, md } = await fullChatMarkdown(); saveBlob(new Blob([md], { type: 'text/markdown' }), `${name}.md`); s('✅ Downloaded.'); }, st);
    } else if (tab === 'backup') {
      const mode = (await X.kvGet('mode')) || 'zip'; const dir = await X.kvGet('dir'); if (stale()) return;
      pb.innerHTML = `<h5>Save to</h5><label class="opt"><input type="radio" name="m" id="mZip"${mode !== 'folder' ? ' checked' : ''}> ZIP download</label><label class="opt"><input type="radio" name="m" id="mFolder"${mode === 'folder' ? ' checked' : ''}> Folder on this computer <span class="tiny">(incremental, skips unchanged)</span></label>
        <div class="row" style="margin-left:22px"><button class="btn sm" id="pick">Choose folder…</button><span class="tiny" id="fname">${esc(dir ? dir.name : 'No folder chosen')}</span></div>
        <h5>Back up</h5><button class="btn primary w" id="one">${X.isCodePage() ? 'Export this Claude Code session' : 'Export this chat'}</button><button class="btn w" id="all">Export ALL chats</button><button class="btn w" id="allCode">Export ALL Claude Code (web) sessions</button><button class="btn w" id="local">Local Claude Code sessions (terminal / IDE)…</button><button class="btn w" id="stop" hidden>Stop</button>
        <div class="prog"><span></span></div><div class="st" id="bst">Each chat becomes a folder: conversation.html + .md + .json, artifacts (every version), code blocks, files, project knowledge.</div>`;
      const st = (t) => { $('#bst').textContent = t; }; st.progress = (i, n) => { $('.prog>span').style.width = Math.round((i / Math.max(1, n)) * 100) + '%'; };
      $('#mZip').onchange = () => X.kvSet('mode', 'zip'); $('#mFolder').onchange = () => X.kvSet('mode', 'folder');
      $('#pick').onclick = async () => { try { const h = await X.pickFolder(); await X.kvSet('mode', 'folder'); $('#mFolder').checked = true; $('#fname').textContent = h.name; } catch (e) { if (e.name !== 'AbortError') st('❌ ' + e.message); } };
      $('#one').onclick = () => run(X.isCodePage() ? X.exportCurrentCode : X.exportCurrentChat, st); $('#all').onclick = () => run(X.exportAllChats, st); $('#allCode').onclick = () => run(X.exportAllCode, st);
      $('#local').onclick = () => chrome.runtime.sendMessage({ type: 'open-code' }); $('#stop').onclick = () => { X.cancel(); st('Stopping…'); };
    } else if (tab === 'prompts') {
      pb.innerHTML = `<p class="mut">Type <span class="kbd">//</span> in Claude's message box to insert a saved prompt. Use <span class="kbd">{placeholders}</span> to be asked for values.</p><input type="text" id="pName" placeholder="Name (e.g. Code review)"><textarea id="pBody" placeholder="Review this {language} code for {focus}. Be specific and list concrete fixes."></textarea><button class="btn sm" id="pAdd" style="margin-top:6px">Save prompt</button><div id="plist"></div>`;
      const list = () => { const box = $('#plist'); box.innerHTML = ''; prompts.forEach((p, i) => { const d = document.createElement('div'); d.className = 'pitem'; const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name; nm.title = p.body; const ins = document.createElement('button'); ins.className = 'btn sm'; ins.textContent = 'Insert'; ins.onclick = () => { const b = fillVariables(p.body); if (b != null) insertText(b); }; const del = document.createElement('button'); del.className = 'btn sm'; del.textContent = '✕'; del.onclick = async () => { prompts.splice(i, 1); await sset({ prompts }); list(); }; d.append(nm, ins, del); box.appendChild(d); }); if (!prompts.length) box.innerHTML = '<div class="tiny" style="margin-top:8px">No prompts yet.</div>'; };
      $('#pAdd').onclick = async () => { const name = $('#pName').value.trim(), body = $('#pBody').value.trim(); if (!name || !body) return toast('Give the prompt a name and a body.'); prompts.unshift({ name, body }); await sset({ prompts }); $('#pName').value = ''; $('#pBody').value = ''; list(); }; list();
    } else if (tab === 'settings') {
      const chk = (id, lab, on) => `<label class="opt"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${lab}</label>`;
      pb.innerHTML = `<h5>Bar</h5><label class="opt">Position <select id="pos" style="margin:0;width:auto"><option value="dock"${S.position === 'dock' ? ' selected' : ''}>Under the message box</option><option value="float"${S.position === 'float' ? ' selected' : ''}>Floating, bottom-right</option></select></label>
        ${chk('compact', 'Compact (hide labels)', S.compact)}${chk('showSession', 'Show 5-hour window', S.showSession)}${chk('showWeekly', 'Show weekly limit', S.showWeekly)}${chk('showContext', 'Show this chat\'s size', S.showContext)}${chk('showLeft', 'Show messages left', S.showLeft)}${chk('showModels', 'Show per-model weekly caps (when Claude reports them)', S.showModels)}
        <h5>Alerts</h5>${chk('alerts', 'Warn me in the page at these levels:', S.alerts)}<div class="row" style="margin-left:22px"><input type="number" id="a1" min="1" max="99" value="${S.alertAt[0]}" style="width:70px;margin:0"><span>% and</span><input type="number" id="a2" min="1" max="100" value="${S.alertAt[1]}" style="width:70px;margin:0"><span>%</span></div>
        ${chk('resetNotify', 'Desktop notification when a window resets', S.resetNotify)}<label class="opt">Toolbar badge shows <select id="badge" style="margin:0;width:auto"><option value="session"${S.badge === 'session' ? ' selected' : ''}>5-hour %</option><option value="weekly"${S.badge === 'weekly' ? ' selected' : ''}>weekly %</option><option value="off"${S.badge === 'off' ? ' selected' : ''}>nothing</option></select></label>
        <h5>Estimates</h5><label class="opt">Context window <input type="number" id="ctxw" value="${S.ctxWindow}" step="1000" style="width:110px;margin:0"> tokens</label><div class="row"><span>Opus cost ×</span><input type="number" id="wOpus" step="0.1" value="${S.modelWeights.opus}" style="width:70px;margin:0"><span style="width:auto">Haiku ×</span><input type="number" id="wHaiku" step="0.1" value="${S.modelWeights.haiku}" style="width:70px;margin:0"></div><div class="tiny">Sonnet = 1×. Only used until Wiggleroom has learned from your real messages.</div>
        <h5>Shortcuts</h5><div class="tiny"><span class="kbd">Alt</span>+<span class="kbd">Shift</span>+<span class="kbd">W</span> show/hide bar · <span class="kbd">Alt</span>+<span class="kbd">Shift</span>+<span class="kbd">F</span> start fresh · <span class="kbd">//</span> prompts. Change in chrome://extensions/shortcuts.</div>
        <button class="btn w" id="hide">Hide the bar on this site (toolbar icon brings it back)</button><div class="tiny" style="margin-top:8px">Wiggleroom v${chrome.runtime.getManifest().version} · everything stays on this computer.</div>`;
      const upd = () => saveSettings({ position: $('#pos').value, compact: $('#compact').checked, showSession: $('#showSession').checked, showWeekly: $('#showWeekly').checked, showContext: $('#showContext').checked, showLeft: $('#showLeft').checked, showModels: $('#showModels').checked, alerts: $('#alerts').checked, alertAt: [Math.min(99, Math.max(1, +$('#a1').value || 80)), Math.min(100, Math.max(1, +$('#a2').value || 95))], resetNotify: $('#resetNotify').checked, badge: $('#badge').value, ctxWindow: Math.max(10000, +$('#ctxw').value || 200000), modelWeights: { opus: +$('#wOpus').value || 5, sonnet: 1, haiku: +$('#wHaiku').value || 0.2 } });
      pb.querySelectorAll('input,select').forEach((el) => (el.onchange = upd)); $('#hide').onclick = () => { saveSettings({ hidden: true }); closePanel(); toast('Bar hidden. Click the Wiggleroom toolbar icon or press Alt+Shift+W to bring it back.'); };
    }
  }
  function drawSpark(history) {
    const c = $('#spark'); if (!c) return; const g = c.getContext('2d'); const W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    const now = Date.now(), from = now - 7 * 86400e3; const pts = history.filter((h) => h.t > from && (h.w != null || h.s != null));
    const line = (key, color) => { const p = pts.filter((h) => h[key] != null); if (p.length < 2) return; g.beginPath(); g.strokeStyle = color; g.lineWidth = 2; p.forEach((h, i) => { const x = (h.t - from) / (now - from) * (W - 4) + 2, y = H - 4 - Math.min(1, h[key]) * (H - 10); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
    g.strokeStyle = 'rgba(128,128,128,.25)'; g.lineWidth = 1; for (let d = 1; d < 7; d++) { const x = d / 7 * (W - 4) + 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    line('w', '#c45a3a'); line('s', '#3f7d5a');
    g.fillStyle = 'rgba(128,128,128,.9)'; g.font = '11px Inter, sans-serif'; g.fillText('weekly', 6, 12); g.fillStyle = '#3f7d5a'; g.fillText('5-hour', 52, 12); g.fillStyle = 'rgba(128,128,128,.9)'; g.fillText('last 7 days', W - 70, 12);
  }
  async function run(fn, st) { if (busy) return toast('Something is already running.'); busy = true; X.reset(); const stop = $('#stop'); if (stop) stop.hidden = false; try { await fn(st); } catch (e) { console.error('[Wiggleroom]', e); st('❌ ' + (e.message || e)); } finally { busy = false; X.reset(); if (stop && stop.isConnected) stop.hidden = true; } }
  // actions the toolbar popup can trigger in this tab; progress is mirrored to storage (jobStatus)
  const jobStatus = (text, progress) => { sset({ jobStatus: { text, progress: progress ?? null, at: Date.now(), busy } }); const e = $('#bst') || $('#cst'); if (e && e.isConnected) e.textContent = text; };
  jobStatus.progress = (i, n) => { sset({ jobStatus: { text: '', progress: Math.round((i / Math.max(1, n)) * 100), at: Date.now(), busy: true } }); const pr = $('.prog>span'); if (pr) pr.style.width = Math.round((i / Math.max(1, n)) * 100) + '%'; };
  const ACTIONS = {
    startFresh: (st) => startFresh(st, 'new'), startFreshProject: (st) => startFresh(st, 'project'),
    carryChatgpt: (st) => carryTo('chatgpt', st), carryGemini: (st) => carryTo('gemini', st), carryGrok: (st) => carryTo('grok', st),
    copySummary: async (st) => { const { text } = await buildSummary(); await navigator.clipboard.writeText(text); st('✅ Summary copied.'); },
    downloadMd: async (st) => { const { name, md } = await fullChatMarkdown(); saveBlob(new Blob([md], { type: 'text/markdown' }), `${name}.md`); st('✅ Downloaded.'); },
    exportChat: (st) => (X.isCodePage() ? X.exportCurrentCode : X.exportCurrentChat)(st), exportAll: X.exportAllChats, exportCode: X.exportAllCode,
    stop: async (st) => { X.cancel(); st('Stopping…'); },
  };
  async function runAction(name) { const fn = ACTIONS[name]; if (!fn) return false; if (name === 'stop') { await fn(jobStatus); return true; } jobStatus('Starting…'); await run(fn, jobStatus); const last = (await sget('jobStatus')) || {}; await sset({ jobStatus: { ...last, busy: false, at: Date.now() } }); return true; }

  function wire() {
    $('#fresh').onclick = () => { openPanel('carry'); run((s) => startFresh(s, 'new'), (t) => { const e = $('#cst'); if (e) e.textContent = t; else toast(t); }); };
    $('#more').onclick = () => { const p = $('#panel'); p.hidden ? openPanel('details') : closePanel(); };
    $('#close').onclick = closePanel;
    shadow.querySelectorAll('.stat').forEach((s) => (s.onclick = () => openPanel('details')));
    shadow.querySelectorAll('.tab').forEach((b) => (b.onclick = () => openPanel(b.dataset.t)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shadow && !$('#panel').hidden) closePanel(); });
  }

  /* ================= messages: hook (page) + background/popup ================= */
  window.addEventListener('message', (e) => { if (e.source !== window || !e.data || e.data.__wr !== 1) return; if (e.data.kind === 'usage') ingest(e.data.data, 'page'); else if (e.data.kind === 'turn') onTurn(e.data.data || {}); });
  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (!m || !m.wr) return;
    ensureHost();
    if (m.wr === 'toggle') saveSettings({ hidden: !S.hidden });
    else if (m.wr === 'show') saveSettings({ hidden: false });
    else if (m.wr === 'start-fresh') $('#fresh').click();
    else if (m.wr === 'backup') { saveSettings({ hidden: false }); openPanel('backup'); }
    else if (m.wr === 'details') { saveSettings({ hidden: false }); openPanel('details'); }
    else if (m.wr === 'action') { runAction(m.name).then((ok) => reply && reply(ok)); return true; }
    else if (m.wr === 'state') { reply && reply({ conv: convId(), code: X.isCodePage(), model: model.name, ctx, usage }); return; }
    reply && reply(true);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.settings && ch.settings.newValue) { S = { ...DEFAULTS, ...ch.settings.newValue }; render(); }
    if (ch.usage && ch.usage.newValue && ch.usage.newValue.source === 'background' && ch.usage.newValue.at > (usage.at || 0)) { merge(ch.usage.newValue); render(); }
  });

  /* ================= boot ================= */
  (async () => {
    await loadSettings(); samples = (await sget('samples')) || []; alerted = (await sget('alerted')) || {}; await loadPrompts();
    const stored = await sget('usage'); if (stored && stored.at) merge(stored);
    ensureHost(); render();
    fetchUsage(); every(fetchUsage, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { fetchUsage(); refreshContext(false); } });
    every(() => { ensureHost(); detectModelFromDom(); render(); }, 1500);
    every(() => refreshContext(false), 30000); refreshContext(true);
    let lastPath = location.pathname; every(() => { if (location.pathname !== lastPath) { lastPath = location.pathname; window.__wrNudged = false; cardCache.at = 0; refreshContext(true); maybeFillPending(); } }, 700);
    let raf = 0; const onMove = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); };
    window.addEventListener('resize', onMove, { passive: true }); window.addEventListener('scroll', onMove, { passive: true, capture: true });
    try { const ro = new ResizeObserver(onMove); const watch = () => { const c = composerCard(); if (c && c !== ro._el) { if (ro._el) ro.unobserve(ro._el); ro.observe(c); ro._el = c; } }; watch(); every(watch, 2000); } catch {}
    try { new MutationObserver(onMove).observe(document.body, { childList: true, subtree: false }); } catch {}
    setTimeout(maybeFillPending, 1200);
  })();
})();
