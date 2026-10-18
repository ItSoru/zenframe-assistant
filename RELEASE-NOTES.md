# Version 1.3.1

- **Edit reviews respect your style.** Zeni treats editing choices as intentional (low or choppy frame rates, interpolated or slowed image sequences, stacked or overlapping adjustment layers, one-frame flashes, doubled grades, hard audio cuts, black endings, messy projects) and no longer lists them as problems. Without knowing your style, it gives a short breakdown of how the edit is built and asks what feedback you want. It only flags things that are broken in any style, phrased as questions, and judges creative choices on the style's own terms: sync, impact on beats, flow and pacing against the song. No more generic praise or cleanup tips.
- **Your editing style:** a new box in Settings. Describe how you edit and Zeni reads it before every review.
- **Dancing follows real playback.** After Effects keeps answering the panel during playback without moving its playhead, so 1.3.0 only danced while you dragged the time slider. Zeni now listens for After Effects' output level through Windows (the level only, never the sound) and dances from the playhead while the comp makes sound. He stops when the sound stops or the playhead jumps. Settings > Zeni shows how music is detected.
- Fixed: the paperclip menu (Files from this computer / Selected video layer) was hidden behind the edge of the message box.
- Fixed: the mic button looked like it stopped recording when the mouse was over it.

# Version 1.3.0

- **Zeni vibes to the music in your comp.** When a comp with a song plays, Zeni dances on the beat within a moment. The song's tempo and beat grid are worked out once, locally, from the audio file, including the layer's time stretch, and remembered. Under 105 BPM: a chill sway with his hands in his hoodie pockets. 105 to 160 BPM: head bob up and down. Over 160 BPM: head bob on every other beat. Smooth blending between poses and a soft smear on the head drop. While he is thinking, working, waiting for approval or showing an error he keeps that pose and only bounces. Settings > Zeni: **Dance to music** toggle, **Smear** and **Bounce** sliders. Nothing about the project changes and no audio leaves your computer.
- **New sitting spots:** the top of the conversation tab bar, the line under "zenframe / assistant", and the top of the Conversation/Scripts toggle, plus the message box and the panel floor. The edges glow while you drag him. He snaps on, follows the layout and remembers his spot. Double-click still sends him home.
- His hanging legs are click-through: clicks reach the tab or button under them.
- **Voice input:** mic button in the message box. Click, talk, click again; the words are typed where your cursor is. Recording level and time show on the button; Esc cancels; 3 minute limit. Engines: Groq Whisper or OpenAI Whisper with your saved key, or Windows speech recognition (free, offline). Settings > Voice picks the engine and microphone.
- **Video references:** attach a video file, or choose **Selected video layer** from the paperclip menu. Zenframe picks up to 12 key frames (first, last and the biggest changes) into one numbered contact sheet with timestamps. Works with every provider that reads images. Up to 12 files per message.

# Version 1.2.0

- **New provider: Codex** (second in the list). Runs Zeni on your ChatGPT plan through the Codex CLI on your PC, no API key needed, with the same After Effects tools, approval cards, effort levels and image attachments. Codex keeps its read-only sandbox, web search is off, and it uses your ChatGPT sign-in even if an OpenAI API key is set on the computer. If your Codex version blocks tools from other apps, Zeni says so instead of failing silently.

- **Attach files to a message:** paperclip button, drag and drop onto the message box, or paste an image. Files wait in the box (with thumbnails, name, size and ×) until you press Send; nothing is sent when you add them. Images and text files (scripts, expressions, JSON, CSV, subtitles, notes), up to 6 per message. Works with every provider, including Claude Code. Large images are resized to 1568 px. Images are sent once; later messages only mention them, so they do not keep costing tokens.
- **Usage gauge:** a small ring next to the connection status shows how much is left, turning amber when low and red at the limit. Click it for a card with each limit, when it resets, and the tokens this session used. The same card is in Settings under AI provider. Claude Code plan limits, OpenRouter credits, rate limits from Anthropic, OpenAI, Groq and compatible services, unlimited for Ollama.
- File chips stay clear of Zeni's legs, and the chat no longer slides sideways when something scrolls into view.
- Clearer message when a model cannot read images.
- When Claude Code only reports that you are within your plan limits (it shares exact percentages only near a limit), the gauge shows a full ring with a check and explains why. Session token counts include cached tokens.

