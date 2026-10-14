# Wiggleroom privacy policy

Last updated: 2026-10-14

Wiggleroom is a browser extension that shows your Claude usage limits and lets you back up and carry on your own Claude conversations.

**What it reads.** Inside your browser, using the login you already have on claude.ai, Wiggleroom reads your own usage figures and, when you ask it to build a summary or a backup, your own conversations and project files. It observes the page's own network requests to notice when a message is sent, so it can learn your cost per message. It never modifies those requests.

**What it stores.** Settings, saved prompts, usage history, learned per-message costs and a pending summary during a handoff are kept in the browser's extension storage on your device. Backups are written only to the folder you choose or a ZIP you download.

**What it sends.** Nothing. Wiggleroom has no server, no analytics, no crash reporting and no accounts. It never transmits your chats, files, usage or keys anywhere.

**Other sites.** When you click "Carry to ChatGPT / Gemini / Grok", the extension types your summary into that site's message box and downloads a Markdown file. It does not read anything from those sites, and you decide whether to send.

**Permissions.** `storage` (local settings and history), `alarms` (periodic usage poll and reset timers), `notifications` (optional reset notification), host access to claude.ai (reading your own usage), and content scripts on chatgpt.com, chat.openai.com, gemini.google.com and grok.com (typing your summary on request).

**Removal.** Uninstalling the extension deletes its storage. Backups you saved remain where you put them.

**Contact.** Open an issue at https://github.com/rahul-kumbhar0/Claude-Counter.

Wiggleroom is independent and not affiliated with or endorsed by Anthropic, OpenAI, Google or xAI.
