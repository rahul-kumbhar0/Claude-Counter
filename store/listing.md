# Chrome Web Store listing — Wiggleroom

Everything you paste into the Developer Dashboard. Upload `wiggleroom-3.1.0.zip` (built from `extension/`).

## Store listing

**Name (45 max):** Wiggleroom — Claude usage meter, backup & handoff

**Summary (132 max):**
See how much Claude you've got left, get warned before the wall, back up every chat locally, and carry any chat on. Free.

**Category:** Productivity → Tools (secondary: Developer Tools)
**Language:** English

**Description:**

Know how much Claude you've got left. Wiggleroom puts a live meter under Claude's message box and keeps everything you make on your own computer. Every feature is free, for everyone.

MEASURE
• 5-hour window and weekly cap with exact reset times, read from Claude's own usage data (the same numbers as Settings → Usage).
• Per-model weekly caps (Opus, Sonnet) when your plan reports them.
• This chat's weight: what every message re-sends (chat, project knowledge, uploads) against the 200k window, with a nudge before Claude starts forgetting the top.
• Messages left in the window. Starts from a documented baseline, then learns your real cost per message from the meter itself. Model-aware.
• Weekly pace: burn per day from your own history, the day you'd hit the cap, and whether that lands before or after the reset.
• Alerts at 80% and 95% (yours to change), a desktop notification when a window resets, and a toolbar badge that works from any tab.

KEEP
• Back up this chat, all chats, or Claude Code sessions (web and local) to a folder or ZIP: readable HTML, Markdown, raw JSON, every artifact version, code blocks, files, project knowledge.
• Folder mode is incremental and builds a searchable index.

CARRY
• Start fresh: one click builds a summary (goal, decisions, latest code, recent messages), opens a new chat and drops it in. Same thread, a fraction of the cost per message.
• Carry to ChatGPT, Gemini or Grok when Claude is out of room: the summary is typed into their box and the full chat downloads as Markdown to attach. Unlimited.
• Copy summary, download the chat as Markdown, prompt library (type // in the box).

PRIVACY
Everything runs in your browser with the login you already have. Wiggleroom never sends your chats, usage or keys to any server, never messages Claude on your behalf, and needs no account.

Independent tool, not affiliated with or endorsed by Anthropic, OpenAI, Google or xAI.

Website & privacy policy: https://wiggleroom-sigma.vercel.app · Source: https://github.com/rahul-kumbhar0/Claude-Counter

## Graphic assets (in `store/assets/`)
- `icon-128.png` — store icon
- `screenshot-1..5.png` — 1280×800
- `promo-small-440x280.png` — small promo tile
- `promo-marquee-1400x560.png` — marquee

## Privacy practices tab

**Single purpose:** Show Claude usage limits and let the user back up and carry on their own Claude conversations.

**Permission justifications**
- `storage` — settings, saved prompts, usage history and the pending summary during a handoff. Local only.
- `alarms` — a 5-minute poll of Claude's usage endpoint for the toolbar badge, and timers for reset-time notifications.
- `notifications` — optional desktop notification when a usage window resets.
- Host `https://claude.ai/*` — read the user's own usage and conversations with their existing session so the badge/popup work from any tab; content script renders the meter on claude.ai.
- Content scripts on `chatgpt.com`, `chat.openai.com`, `gemini.google.com`, `grok.com` — only to type the user's own summary into the message box after they click "Carry to". No data is read from those sites.

**Remote code:** No. All code is packaged.

**Data usage disclosures:** The extension does not collect or transmit any user data. Everything stays in the browser's extension storage and in files the user explicitly saves. Tick: "not being sold", "not used for unrelated purposes", "not used for creditworthiness".

**Privacy policy URL:** https://wiggleroom-sigma.vercel.app/privacy
