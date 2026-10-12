// Unit tests for the pure parts of Wiggleroom. Run: node extension/test/unit.test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const load = (f, ctx) => { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }); return ctx; };
const ctx = vm.createContext({ console, TextEncoder, TextDecoder, Blob, setTimeout, clearTimeout, self: {}, indexedDB: undefined });
ctx.globalThis = ctx; load('usage.js', ctx); load('tokenizer.js', ctx); load('lib.js', ctx);
const U = ctx.WRUsage, Tok = ctx.CCETok, C = ctx.CCE;
let n = 0; const t = (name, fn) => { try { fn(); n++; console.log('  ✓', name); } catch (e) { console.log('  ✗', name); throw e; } };
const NOW = Date.parse('2026-10-12T10:00:00Z');

console.log('usage.parseUsage');
t('classic five_hour / seven_day payload (percent units)', () => {
  const u = U.parseUsage({ five_hour: { utilization: 31.2, resets_at: '2026-10-12T13:30:00Z' }, seven_day: { utilization: 46, resets_at: '2026-10-16T08:00:00Z' }, iguana_necktie: 1 }, NOW);
  assert.strictEqual(Math.round(u.session * 100), 31); assert.strictEqual(Math.round(u.weekly * 100), 46);
  assert.strictEqual(u.sessionReset, Date.parse('2026-10-12T13:30:00Z')); assert.strictEqual(u.weeklyReset, Date.parse('2026-10-16T08:00:00Z'));
});
t('fraction units (0..1) are accepted too', () => { const u = U.parseUsage({ five_hour: { utilization: 0.8 } }, NOW); assert.strictEqual(u.session, 0.8); });
t('per-model weekly windows', () => {
  const u = U.parseUsage({ seven_day: { utilization: 20 }, seven_day_opus: { utilization: 55, resets_at: '2026-10-16T08:00:00Z' }, seven_day_sonnet: { utilization: 10 } }, NOW);
  assert.strictEqual(u.weekly, 0.2); assert.strictEqual(u.models.opus.u, 0.55); assert.strictEqual(u.models.sonnet.u, 0.1);
});
t('newer limits[] list shape', () => {
  const u = U.parseUsage({ limits: [{ type: 'five_hour', utilization: 12, resets_at: 1791028800 }, { name: 'seven_day', utilization: 70, resets_at: 1791200000 }] }, NOW);
  assert.strictEqual(u.session, 0.12); assert.strictEqual(u.weekly, 0.7); assert.strictEqual(u.sessionReset, 1791028800000);
});
t('message_limit SSE event: exceeded → 100 %', () => {
  const u = U.parseUsage({ type: 'message_limit', message_limit: { type: 'exceeded_limit', resetsAt: 1791028800 } }, NOW);
  assert.strictEqual(u.session, 1); assert.strictEqual(u.limitEvent, 'exceeded_limit');
});
t('a "5-hour" reset far in the future is really the weekly reset', () => {
  const u = U.parseUsage({ five_hour: { utilization: 5, resets_at: '2026-10-18T00:00:00Z' } }, NOW);
  assert.strictEqual(u.sessionReset, null); assert.strictEqual(u.weeklyReset, Date.parse('2026-10-18T00:00:00Z'));
});
t('junk payloads produce nothing (no throw)', () => { const u = U.parseUsage({ hello: 'world', nested: { x: [1, 2, 3] } }, NOW); assert.strictEqual(u.session, null); assert.strictEqual(u.weekly, null); });

console.log('usage.messagesLeft');
t('baseline estimate scales with model and chat size', () => {
  const a = U.messagesLeft({ session: 0, ctx: 20000, model: 'sonnet' }), b = U.messagesLeft({ session: 0, ctx: 20000, model: 'opus' }), c = U.messagesLeft({ session: 0, ctx: 100000, model: 'sonnet' });
  assert.strictEqual(a.n, 45); assert.strictEqual(a.source, 'estimate'); assert.strictEqual(b.n, 9); assert.strictEqual(c.n, 9);
});
t('learns from observed deltas', () => {
  const samples = [{ delta: 0.02, ctx: 20000, model: 'sonnet' }, { delta: 0.021, ctx: 20000, model: 'sonnet' }, { delta: 0.019, ctx: 20000, model: 'sonnet' }];
  const r = U.messagesLeft({ session: 0.5, samples, ctx: 20000, model: 'sonnet' });
  assert.strictEqual(r.source, 'learned'); assert.strictEqual(r.n, 25);
});
t('null session → null', () => assert.strictEqual(U.messagesLeft({ session: null }), null));

