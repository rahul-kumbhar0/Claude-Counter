// store/shots.js — captures real extension UI (bar, panel, popup, start-fresh) on a Claude-styled mock page.
// Output: store/raw/*.png (1280x710 page shots, 400x580 popup shots). Compose with compose.py.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright');
const EXT = path.resolve(__dirname, '..', 'extension'); const OUT = path.join(__dirname, 'raw');
const CONV = '2b1c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b'; const T0 = Date.now();
const usage = { five_hour: { utilization: 58, resets_at: new Date(T0 + 82 * 60e3).toISOString() }, seven_day: { utilization: 61, resets_at: new Date(T0 + 3 * 86400e3 + 5 * 3600e3).toISOString() }, seven_day_opus: { utilization: 72, resets_at: new Date(T0 + 3 * 86400e3).toISOString() } };
const msgs = [
  ['human', 'I want to refactor our tokenizer so the public API stays the same, then add tests. Here is the current module.'],
  ['assistant', "Here's the refactored module. I kept `estimate(text)` as the only export and moved the heuristics into small pure helpers.\n\n- Whitespace no longer counts as tokens\n- CJK characters count ≈1 token each\n- Code blocks use the denser ratio\n\nWant me to add the tests next?"],
  ['human', 'Yes. Cover CJK, code and whitespace, and keep the API the same.'],
  ['assistant', 'Added 14 cases covering CJK, code and whitespace. All pass. The estimates land within 12% of the reference counts on the sample set.'],
  ['human', 'Benchmark it against the reference tokenizer on the docs folder and give me a table.'],
  ['assistant', 'Done. Average error is 9.4%, worst case 15.8% on a heavily formatted Markdown file. Table below.'],
];
const conversation = { uuid: CONV, name: 'Tokenizer refactor', model: 'claude-sonnet-4-5', created_at: new Date(T0 - 2 * 86400e3).toISOString(), updated_at: new Date(T0).toISOString(), current_leaf_message_uuid: 'm6',
  chat_messages: msgs.map(([s, t], i) => ({ uuid: 'm' + (i + 1), sender: s, index: i, created_at: new Date(T0 - (7 - i) * 600e3).toISOString(), content: [{ type: 'text', text: t + (s === 'assistant' ? '\n\n' + 'Notes: the benchmark harness reads every Markdown and TypeScript file under docs/, tokenizes it with both implementations, and records the absolute and relative error per file. Files with front matter are parsed first so the YAML block does not skew the count. '.repeat(14) : '') }, ...(i === 1 ? [{ type: 'tool_use', name: 'artifacts', input: { id: 'tok', command: 'create', title: 'tokenizer.ts', type: 'application/vnd.ant.code', language: 'typescript', content: 'export function estimate(text: string): number {\n  // …\n}\n' } }] : [])], parent_message_uuid: i ? 'm' + i : null })) };
