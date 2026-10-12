// End-to-end smoke test: loads the unpacked extension into Chromium and drives it against a mocked claude.ai.
// Run: node extension/test/e2e.test.js   (needs Playwright + Chromium; CI/dev machines only)
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { chromium } = require('playwright');
const EXT = path.resolve(__dirname, '..');
const CONV = '11111111-2222-4333-8444-555555555555';
const T0 = Date.now();
let bump = 0;
const usagePayload = () => ({ five_hour: { utilization: 31 + bump, resets_at: new Date(T0 + 95 * 60e3).toISOString() }, seven_day: { utilization: 46, resets_at: new Date(T0 + 4 * 86400e3).toISOString() }, seven_day_opus: { utilization: 60, resets_at: new Date(T0 + 4 * 86400e3).toISOString() } });
const conversation = {
  uuid: CONV, name: 'Build a landing page', model: 'claude-sonnet-4-5', created_at: new Date(T0 - 86400e3).toISOString(), updated_at: new Date(T0).toISOString(), current_leaf_message_uuid: 'm3',
  chat_messages: [
    { uuid: 'm1', sender: 'human', index: 0, created_at: new Date(T0 - 3600e3).toISOString(), content: [{ type: 'text', text: 'Help me build a landing page for a free Chrome extension called Wiggleroom.' }], parent_message_uuid: null },
    { uuid: 'm2', sender: 'assistant', index: 1, created_at: new Date(T0 - 3500e3).toISOString(), content: [{ type: 'text', text: 'Sure. Key points:\n- Keep it to one page\n- Lead with the meter\n- Free forever' }, { type: 'tool_use', name: 'artifacts', input: { id: 'page', command: 'create', title: 'index.html', type: 'text/html', content: '<h1>Wiggleroom</h1>' } }], parent_message_uuid: 'm1' },
    { uuid: 'm3', sender: 'human', index: 2, created_at: new Date(T0 - 3000e3).toISOString(), content: [{ type: 'text', text: 'Great, now add a pricing section that says it is free.' }], parent_message_uuid: 'm2' },
  ],
};
const PAGE = (p) => `<!doctype html><html><head><title>Claude</title></head><body style="margin:0;font-family:sans-serif">
<main style="padding:40px 0 0"><div style="height:300px;overflow:auto">chat ${p}</div>
<fieldset style="border:1px solid #ccc;border-radius:12px;max-width:720px;margin:0 auto 60px;padding:12px">
  <div contenteditable="true" class="ProseMirror" data-placeholder="Reply to Claude…" style="min-height:48px;outline:none"></div>
  <div style="display:flex;justify-content:space-between;margin-top:8px"><button type="button">Sonnet 4.5</button><button type="button">Send</button></div>
</fieldset><p style="text-align:center;color:#888;font-size:12px">Claude can make mistakes.</p></main></body></html>`;

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-e2e-'));
  const ctx = await chromium.launchPersistentContext(userDir, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let sw = ctx.serviceWorkers()[0]; if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host; console.log('extension id', extId);
  await ctx.route('https://claude.ai/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/organizations') return json([{ uuid: 'org1', capabilities: ['chat'] }]);
    if (p === '/api/organizations/org1/usage') return json(usagePayload());
    if (p === `/api/organizations/org1/chat_conversations/${CONV}`) return json(conversation);
    if (p.endsWith('/completion') && req.method() === 'POST') { bump = 2; return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"type":"message_start"}\n\ndata: {"type":"message_limit","message_limit":{"type":"within_limit"}}\n\n' }); }
    return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE(p) });
  });
  const page = await ctx.newPage();
  await page.goto(`https://claude.ai/chat/${CONV}`);
  // the bar should mount in a shadow root, read usage and dock under the composer
  await page.waitForFunction(() => { const h = document.getElementById('wiggleroom-host'); return h && h.shadowRoot && /\d+%/.test(h.shadowRoot.querySelector('#sSession .v')?.textContent || ''); }, null, { timeout: 15000 });
  const read = () => page.evaluate(() => { const s = document.getElementById('wiggleroom-host').shadowRoot; const g = (q) => s.querySelector(q)?.textContent.trim(); const bar = s.querySelector('#bar'); const r = bar.getBoundingClientRect(); const card = document.querySelector('fieldset').getBoundingClientRect(); return { session: g('#sSession .v'), sreset: g('#sSession .r'), weekly: g('#sWeekly .v'), ctx: g('#sCtx .v'), left: g('#sLeft .v'), leftNote: g('#sLeft .r'), floating: bar.classList.contains('float'), top: r.top, cardBottom: card.bottom, barLeft: r.left, cardLeft: card.left }; });
  let v = await read(); console.log('bar:', v);
  assert.strictEqual(v.session, '31%'); assert.ok(/resets 1h 3\dm/.test(v.sreset), v.sreset); assert.strictEqual(v.weekly, '46%');
  assert.ok(!v.floating, 'bar should dock'); assert.ok(Math.abs(v.top - (v.cardBottom + 6)) < 2 && Math.abs(v.barLeft - v.cardLeft) < 2, 'docked under composer');
  await page.waitForFunction(() => /~\d/.test(document.getElementById('wiggleroom-host').shadowRoot.querySelector('#sCtx .v').textContent), null, { timeout: 10000 });
  v = await read(); assert.ok(/^~\d/.test(v.ctx), 'context estimate: ' + v.ctx); assert.ok(/^~\d+$/.test(v.left), 'messages left: ' + v.left); assert.ok(/Sonnet/.test(v.leftNote), v.leftNote);
  // details panel
  await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('#more').click());
  await page.waitForFunction(() => /Weekly · Opus/.test(document.getElementById('wiggleroom-host').shadowRoot.querySelector('#pb').textContent));
  const details = await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('#pb').textContent);
  assert.ok(/Conversation/.test(details) && /Messages left/i.test(details) && /Why do I hit limits/.test(details), 'details content');
  // learned cost: simulate a page-initiated completion request → hook reports turn start/end → usage re-read → sample stored
  await page.evaluate(async (CONV) => { await fetch(`/api/organizations/org1/chat_conversations/${CONV}/completion`, { method: 'POST', body: JSON.stringify({ model: 'claude-opus-4-5', prompt: 'hi' }) }); }, CONV);
  let samples = [];
  for (let i = 0; i < 40 && !samples.length; i++) { await page.waitForTimeout(400); samples = await sw.evaluate(() => new Promise((r) => chrome.storage.local.get('samples', (x) => r(x.samples || [])))); }
  console.log('learned samples:', samples); assert.strictEqual(samples.length, 1); assert.strictEqual(samples[0].model, 'opus'); assert.ok(samples[0].delta > 0.01 && samples[0].delta < 0.03);
  v = await read(); assert.ok(/Opus/.test(v.leftNote), 'model switched to Opus from request body: ' + v.leftNote);
  // prompts: save one, type // in the composer, menu appears
  await sw.evaluate(() => new Promise((r) => chrome.storage.local.set({ prompts: [{ name: 'Review', body: 'Review this {thing}.' }] }, r)));
  await page.reload(); await page.waitForSelector('#wiggleroom-host', { state: 'attached' }); await page.waitForTimeout(800);
  await page.click('.ProseMirror'); await page.keyboard.type('//');
  await page.waitForFunction(() => !!document.getElementById('wiggleroom-host').shadowRoot.querySelector('.pmenu'), null, { timeout: 5000 });
  console.log('prompt menu: ok');
  // Start fresh: builds a summary from the mocked conversation and navigates to /new where it is inserted
  await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('#fresh').click());
  await page.waitForURL('https://claude.ai/new', { timeout: 15000 });
  await page.waitForFunction(() => /Continuing: Build a landing page/.test(document.querySelector('.ProseMirror')?.innerText || ''), null, { timeout: 15000 });
  const inserted = await page.evaluate(() => document.querySelector('.ProseMirror').innerText);
  assert.ok(/Original goal/.test(inserted) && /Key points & decisions/.test(inserted) && /index\.html/.test(inserted) && /Most recent messages/.test(inserted), 'summary sections');
  console.log('start fresh: summary inserted (%d chars)', inserted.length);
  // popup renders from stored usage
  const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${extId}/popup.html`);
  await pop.waitForFunction(() => /\d+%/.test(document.querySelector('#vS').textContent), null, { timeout: 10000 });
  console.log('popup:', await pop.evaluate(() => ({ s: document.querySelector('#vS').textContent, w: document.querySelector('#vW').textContent, models: document.querySelector('#models').textContent.trim() })));
  // backup: export this chat as ZIP (mock has no files) — verify a download happens
  await page.goto(`https://claude.ai/chat/${CONV}`); await page.waitForSelector('#wiggleroom-host', { state: 'attached' }); await page.waitForTimeout(600);
  await page.evaluate(() => { const s = document.getElementById('wiggleroom-host').shadowRoot; s.querySelector('#more').click(); s.querySelector('.tab[data-t=backup]').click(); });
  await page.waitForFunction(() => !!document.getElementById('wiggleroom-host').shadowRoot.querySelector('#one'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('#one').click())]);
  const zipPath = path.join(userDir, 'export.zip'); await dl.saveAs(zipPath);
  const { execFileSync } = require('child_process'); const names = execFileSync('python3', ['-I', '-c', 'import zipfile,sys; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath]).toString().trim().split('\n');
  console.log('backup zip:', names.length, 'files, e.g.', names.filter((n) => /conversation\.(html|md|json)|artifacts/.test(n)).slice(0, 4));
  assert.ok(names.some((n) => n.endsWith('conversation.html')) && names.some((n) => n.endsWith('conversation.md')) && names.some((n) => /artifacts\/index\.html$/.test(n)), 'zip contents');
  await ctx.close(); fs.rmSync(userDir, { recursive: true, force: true });
  console.log('\nE2E: all checks passed');
})().catch((e) => { console.error('E2E FAILED:', e); process.exit(1); });
