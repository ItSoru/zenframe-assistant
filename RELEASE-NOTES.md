# Version 1.0.3

**Bring your own AI**
- New providers: Groq, OpenRouter (with a "free models only" filter), Google Gemini, Ollama (local), Anthropic API, OpenAI, and any custom OpenAI-compatible service. Claude Code remains available.
- These providers are called directly by the panel, so Claude Code and Node.js are only needed for the Claude Code option.
- Load models straight from the provider; OpenRouter lists only models that support tool calling.
- One encrypted key per provider (Windows DPAPI, current user only). Keys are only sent to their own provider and are scrubbed from any error message.
- Base URLs must use https (plain http only for localhost).
- Removed the in-panel "Sign in with Claude" button. Claude Code logins are done with Claude Code itself (`claude auth login`), or Claude Code can use your Anthropic API key.
- Clear "independent product" wording in the panel, README, license and notices.

**Safety**
- Edits are approved by you: each batch shows the exact changes with Apply and Decline (can be turned off in Settings).
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
