# Wiggleroom — know how much Claude you've got left

A free Chrome extension (Manifest V3) for claude.ai, plus its marketing site.

**Live site:** https://wiggleroom-sigma.vercel.app (Vercel project `wiggleroom`, root directory `site/`, linked to this repo).

- **Measure:** 5-hour window, weekly cap, per-model caps, this-chat size with breakdown, messages left (learned from your real usage), weekly pace projection, alerts, reset notifications, toolbar badge + popup.
- **Keep:** back up this chat / all chats / Claude Code (web + local) to a folder (incremental) or ZIP: HTML + Markdown + JSON, every artifact version, code blocks, files, project knowledge.
- **Carry:** start fresh in a new Claude chat (or inside the project) with a smart summary; carry the conversation to ChatGPT / Gemini / Grok; copy summary; download the chat as Markdown; prompt library (`//`).

Everything is free for everyone, and nothing leaves the user's computer.

## Repository layout

```
extension/   the unpacked extension (load this folder in chrome://extensions)
  manifest.json   MV3 manifest (permissions: storage, alarms, notifications; host: claude.ai)
  hook.js         MAIN-world observer of claude.ai's own fetch/SSE traffic (usage + turn events + Claude Code session mirror)
  usage.js        pure usage math shared by page, background and popup (parser, messages-left learner, weekly projection)
  content.js      the bar, details panel, alerts, start-fresh, carry-to, backup menu, prompts, settings
  export.js       backup engine (chats, projects, Claude Code web) — writes ZIP or folder
  lib.js          ZIP writer, folder sink, HTML/Markdown renderers, Claude Code transcript renderer
  background.js   service worker: 5-min usage poll, badge, history, reset notifications, commands
  popup.html/js   toolbar popup: meters, pace, sparkline, quick actions
  filler.js       runs on ChatGPT / Gemini / Grok to type the carried summary into the box
  code.html/js    local Claude Code (.jsonl) exporter page
  test/           unit tests (node) and a Playwright end-to-end test against a mocked claude.ai
site/        static marketing site deployed to Vercel (index.html, og.png, favicon.svg, the extension ZIP)
```

## Install (unpacked)

1. Download `site/wiggleroom-extension.zip` (or use the `extension/` folder directly) and unzip.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, pick the folder.
3. Open claude.ai. The bar appears under the message box. `Alt+Shift+W` toggles it, `Alt+Shift+F` starts fresh.

## Tests

```
node extension/test/unit.test.js      # parser, messages-left, projection, tokenizer, ZIP writer
node extension/test/e2e.test.js       # loads the extension into Chromium (Playwright) against a mocked claude.ai
```

The end-to-end test checks: bar mounts in a Shadow DOM and docks under the composer, usage is read and rendered, the
details panel renders, a sent message is observed and turned into a learned cost sample (model taken from the request),
the `//` prompt menu opens, "Start fresh" builds a summary and inserts it into a new chat, the popup renders, and
"Export this chat" produces a valid ZIP with `conversation.html/.md/.json` and artifacts.

## Build the ZIP for the site

```
cd extension && zip -r -X ../site/wiggleroom-extension.zip manifest.json *.js *.html icons
```

## Deploy the site

The `site/` folder is a static Vercel project (`vercel.json` sets clean URLs and download headers). `vercel --prod` from `site/`,
or connect the repo in the Vercel dashboard with **Root Directory = site**.

## Notes on claude.ai's API

Usage comes from `GET /api/organizations/{org}/usage` (undocumented, the same data as Settings → Usage). The parser in
`usage.js` is tolerant: it finds any `{utilization, resets_at}`-shaped object in the payload (`five_hour`, `seven_day`,
`seven_day_opus`, the newer `limits[]` list, the live `message_limit` SSE event) so renames don't blank the meter.

Wiggleroom is an independent tool, not affiliated with or endorsed by Anthropic.
