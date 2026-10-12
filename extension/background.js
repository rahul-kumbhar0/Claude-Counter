// background.js — Wiggleroom service worker.
// Polls Claude's usage endpoint (so the toolbar badge + popup work from any tab), keeps a usage
// history for burn-rate projections, fires reset notifications, and relays keyboard commands.
'use strict';

importScripts('usage.js');
const { DEFAULTS, parseUsage } = globalThis.WRUsage;

const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
const set = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));

async function settings() { const { settings } = await get('settings'); return { ...DEFAULTS, ...(settings || {}) }; }

/* ---------- usage fetch (works without a claude.ai tab thanks to host_permissions) ---------- */
async function orgId() {
  const { lastOrg } = await get('lastOrg');
  if (lastOrg) return lastOrg;
  const res = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
  if (!res.ok) throw new Error('orgs ' + res.status);
  const orgs = await res.json();
  const o = (Array.isArray(orgs) ? orgs : []).find((x) => (x.capabilities || []).includes('chat')) || orgs[0];
  if (!o) throw new Error('no org');
  await set({ lastOrg: o.uuid });
  return o.uuid;
}

async function fetchUsage() {
  const org = await orgId();
  const res = await fetch(`https://claude.ai/api/organizations/${org}/usage`, { credentials: 'include', headers: { accept: 'application/json' } });
  if (res.status === 403 || res.status === 401) { await set({ lastOrg: null }); throw new Error('logged-out'); }
  if (!res.ok) throw new Error('usage ' + res.status);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('not-json');
  return parseUsage(await res.json());
}

/* ---------- history (for burn-rate projection) ---------- */
async function recordHistory(u) {
  if (u.session == null && u.weekly == null) return;
  const { history = [] } = await get('history');
  const last = history[history.length - 1];
  if (last && Date.now() - last.t < 4 * 60e3 && last.s === u.session && last.w === u.weekly) return; // nothing new
  history.push({ t: Date.now(), s: u.session, w: u.weekly, sr: u.sessionReset, wr: u.weeklyReset });
  while (history.length > 4000) history.shift();
  await set({ history });
}

/* ---------- badge + reset alarms ---------- */
async function applyUsage(u, source) {
  const prev = (await get('usage')).usage || {};
  // merge: keep whichever field is fresher / present
  const merged = { ...prev, ...Object.fromEntries(Object.entries(u).filter(([, v]) => v != null && !(typeof v === 'object' && !Object.keys(v).length))), at: Date.now(), source };
  await set({ usage: merged, usageError: null });
  await recordHistory(merged);
  await updateBadge(merged);
  await scheduleResets(merged);
  return merged;
}

async function updateBadge(u) {
  const s = await settings();
  try {
    if (s.badge === 'off') { await chrome.action.setBadgeText({ text: '' }); return; }
    const v = s.badge === 'weekly' ? u.weekly : u.session;
    if (v == null) { await chrome.action.setBadgeText({ text: '' }); return; }
    const pct = Math.round(Math.min(1, v) * 100);
    await chrome.action.setBadgeText({ text: pct >= 100 ? 'FULL' : String(pct) });
    await chrome.action.setBadgeBackgroundColor({ color: pct >= 95 ? '#c0392b' : pct >= 80 ? '#b5751a' : '#3f7d5a' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } catch {}
}

async function scheduleResets(u) {
  const s = await settings();
  for (const [name, when] of [['reset:session', u.sessionReset], ['reset:weekly', u.weeklyReset]]) {
    await chrome.alarms.clear(name);
    if (s.resetNotify && when && when > Date.now() + 5000) chrome.alarms.create(name, { when: when + 15000 });
  }
}

async function poll(reason) {
  try { const u = await fetchUsage(); await applyUsage(u, 'background'); }
  catch (e) {
    const msg = e && e.message === 'logged-out' ? 'Sign in to claude.ai to see your usage.' : 'Could not read usage right now (' + (e && e.message) + ').';
    await set({ usageError: msg });
    if (e && e.message === 'logged-out') { try { await chrome.action.setBadgeText({ text: '' }); } catch {} }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await settings(); await set({ settings: cur });
  chrome.alarms.create('poll', { periodInMinutes: 5 });
  poll('install');
});
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('poll', { periodInMinutes: 5 }); poll('startup'); });

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'poll') return poll('alarm');
  if (a.name === 'reset:session' || a.name === 'reset:weekly') {
    const s = await settings(); if (!s.resetNotify) return;
    const weekly = a.name === 'reset:weekly';
    try {
      chrome.notifications.create(a.name + ':' + Date.now(), {
        type: 'basic', iconUrl: 'icons/icon128.png',
        title: weekly ? 'Weekly Claude limit reset' : '5-hour Claude window reset',
        message: weekly ? 'Your weekly usage is back to 0%. Full room to work.' : 'Your 5-hour window just reset — you have full room again.',
      });
    } catch {}
    poll('reset');
  }
});

chrome.notifications?.onClicked?.addListener(() => { chrome.tabs.create({ url: 'https://claude.ai/new' }); });

/* ---------- messages from content scripts / popup ---------- */
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    if (!m || typeof m !== 'object') return reply(null);
    if (m.type === 'usage' && m.usage) { await applyUsage(m.usage, 'page'); return reply(true); }
    if (m.type === 'refresh') { await poll('manual'); return reply((await get('usage')).usage || null); }
    if (m.type === 'open-code') { await chrome.tabs.create({ url: chrome.runtime.getURL('code.html') }); return reply(true); }
    if (m.type === 'open-claude') {
      const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true }); try { await chrome.windows.update(tabs[0].windowId, { focused: true }); } catch {} if (m.then) chrome.tabs.sendMessage(tabs[0].id, { wr: m.then }).catch(() => {}); }
      else await chrome.tabs.create({ url: 'https://claude.ai/new' });
      return reply(true);
    }
    if (m.type === 'settings-changed') { const u = (await get('usage')).usage; if (u) { await updateBadge(u); await scheduleResets(u); } return reply(true); }
    if (m.type === 'parse-usage') return reply(parseUsage(m.json));
    reply(null);
  })().catch(() => reply(null));
  return true;
});

chrome.commands?.onCommand?.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/claude\.ai\//.test(tab.url || '')) return;
  chrome.tabs.sendMessage(tab.id, { wr: cmd === 'start-fresh' ? 'start-fresh' : 'toggle' }).catch(() => {});
});

// expose for tests (node) — harmless in the worker