# Version 1.1.0

- Zeni is about a third larger and drawn from higher-resolution sprites, so he stays sharp while sitting and while you drag him.
- Drop Zeni anywhere and he stays there, thought bubble and all. Double-click him to send him back to his seat on the message box. On the left half of the panel his thought bubble opens to his right.
- Settings > Zeni > **Size** makes him smaller or bigger (60% to 160%). He keeps his spot when resized.
- Swing physics: when you drag him, his feet trail behind the movement (inertia plus air drag) instead of pointing the way you move.
- Added Zeni beside the composer using the eight supplied PNG poses, with a common crop and shared seat anchor. Original character art is retained; only transparent trimming, downscaling and the optional accent recolor are applied.
- Moods follow replies, tools, approvals, completion, Stop and errors. The accessible activity status now also appears in a compact thought bubble.
- Click to wave; drag to pick up with a damped pendulum, release to fall, bounce once and hop back. Reduced-motion mode removes swing and decorative animation.
- Accent recoloring runs locally from embedded PNG data, changes his hoodie, hair streak, eyes, headphones and shoes to your accent color while keeping skin, black hair, the outline and white areas as drawn, preserves source lightness, caches colors and falls back to originals.
- Added a saved Show Zeni setting near Wallpaper, on by default. Turning it off restores the original layout and visible activity line.
- Existing CSP, approval controls, runtime safeguards and installer layout remain in place. No Claude Code binary was changed or added.

# Version 1.0.9

- **Zeni knows your installed tools.** Ask "what scripts do I have?" or "find me a shake preset": Zeni can list your extension panels (Window > Extensions), ScriptUI panels (Window menu), scripts and animation presets, and search them by name or folder.
- **Opens panels for you.** "Open Flow" or "open Duik" opens that panel. Zeni can't see or click inside other panels, so it tells you what to do there.
- **Runs your installed scripts, always with your OK.** Every run shows a card with **Run** and **Decline**, even when Auto-apply is on. A script runs as one Undo step, but scripts can do things Undo can't reverse.
- **Applies your presets (.ffx)** to layers, through the normal edit approval card.
- The Stop button's square is centered and rounded.
- Settings > AI provider notes that Zenframe is tested with, and works best with, Claude Code.
- Only tools found in After Effects' own Scripts and Presets folders, your user Scripts folder, Documents\Adobe\After Effects <year>\User Presets and the Adobe extensions folders can be used. Startup and shutdown scripts are never run.

# Version 1.0.8

- **Fixed: After Effects froze when Zeni searched your effects.** After Effects rebuilds its whole effects list each time it is read, and Zenframe read it for every effect. It now reads the list once per session, so searching is quick even with thousands of plugins.

# Version 1.0.7

- **Wallpaper visibility** slider: show more of your wallpaper. At 0 (Most readable) the image is darkened exactly enough to guarantee readable text; higher values show more of the image and give text a dark outline instead.

# Version 1.0.6

- **Wallpaper:** choose any image in Settings > Wallpaper to show behind the panel, with a liquid-glass look on the bars, message box, tabs and cards.
- **Always readable:** Zenframe measures each image and darkens it exactly as much as needed, so text never sits on anything brighter than a mid-dark gray. Very bright images come out darker; dark images stay almost untouched.
- **Palette from the image:** the accent color is picked from the wallpaper automatically, and up to five colors from it are offered to choose from. Turn off "Match the accent color to the wallpaper" to keep your own.
- **Glass blur** slider, from clear (0 px) to heavy frost (60 px).
- Without a wallpaper the panel looks exactly as before.

# Version 1.0.5

