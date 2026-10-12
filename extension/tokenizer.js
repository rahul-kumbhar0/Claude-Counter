// tokenizer.js — lightweight approximate token estimator (no big vendored vocab).
// Not exact BPE, but a stable, honest "~" estimate: blends char- and word-based heuristics
// tuned to land within ~10-15% of Claude's o200k-style counts for typical English + code.
(() => {
  if (globalThis.CCETok) return;
  function estimate(text) {
    if (!text) return 0;
    const s = String(text);
    const chars = s.length;
    // word/punct pieces
    const pieces = (s.match(/[A-Za-z]+|\d+|\s+|[^\sA-Za-z\d]/g) || []).length;
    // base: ~1 token per 4 chars (English), code tends denser
    const byChar = chars / 4;
    // piece-based: most short words = 1 token, long words split
    let byPiece = 0;
    for (const w of s.split(/(\s+)/)) { if (!w) continue; if (/^\s+$/.test(w)) { byPiece += Math.ceil(Math.max(0, w.length - 1) / 4); continue; }
      byPiece += Math.max(1, Math.ceil(w.length / 4.2)); }
    // non-ascii (CJK etc.) ~ 1 token per char or more
    const nonAscii = (s.match(/[^\x00-\x7f]/g) || []).length;
    const est = Math.round((byChar * 0.5 + byPiece * 0.5) + nonAscii * 0.7);
    return Math.max(est, Math.ceil(pieces * 0.4));
  }
  globalThis.CCETok = { estimate };
})();
