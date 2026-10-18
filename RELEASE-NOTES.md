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
