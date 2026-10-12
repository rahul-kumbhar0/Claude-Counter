// filler.js — runs on ChatGPT / Gemini / Grok. If the user chose "Carry to …" on claude.ai,
// the summary is waiting in chrome.storage (shared across sites) and gets typed into the box.
(() => {
  'use strict';
  const host = location.hostname;
  const target = /chatgpt|openai/.test(host) ? 'chatgpt' : /gemini/.test(host) ? 'gemini' : /grok/.test(host) ? 'grok' : null;
  if (!target || !chrome.storage) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = () => document.querySelector('#prompt-textarea') || document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
  function insert(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') { const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); return; }
    let ok = false; try { ok = document.execCommand('insertText', false, text); } catch {}
    if (!ok) { el.textContent = text; el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })); }
  }
  function toast(msg) { const t = document.createElement('div'); t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:2147483647;background:#201d19;color:#faf8f3;font:13px -apple-system,Segoe UI,sans-serif;padding:10px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.3)'; document.body.appendChild(t); setTimeout(() => t.remove(), 6000); }
  (async () => {
    const { pendingMove } = await new Promise((r) => chrome.storage.local.get('pendingMove', r));
    if (!pendingMove || pendingMove.target !== target || Date.now() - (pendingMove.at || 0) > 10 * 60e3) return;
    for (let i = 0; i < 80; i++) { if (box()) break; await sleep(300); }
    const el = box(); if (!el) return;
    insert(el, pendingMove.intro);
    await new Promise((r) => chrome.storage.local.set({ pendingMove: null }, r));
    toast('Wiggleroom: summary added. Attach the downloaded Markdown file for full context, then send.');
  })();
})();
