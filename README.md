# Zenframe Assistant 1.4.3

## Zeni companion

Zeni sits beside the message box and changes pose with the assistant's activity. Click him to wave, or drag him to pick him up and let go to drop him. He stays wherever you drop him; double-click him to send him back to his seat. His hoodie, hair streak, eyes, headphones and shoes follow your accent color. Settings → Zeni → **Size** sets how big he is. Settings → Zeni → **Show Zeni on the message box** turns the companion off and restores the prior layout; the preference stays on this computer. System reduced-motion preferences disable swing, breathing and decorative transitions.

The thought bubble mirrors the activity status; long text is shortened visually, while the original status remains available to screen readers. The sprites adapt to the accent locally without sending images or settings anywhere. Skin, black hair, outlines and white shoe sections remain unchanged. The eight PNG poses use a common seat anchor so changing state keeps their seating position stable.

## New in 1.4.0

- **Zeni sees your edit.** He can have After Effects render the frames he needs (effects, shakes and grade included) and look at them as one numbered sheet. The frames he looked at show in the chat. Needs a model that reads images (Claude, GPT, Gemini).
- **Zeni hears your edit.** The music is analyzed on your PC into a timeline: beats, BPM, the hits (kick or snare), the loud and quiet parts, and how many frames each cut, adjustment layer, keyframe and marker sits from the beat. Ask for a review and he listens first, then looks at the moments that matter.
- **Zeni knows editing styles.** A built-in style library covers flow AMV, jugg, velocity, 3D / typography / mograph and MMV: what defines each, what is intentional, what makes it good and its real mistakes. Pick your styles in Settings and Zeni reads the right guide before a review.
- **Study any project file.** Paperclip > Study a project file (or paste an .aep path) and Zeni breaks down how it was built without opening it, even a project that crashes After Effects: comps and nesting, effects and plugins, keyframe timing and easing, clip lengths, and how the cuts sit on the beat. Needs Python 3 and the free py-aep library (Settings > Project files > Install).
- **Dance to more than one song.** Settings > Zeni > Music to dance to lists every layer with sound in the active comp, including video files (MP4 and others) and audio inside precomps. Check one or more; Zeni follows whichever is playing. Leave them all unchecked and he picks the music himself.

## New in 1.3.1

- **Feedback that respects your style.** Ask Zeni to review an edit and it treats your choices (frame rate, interpolated frames, stacked adjustment layers, black endings and so on) as intentional. If it doesn't know your style yet, it describes how the edit is built and asks what you want feedback on. Only things that can't be intentional, such as an effect that can't change anything, are flagged, as questions.
- **Your editing style** (Settings): describe how you edit and Zeni keeps it in mind for every review.
- Zeni dances when the comp actually plays (he listens for After Effects' sound) instead of when you drag the time slider.
- Fixed: the paperclip menu didn't show up. The mic button stays red under the mouse while recording.

## New in 1.3.0

- **Zeni vibes to your music.** Press play on a comp with a song in it and Zeni dances on the beat almost right away. The tempo is worked out once from the song file (time stretch included) on your computer. Slow songs (under 105 BPM) get a chill sway, 105 to 160 BPM a head bob, faster songs bob every other beat. While Zeni is thinking or working he keeps that pose and just bounces. Settings > Zeni: **Dance to music**, **Smear** and **Bounce**.
- **More places to sit.** Drag Zeni onto the conversation tabs, the line under the Zenframe title, the Conversation/Scripts toggle, the message box or the panel floor. He snaps on, follows the layout when the panel resizes, and remembers the spot. Clicks on his hanging legs go through to what is underneath.
- **Voice input.** Click the mic next to the paperclip, talk, click again: your words are typed into the message box (nothing is sent until you press Send). Esc cancels. Uses Groq or OpenAI Whisper if you saved that key, otherwise Windows speech recognition offline. Settings > Voice picks the engine and microphone.
- **Video references.** Attach a video (or pick **Selected video layer** from the paperclip menu) and Zeni gets a sheet of up to 12 key frames with their timestamps, so you can say "make it move like this".

## New in 1.2.0

- **Attach files:** click the paperclip in the message box, drag files onto it, or paste an image. Files wait in the box until you press Send, and you can remove any of them with ×. Zeni reads images (PNG, JPG, WebP, GIF, such as a reference frame or a screenshot of your comp) and text files (scripts, expressions, JSON, CSV, subtitles, notes). Up to 12 files per message (a video counts as two: its key-frame sheet and their timestamps). Images need a model with vision; most Claude, GPT and Gemini models have it.
- **Usage gauge:** the small ring next to the connection status shows how much of your limit is left. Click it for details; the same card is in Settings under AI provider. What it shows depends on the provider (see below).

This remains an unsigned Windows CEP ZIP.


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
| **Codex** | Your ChatGPT plan (Plus, Pro or Team), no API key | Codex CLI (`npm install -g @openai/codex`), signed in with `codex login`, + Node.js 18 or later |

Free tiers and model lists change often; check each provider's site for current limits.

**Codex note:** some Codex versions block tools from other apps when run this way ("user cancelled MCP tool call"). Zeni tells you if that happens; updating Codex is the first thing to try. Zenframe keeps Codex's read-only sandbox on and does not let it browse the web.

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
- **Your installed tools:** ask Zeni what panels, scripts or presets you have, to open a panel, to run one of your scripts or to apply a preset. Running a script always asks you first (**Run** / **Decline**), even with Auto-apply on; presets go through the normal edit approval. Zeni can open other panels but can't operate the controls inside them.
- **Wallpaper:** Settings > Wallpaper > Choose image. The panel turns to frosted glass over it, picks its accent color from the image, and darkens the image as much as needed to keep text readable. Raise **Wallpaper visibility** to see more of the image, adjust **Glass blur**, or click **Remove** for the normal look.
- Enter sends. Shift+Enter adds a line.
- Zeni reads composition metadata and properties. It cannot see your viewer by itself, but you can attach a screenshot or a rendered frame.
- **Usage gauge, per provider:** Claude Code (signed in with your Claude plan) shows your plan limits, such as the 5-hour and weekly limits, as Claude Code reports them. OpenRouter shows the dollars left on your key. Anthropic API, OpenAI, Groq and most compatible services show their short-term rate limits, which refill on their own; they are not your account balance. Ollama runs on your PC with no limits. Providers that report nothing (such as Gemini) show "Not reported", plus the tokens this session has used.

## Privacy

See **PRIVACY.md**. In short: prompts, the project details Zeni reads and any files you attach are sent to the AI provider you chose. Nothing else from your computer is uploaded. Zenframe has no servers and collects no analytics.

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