console.log('usage.projectWeekly');
t('needs 3+ points', () => assert.strictEqual(U.projectWeekly([{ t: NOW - 3600e3, w: 0.1 }], NOW), null));
t('linear burn → hits cap before reset', () => {
  const h = []; for (let i = 0; i < 24; i++) h.push({ t: NOW - (24 - i) * 3600e3, w: 0.2 + i * 0.02, wr: NOW + 5 * 86400e3 });
  const p = U.projectWeekly(h, NOW); assert.strictEqual(p.pace, 'active'); assert.ok(Math.abs(p.slopePerDay - 0.48) < 0.01); assert.strictEqual(p.before, true);
});
t('ignores samples before a reset drop', () => {
  const h = []; for (let i = 0; i < 10; i++) h.push({ t: NOW - (20 - i) * 3600e3, w: 0.9, wr: NOW + 86400e3 });
  for (let i = 0; i < 6; i++) h.push({ t: NOW - (6 - i) * 3600e3, w: 0.01 + i * 0.002, wr: NOW + 7 * 86400e3 });
  const p = U.projectWeekly(h, NOW); assert.strictEqual(p.pace, 'active'); assert.ok(p.slopePerDay < 0.3); assert.strictEqual(p.before, false);
});
t('flat usage → idle', () => { const h = []; for (let i = 0; i < 6; i++) h.push({ t: NOW - (6 - i) * 3600e3, w: 0.4, wr: NOW + 86400e3 }); assert.strictEqual(U.projectWeekly(h, NOW).pace, 'idle'); });

console.log('usage.format');
t('resetIn / pct / kfmt', () => { assert.strictEqual(U.resetIn(NOW + 95 * 60e3, NOW), '1h 35m'); assert.strictEqual(U.resetIn(NOW + 2 * 86400e3 + 3600e3, NOW), '2d 1h'); assert.strictEqual(U.pct(0.456), 46); assert.strictEqual(U.kfmt(148200), '148k'); assert.strictEqual(U.kfmt(4821), '4.8k'); });

console.log('tokenizer');
t('estimates are in a sane range', () => { const n = Tok.estimate('The quick brown fox jumps over the lazy dog. '.repeat(20)); assert.ok(n > 150 && n < 280, 'got ' + n); assert.strictEqual(Tok.estimate(''), 0); });

console.log('lib.Zip');
(async () => {
  const z = new C.Zip(); await z.add('a/hello.txt', 'hello wiggleroom'); await z.add('a/hello.txt', 'second'); const blob = z.blob(); const buf = Buffer.from(await blob.arrayBuffer()); const zp = path.join(__dirname, 'out.zip'); fs.writeFileSync(zp, buf);
  const { execFileSync } = require('child_process'); const out = execFileSync('python3', ['-I', '-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(sorted(z.namelist())); print(z.read("a/hello.txt").decode()); print("testzip:", z.testzip())', zp]).toString(); fs.unlinkSync(zp);
  t('zip round-trips through python zipfile: ' + out.replace(/\n/g, ' | '), () => { assert.ok(out.includes("'a/hello-2.txt', 'a/hello.txt'"), out); assert.ok(out.includes('hello wiggleroom')); assert.ok(out.includes('testzip: None')); });
})();
t('safe() filenames', () => { assert.strictEqual(C.safe('a/b: c?*.txt'), 'a_b_ c__.txt'); assert.strictEqual(C.safe(''), 'untitled'); });
setTimeout(() => console.log(`\n${n} checks passed`), 50);
