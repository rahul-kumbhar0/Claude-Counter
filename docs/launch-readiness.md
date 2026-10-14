# Wiggleroom — launch readiness (founder notes, 2026-10-14)

## Are we on the right track?
Yes, with one caveat. The product solves a real, recurring, emotionally loaded problem (hitting a Claude limit mid-task with no warning and no way to carry on) and it does it for free, locally, with no account. That is the right wedge for growth: zero friction to try, immediate value on the first chat, and a reason to come back every day (the meter is always on). The caveat is dependency: everything reads an undocumented claude.ai endpoint and DOM. Mitigations are in place (tolerant parser, composer-relative docking, Shadow DOM, tests) but the real moat is **update speed**. Treat "claude.ai changed something" as a same-day fix.

## What makes it defensible vs. paid counters
1. Free and unlimited where others charge (handoff quotas, Pro tiers).
2. Learned messages-left and weekly pace, not a static estimate.
3. Backup. Nobody else combines the meter with a real local archive. Backup creates switching cost in the good way: the user's history lives in a format they own, produced by us.
4. Trust: open source, no server, privacy policy, clear permission justifications.

## Growth plan (no spend)
- Chrome Web Store listing with the five screenshots in `store/assets/` and the copy in `store/listing.md`. Ask early users for reviews in the week after install (the popup About tab can carry a one-line ask later).
- Reddit r/ClaudeAI and r/Anthropic: a plain post from the maker, "I built a free usage meter + backup for Claude, here is how messages-left learns". Answer every comment.
- Product Hunt and Hacker News "Show HN" once the store listing is live, link the site.
- SEO: the site already targets "Claude usage limit", "5-hour window", "weekly limit", "export Claude chats". Add a short blog/FAQ page per query later.
- Ship a Firefox build (manifest differences are small) and Edge Add-ons listing: cheap distribution.

## Retention levers already built
Alerts, reset notifications and the badge pull people back; the prompt library and backup folder make it part of a routine. Measure retention by store stats only (we collect nothing).

## Risks and what to do
- claude.ai changes: watch GitHub issues, keep the e2e mock close to the real page, ship fixes within a day.
- Anthropic objects: the extension reads the user's own data with their own session and never automates sending. Keep it that way. Keep the "independent, not affiliated" line everywhere.
- Support load: the About tab links to GitHub issues; add a FAQ entry for each repeated question.

## Future (after users, before money)
- Local Claude Code (CLI) usage in the popup from the .jsonl transcripts.
- Optional local-first sync of settings/prompts via the user's own cloud folder (no server).
- Team view: nothing shared, just an export of the weekly pace for a manager's eyes if the user wants it.
- If money is ever needed: optional support ("buy the maker a coffee"), never a wall.

## Pre-publish checklist
- [x] Manifest V3, single purpose, minimal permissions, no remote code
- [x] Privacy policy published at /privacy on the site
- [x] Screenshots 1280×800, small tile 440×280, marquee 1400×560, icon 128
- [x] Listing copy, permission justifications, data disclosures (`store/listing.md`)
- [x] Unit + end-to-end tests pass on the packaged code
- [ ] Register the Chrome Web Store developer account ($5 one-time), upload `store/wiggleroom-3.1.0.zip`
- [ ] After approval: replace the store URL placeholder in `site/index.html` and `extension/popup.js`
- [ ] Buy a domain if wanted (wiggleroom.dev was available) and add it to the Vercel project
