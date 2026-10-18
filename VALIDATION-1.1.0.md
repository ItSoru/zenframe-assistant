# Zenframe Assistant 1.1.0 validation

This build was checked in a local Microsoft Edge browser, loading the actual panel from file:// with a simulated CEP/AI runtime. No AI service was called and no project was edited.

The new controller uses ES5-style syntax and browser APIs available in Chromium 88. Actual After Effects/CEP 88 execution and a clean-machine installation were not performed for this release.

Sprite artwork was not regenerated or redrawn. The supplied eight PNGs received a shared transparent crop and downscale to 393 x 384 pixels, about four times their display size. All poses retain the common seat coordinate. Sprite source SHA-256 values are recorded in zeni-sprites.js. Optional runtime accent recoloring is the only color modification.

Node syntax checks passed for app.js and zeni.js. The original CSP is preserved. No binary was added or modified. The release package is an unsigned Windows ZIP.

## Browser checks completed

- file:// data sprites, shared seat geometry, 90px-scale display, default UI
- actual app.js hooks with mock runtime: send/start/text/tool/error/approval/apply/end/Stop and transient timings
- pointer capture, driven swing, transformed viewport bounds, release/fall/landing/bounce/hop, click greeting
- theme recolor, protected head/white pixels, source lightness and alpha, cached color reuse, canvas-error original fallback
- reduced-motion no swing, settings/scripts overlay visibility, Show Zeni off restores original layout/activity and persists
- real wallpaper upload/palette integration, glass rendering and 300x420 layout

No browser script errors or CSP violations were reported. Recolor pixel checks: {"changed": 11208, "headChanges": 0, "whiteChanges": 0, "alphaChanges": 0, "maxLightness": 0}.
