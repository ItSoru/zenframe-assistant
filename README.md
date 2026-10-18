# Zenframe Assistant 1.0.7

Chat with **Zeni** inside After Effects. Use **Edit project** for supported changes (you approve each batch before it runs) or **Draft scripts** to review JSX before running it.

**Bring your own AI.** Use a free option like Groq, OpenRouter's free models, Google Gemini's free tier or Ollama on your own PC, or a paid one like the Anthropic API, OpenAI or Claude Code.

> **Independent product.** Zenframe Assistant is not made, endorsed or supported by Adobe or by any AI provider. You use each provider under your own account, and any charges come from that provider.

## Requirements

- **Windows 10 or 11.** macOS is not supported in this version.
- **After Effects 2022 or later** with CEP panels. Tested on After Effects 2024; other versions are expected to work but are unverified.
- An internet connection (not needed for Ollama).
- **One AI provider** from the list below.

## AI providers

| Provider | Cost | What you need |
|---|---|---|
| **Groq** | Free tier with rate limits | Key from console.groq.com/keys |
| **OpenRouter** | Many free models (tick "Show free models only") plus paid ones | Key from openrouter.ai/keys |
| **Google Gemini** | Free tier with rate limits | Key from aistudio.google.com/apikey |
| **Ollama** | Free, runs on your PC | Install Ollama and pull a model that supports tools |
| **Anthropic API** | Paid per use | Key from console.anthropic.com |
| **OpenAI** | Paid per use | Key from platform.openai.com/api-keys |
| **Custom** | Depends | Any OpenAI-compatible service (https, or http on localhost) |
| **Claude Code** | Your Claude plan or Anthropic key | Claude Code + Node.js 18 or later installed |

Free tiers and model lists change often; check each provider's site for current limits.

**Model quality matters.** Zeni needs a model that supports *tool calling*. Larger models (Claude, GPT-class, large Llama/Qwen models) handle After Effects edits and ExtendScript far better than small free ones. Keep **Ask before edits** on, especially with free models.

## Install

1. Extract the entire ZIP. Do not run the installer from inside the ZIP.
2. Close After Effects.
3. Double-click **Install-Zenframe-Assistant.cmd**. No administrator account is needed. Windows may warn about a file from the internet: choose **Run** (or **More info**, then **Run anyway**).
4. Open After Effects, then **Window > Extensions > Zenframe Assistant**.

The installer checks every file against `checksums.json`, installs for the current Windows user only, backs up any previous Zenframe install, and records your original Adobe debug settings so they can be restored later.

This is an unsigned panel. To load it, the installer turns on Adobe's per-user `PlayerDebugMode` setting for CSXS 9-13. Managed (school or work) computers may block this.

## Connect your AI

Open **Settings** (gear icon) and choose a **Provider**.

- **Groq, OpenRouter, Gemini, Anthropic API, OpenAI:** paste your key, click **Save key**, click **Load models**, then pick a model in the **Model** box.
- **Ollama:** install Ollama, pull a tool-capable model, keep the base URL `http://localhost:11434/v1`, click **Load models** and pick it.
- **Custom:** enter the service's base URL (and a key if it needs one), then load and pick a model.
- **Claude Code:** choose whether Claude Code uses your Anthropic API key (paste and save it) or your own Claude Code login (run `claude auth login` in Command Prompt). Check the Claude Code and Node.js paths, or click **Detect again**.

Then click **Save & check connection**. The status line tells you what is missing.

**About your keys:** each key is encrypted with Windows for your account only (DPAPI), stored in `%LOCALAPPDATA%\ZenframeAssistant\credentials`, and only ever sent to its own provider. It is never shown again, logged, or sent anywhere else. **Remove key** deletes the key for the selected provider.

## Using Zeni