const PAGE = (p) => `<!doctype html><html><head><meta charset="utf-8"><title>Claude</title><style>
  body{margin:0;background:#f5f3ee;color:#1f1e1b;font-family:-apple-system,"Segoe UI",Inter,sans-serif;height:100vh;display:flex;overflow:hidden}
  aside{width:260px;background:#ebe8e0;border-right:1px solid #e1ddd3;padding:16px 14px;font-size:13.5px;color:#4a4740;flex:none}
  aside .logo{font-weight:700;font-size:16px;margin-bottom:18px;display:flex;align-items:center;gap:8px;color:#1f1e1b}aside .logo i{width:22px;height:22px;border-radius:6px;background:#d97757;display:inline-block}
  aside .item{padding:7px 10px;border-radius:8px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}aside .item.on{background:#dfdbd1;color:#1f1e1b}aside h6{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a867c;margin:18px 0 6px 10px}
  main{flex:1;display:flex;flex-direction:column;min-width:0}
  .top{height:48px;display:flex;align-items:center;padding:0 24px;font-size:14px;color:#6b675f;gap:8px}.top b{color:#1f1e1b;font-weight:600}
  .chat{flex:1;overflow:auto;padding:10px 0 30px}.inner{max-width:760px;margin:0 auto;padding:0 24px}
  .msg{margin:18px 0;font-size:15px;line-height:1.6}.msg.human p{display:inline-block;background:#e8e4da;border-radius:16px;padding:12px 16px;margin:0;max-width:85%}.msg.human{text-align:right}
  .msg.assistant{font-family:Georgia,"Times New Roman",serif;font-size:15.5px}.msg.assistant .av{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#d97757;color:#fff;align-items:center;justify-content:center;font-size:12px;font-family:Inter,sans-serif;margin-right:8px;vertical-align:middle;font-weight:700}
  .msg.assistant ul{margin:8px 0 8px 20px}.msg.assistant p{margin:0 0 8px}
  .art{border:1px solid #e1ddd3;border-radius:12px;background:#fff;padding:12px 14px;display:flex;align-items:center;gap:12px;margin:10px 0;font-family:Inter,sans-serif;font-size:13.5px}.art i{width:36px;height:36px;border-radius:9px;background:#f0ece3;display:inline-block}
  .bottom{padding:0 24px 22px}.card{max-width:760px;margin:0 auto;border:1px solid #d9d4c9;border-radius:18px;background:#fff;box-shadow:0 4px 18px rgba(60,40,20,.06);padding:14px 16px}
  .ProseMirror{min-height:26px;outline:none;font-size:15px;line-height:1.5;max-height:200px;overflow:auto;white-space:pre-wrap}.ProseMirror:empty::before{content:attr(data-placeholder);color:#9a968c}
  .tools{display:flex;justify-content:space-between;align-items:center;margin-top:10px}.tools button{border:none;background:none;font:500 13px Inter,sans-serif;color:#4a4740;padding:6px 8px;border-radius:8px}.tools .send{width:32px;height:32px;border-radius:9px;background:#d97757;color:#fff;font-size:15px}
  .disc{text-align:center;font-size:12px;color:#8a867c;margin-top:10px}
</style></head><body>
<aside><div class="logo"><i></i>Claude</div><div class="item">＋ New chat</div><div class="item">Projects</div><div class="item">Artifacts</div><div class="item">Code</div><h6>Recents</h6><div class="item on">Tokenizer refactor</div><div class="item">Landing page copy</div><div class="item">Q3 planning notes</div><div class="item">SQL migration review</div><div class="item">Interview prep</div><div class="item">Trip itinerary</div></aside>
<main><div class="top"><b>${p === '/new' ? 'New chat' : 'Tokenizer refactor'}</b> · Sonnet 4.5</div>
<div class="chat"><div class="inner">${p === '/new' ? '<div style="height:380px"></div>' : msgs.slice(-4).map(([s, t]) => s === 'human' ? `<div class="msg human"><p>${t}</p></div>` : `<div class="msg assistant"><span class="av">C</span>${t.split('\n\n').map((x) => x.startsWith('- ') ? '<ul>' + x.split('\n').map((l) => '<li>' + l.slice(2) + '</li>').join('') + '</ul>' : '<p>' + x + '</p>').join('')}${t.includes('refactored') ? '<div class="art"><i></i><div><b>tokenizer.ts</b><div style="color:#8a867c;font-size:12px">Code · v3</div></div></div>' : ''}</div>`).join('')}</div></div>
<div class="bottom"><div class="card"><div contenteditable="true" class="ProseMirror" data-placeholder="Reply to Claude…"></div><div class="tools"><button type="button">Sonnet 4.5 ▾</button><button type="button" class="send">↑</button></div></div><div class="disc">Claude can make mistakes. Please double-check responses.</div></div></main></body></html>`;

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-shots-'));
  const ctx = await chromium.launchPersistentContext(userDir, { channel: 'chromium', headless: true, viewport: { width: 1280, height: 710 }, deviceScaleFactor: 2, colorScheme: 'light', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let sw = ctx.serviceWorkers()[0]; if (!sw) sw = await ctx.waitForEvent('serviceworker'); const extId = new URL(sw.url()).host;
  await ctx.route('https://claude.ai/**', async (route) => { const p = new URL(route.request().url()).pathname; const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/organizations') return json([{ uuid: 'org1', capabilities: ['chat'] }]); if (p === '/api/organizations/org1/usage') return json(usage); if (p === `/api/organizations/org1/chat_conversations/${CONV}`) return json(conversation);
    return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE(p) }); });
  // seed learned samples + 3 days of history so "learned" and the pace projection show
  const hist = []; for (let i = 72; i >= 0; i--) hist.push({ t: T0 - i * 3600e3, s: Math.max(0.05, 0.58 - Math.abs(((i % 5) - 2.5)) * 0.1), w: 0.61 - i * 0.0055, wr: T0 + 3 * 86400e3 + 5 * 3600e3 });
  await sw.evaluate((h) => new Promise((r) => chrome.storage.local.set({ history: h, samples: [{ delta: 0.021, ctx: 60000, model: 'sonnet', t: Date.now() }, { delta: 0.019, ctx: 58000, model: 'sonnet', t: Date.now() }, { delta: 0.024, ctx: 62000, model: 'sonnet', t: Date.now() }], prompts: [{ name: 'Code review', body: 'Review this {language} code for {focus}. List concrete fixes.' }, { name: 'Explain like I\'m new', body: 'Explain {topic} to someone new to it, with one example.' }, { name: 'Write the tests', body: 'Write tests for the code above. Cover edge cases.' }] }, r)), hist);
  const page = await ctx.newPage(); await page.goto(`https://claude.ai/chat/${CONV}`);
  await page.waitForFunction(() => { const h = document.getElementById('wiggleroom-host'); return h && h.shadowRoot && /\d+%/.test(h.shadowRoot.querySelector('#sSession .v')?.textContent || '') && /~\d/.test(h.shadowRoot.querySelector('#sCtx .v')?.textContent || ''); }, null, { timeout: 20000 });
  await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/1-bar.png` });
  await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('#more').click());
  await page.waitForFunction(() => /Weekly pace/.test(document.getElementById('wiggleroom-host').shadowRoot.querySelector('#pb').textContent)); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/2-details.png` });
  await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('.tab[data-t=carry]').click()); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/3-carry.png` });
  await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('.tab[data-t=backup]').click()); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/4-backup.png` });
  await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('#close').click());
  await page.click('.ProseMirror'); await page.keyboard.type('//'); await page.waitForFunction(() => !!document.getElementById('wiggleroom-host').shadowRoot.querySelector('.pmenu')); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/5-prompts.png` });
  await page.keyboard.press('Escape');
  // start fresh → new chat with the summary inserted
  await page.evaluate(() => document.getElementById('wiggleroom-host').shadowRoot.querySelector('#fresh').click());
  await page.waitForURL('https://claude.ai/new', { timeout: 15000 }); await page.waitForFunction(() => /Continuing: Tokenizer refactor/.test(document.querySelector('.ProseMirror')?.innerText || ''), null, { timeout: 15000 }); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/6-fresh.png` });
  // popup tabs (back on the chat so chat actions are enabled)
  await page.goto(`https://claude.ai/chat/${CONV}`); await page.waitForFunction(() => /~\d/.test(document.getElementById('wiggleroom-host')?.shadowRoot?.querySelector('#sCtx .v')?.textContent || ''), null, { timeout: 20000 });
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 400, height: 580 });
  for (const t of ['usage', 'actions', 'prompts', 'settings']) { await pop.goto(`chrome-extension://${extId}/popup.html`); await pop.waitForFunction(() => /\d+%|Open claude/.test(document.querySelector('#main').textContent), null, { timeout: 10000 }); await pop.click(`.tab[data-t=${t}]`); await pop.waitForTimeout(700); await pop.screenshot({ path: `${OUT}/popup-${t}.png` }); }
  await ctx.close(); fs.rmSync(userDir, { recursive: true, force: true }); console.log('raw shots written:', fs.readdirSync(OUT));
})().catch((e) => { console.error(e); process.exit(1); });