- **Formatted replies:** Zeni's answers show as real formatting: bold and italic text, headings, bullet and numbered lists, tables, quotes and code. Tables scroll sideways in narrow panels. Code blocks keep their **Open in script editor** button. Your own messages stay plain text.
- Formatting is drawn safely: anything in a reply that looks like HTML is shown as text, and links show their address on hover instead of opening.
- **Complete effects list:** asking Zeni which effects or plugins you have now returns every installed effect once, without repeats or a cut-off list. Zeni can also list only third-party plugins.
- No white outline around buttons and tabs after clicking them. A ring in your accent color still shows where you are when you move around with the Tab key.

# Version 1.0.4

**Conversations**
- Multiple conversations as tabs: new (＋ or Ctrl+T), switch (click or Ctrl+Tab), rename (double-click), close (× twice).
- Each conversation keeps its own messages and its own AI memory, and they are saved between sessions.
- Read other tabs while Zeni works; an approval request brings you back to the right tab.
- When the AI has no memory of a conversation (after reopening AE, or a new provider/model), it gets the recent messages as context.

**Effort and models**
- New effort slider in the message box. Claude (Claude Code and the Anthropic API): Low, Medium, High, Extra, Max. Other providers: Low, Medium, High.
- Sent as `--effort` to Claude Code, `output_config.effort` to the Anthropic API, and `reasoning_effort` (OpenRouter: `reasoning.effort`) to the others. If a model does not accept a level, Zeni steps down automatically and tells you once.
- The top level glows in your accent color with drifting sparkles.
- Claude Code lists real model versions (for example claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5, claude-fable-5-1); with an Anthropic key, Load models fetches the live list.
- The Model setting is a regular dropdown (the old list could not open inside After Effects), remembers the loaded list, and accepts a typed model name.

**Approving edits**
- New switch under the message box: **Ask before edits** or **Auto-apply edits**. It takes effect immediately, even mid-reply.
- **Always apply** button on approval cards.

**Bring your own AI**
- New providers: Groq, OpenRouter (with a "free models only" filter), Google Gemini, Ollama (local), Anthropic API, OpenAI, and any custom OpenAI-compatible service. Claude Code remains available.
- These providers are called directly by the panel, so Claude Code and Node.js are only needed for the Claude Code option.
- Load models straight from the provider; OpenRouter lists only models that support tool calling.
- One encrypted key per provider (Windows DPAPI, current user only). Keys are only sent to their own provider and are scrubbed from any error message.
- Base URLs must use https (plain http only for localhost).
- Removed the in-panel "Sign in with Claude" button. Claude Code logins are done with Claude Code itself (`claude auth login`), or Claude Code can use your Anthropic API key.
- Clear "independent product" wording in the panel, README, license and notices.

**Safety**
- Edits can be approved by you: each batch shows the exact changes before anything is applied.
- Every batch is fully checked before anything is applied. An invalid action now changes nothing, and adding layers earlier in a batch no longer shifts later edits onto the wrong layer.
- Scripts that touch files, run system commands, open network connections, quit AE, or change preferences show a warning and need a second click.
- Tool arguments are read with a strict JSON parser instead of being evaluated as code.
- The panel has a Content Security Policy and cannot load remote content.
- The local bridge checks the Host header and compares its secret in constant time.

**Reliability**
- Finds Claude Code and Node.js through PATH and common install locations (npm, native installer, nvm, scoop) and checks for Node.js 18 or later.
- Approval waits no longer hit the 90-second tool timeout.
- Runaway tool loops stop after 24 steps; a failed reply no longer leaves a broken conversation behind.
- Fixed garbled icons and symbols in the panel (the HTML file was double-encoded).
- Supported hosts set to After Effects 2022 and later; Windows only.

**Install and uninstall**
- The installer saves your original Adobe debug settings; the uninstaller offers to restore them and to delete saved API keys.
- New: LICENSE.txt, PRIVACY.md.
- Motion system rewritten from scratch.


# Version 1.0.2

- Zenframe Assistant extension identity and Zeni chat persona.
- Direct-edit and script-review workflows.
- Installer integrity checks, previous-version backups and recovery on copy failure.
- Recoverable uninstaller.