- **Conversations:** keep several chats open as tabs above the messages. Click **＋** (or press Ctrl+T) for a new one, click a tab to switch (Ctrl+Tab cycles), double-click a tab to rename it, and click **×** twice to close it. Each conversation keeps its own history, and they are saved when you close After Effects. While Zeni works in one tab you can read the others; if it needs your approval, it brings you back to that tab.
- **Effort and model:** click the effort button in the message box (it shows **Select effort** until you pick a level). Drag the slider or use the arrow keys: Claude has **Low, Medium, High, Extra and Max**; Groq, OpenRouter, Gemini, OpenAI and Ollama have **Low, Medium and High**. Higher effort means more thorough answers but slower replies and more tokens. Press Delete on the slider to go back to the model's default. Click the model name above the slider to switch models. Effort is remembered separately for each provider.
- **Approving edits:** the switch under the message box chooses **Ask before edits** (you see each batch first) or **Auto-apply edits** (changes apply right away). The same setting is in Settings, and **Always apply** on an approval card switches to auto-apply.
- **Edit project:** create compositions, text, solids and nulls; rename layers; set properties, keyframes and expressions; add installed effects; duplicate layers; adjust timing.
  - Every batch is checked in After Effects first. If anything in it is invalid, **nothing** is changed.
  - With **Ask before edits** (the default), you see the exact list of changes with **Apply**, **Always apply** and **Decline**.
  - Each applied batch is one Undo step. A rare runtime error can still leave earlier actions in that batch applied; Zeni reports this, and Undo reverts it.
- **Draft scripts:** Zeni writes JSX into the Scripts tab. Nothing runs until you click **Run in After Effects**. If a script touches files, runs system commands, opens network connections, quits AE, or similar, you get a warning and must click **Run anyway**. The check is a helpful filter, not a guarantee, so read scripts before running them.
- **Stop** ends the current reply and cancels any pending approval. It cannot reverse edits already applied or interrupt a script already running inside AE.
- If you switch provider, model or mode, or reopen After Effects, the AI is given the conversation's recent messages so it can pick up where you left off.
- Zeni's replies are formatted (bold text, lists, tables, code blocks). Your own messages are shown exactly as you typed them.
- **Wallpaper:** Settings > Wallpaper > Choose image. The panel turns to frosted glass over it, picks its accent color from the image, and darkens the image as much as needed to keep text readable. Raise **Wallpaper visibility** to see more of the image, adjust **Glass blur**, or click **Remove** for the normal look.
- Enter sends. Shift+Enter adds a line.
- Zeni reads composition metadata and properties, not rendered frames.

## Privacy

See **PRIVACY.md**. In short: prompts and the project details Zeni reads are sent to the AI provider you chose. Media files are not uploaded. Zenframe has no servers and collects no analytics.

## Troubleshooting

- **Panel missing:** restart After Effects after installing.
- **"Setup needed":** open Settings and read the status line. It names the missing piece.
- **Key rejected:** check the key on the provider's site, then save it again.
- **Rate limit reached:** free tiers allow only a few requests per minute. Wait a minute, or pick a different model or provider.
- **"Does not seem to support tool calling":** pick a different model. On OpenRouter, the model list already hides models without tool support.
- **Ollama "Could not connect":** make sure Ollama is running.
- **Login expired (Claude Code login):** run `claude auth login` in Command Prompt.
- **After Effects not responding:** close any open dialog boxes in AE. Long scripts can keep running after the panel's 90-second wait.
- **Package integrity error:** extract a fresh copy of the ZIP. The checksums detect damaged or altered files inside the package; compare the ZIP's SHA-256 with the one on the download page to confirm the download itself.

## Update and uninstall

- **Update:** close AE and run the new version's installer. Your settings and saved keys are kept.
- **Uninstall:** close AE and run **Uninstall-Zenframe-Assistant.cmd**. It moves the panel to a recoverable backup in `%LOCALAPPDATA%\ZenframeAssistant\install-backups`, offers to restore your original Adobe debug settings, and offers to delete your saved keys.

Installation folder: `%APPDATA%\Adobe\CEP\extensions\com.zenframe.assistant`.
