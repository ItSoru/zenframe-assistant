# Zenframe Assistant privacy notice

Zenframe Assistant runs on your computer. It has no servers of its own and collects no analytics or telemetry.

## What is sent, and to whom

When you send Zeni a message, Zenframe sends it to **the AI provider you chose in Settings**: Groq, OpenRouter, Google Gemini, Anthropic, OpenAI, a custom service you entered, Claude Code (which sends it to Anthropic), or Ollama (which stays on your computer). While working, Zeni can read and send to that provider:

* your messages,
* project and composition names, layer names, timings and settings,
* property values, expressions and the text of text layers,
* the names of installed effects.

Zeni does **not** upload your footage, images, audio or rendered frames.

How the provider handles this data is covered by your own agreement with that provider and its privacy policy. Some free tiers may use prompts to improve their models; check the provider's terms if your projects are confidential. With Ollama, nothing leaves your computer.

## What is stored on your computer

* **Panel settings, conversations and draft script:** in After Effects' panel storage on this computer. Close a conversation's tab to delete it, or use **Delete all conversations** in Settings.
* **API keys (if you save any):** each encrypted with Windows DPAPI for your Windows account only, in `%LOCALAPPDATA%\ZenframeAssistant\credentials`. **Remove key** in Settings, or the uninstaller, deletes them.
* **Claude Code sessions (Claude Code provider only):** stored by Claude Code itself, not by Zenframe.
* **Install backups and your original Adobe debug settings:** in `%LOCALAPPDATA%\ZenframeAssistant`.

**Wallpaper.** If you choose a wallpaper, a resized copy is saved only on this computer, in `%LOCALAPPDATA%\ZenframeAssistant\wallpaper.json`. It is never sent to an AI provider or anywhere else. **Remove** deletes it.
