'use strict';
// Zenframe Assistant 1.4.0: the editing style library Zeni reads before reviewing an edit.
// Written from the descriptions of an editor in the community and from reference edits analyzed with
// Zenframe's own seeing and hearing tools. "Reference" numbers come from one or two real edits each: they show
// what is normal for the style, not rules.

const COMMON = [
  'Editors sync to what they hear (snares, kicks, vocal accents, lyric words, drops), not to a metronome grid. A cut that is a few frames off the beat grid but on a snare or a word is on time. Never call a cut off-beat from the grid alone: check the hits and render the moment.',
  'Low frame rates (12 to 24 fps), 4:3 or odd canvas sizes, heavy grades, letterbox bars that come and go, watermarks and end cards are normal across these styles.',
  'Shake, warp and time-remap jumps look like cuts in the audio analysis. Read the timeline (layer types and keyframes) before treating something as a cut.',
  'Sound effect layers (whooshes, impacts, risers, vocal samples) are part of the music. Strong editors often sync flashes and transitions to SFX hits instead of the song, and the SFX layer can carry the calm/loud contrast when the song is loud throughout. Check the hits of every audio layer.',
  'Comp markers placed before cutting usually mark the beats the editor chose to cut on; read them as the editor\'s own beat map.',
  'When the beat is not a whole number of frames, clip lengths alternate (for example 9 and 10 frames for a half beat at 23.976 fps) to stay on the grid. That is precision, not inconsistency.',
  'Heavy sections are often pre-rendered and placed over or under the live comps. Look at the comp that is actually visible before judging what is built where.'
];

const STYLES = [
  {
    id: 'flow-amv', name: 'Flow AMV', aliases: ['flow', 'amv', 'anime music video', 'flow edit'],
    summary: 'Anime clips from one or many shows, aligned so movement, shapes and direction carry from one clip into the next, joined with a wide range of transitions. One of the most visually impressive styles.',
    defines: [
      'Clip-to-clip flow: motion, framing, color or a shape in one clip lines up with the next so the cut feels continuous (match cuts, motion-matched whips, zoom-throughs, light flashes, masks and wipes).',
      'Many clips, often from different anime; clip changes every one to two beats in busy parts.',
      'Transitions and their timing are the main skill: motion blur, directional blur, zoom and rotation carries, flashes, glow, light streaks and spark overlays.',
      'Strong grade and contrast, dark crushes, glow; VFX overlays (sparks, fire, light leaks); occasional 3D objects or text and a creator tag.',
      'Radial blur in and out of almost every cut (often two one-frame radial-blur layers on each side of the cut), with the subject kept in the center so the zoom blur covers the join without tracking.',
      'Scale hand-offs: one shot pushes in to a point, the next starts small at the same point or zooms out from far oversized (well above 150%) to land; zooms usually live on a parent null above each clip.',
      'One-frame flash frames as punctuation: threshold, zebra or line patterns, dither, pixel effects, solid black or white frames, often several in a row through builds and the ending.',
      'Zoom rigs: the clip precomp (scaled slightly over 100%) parented to a zoom null, sometimes under a static pivot null at the comp center.',
      'Each clip is its own small rig: the clip precomp (edges repeated or tiled so shakes and zooms never show borders, a warp, levels), a parent null for the zoom, and shake, flicker and heat-distortion adjustment layers on top. Adjustment layers often fade in over the frames before a cut.',
      'Graphic interrupts that are not anime: color bars and glitches, silhouettes, dips to black, a white frame.',
      'Clips are time-remapped inside their precomps, often with Twixtor underneath for clean in-between frames: a jump of many source frames on the first frame, a burst that eases hard into near slow motion, then a 1-2 frame jump out (forward smear) right before the next cut. Overlays on the clip are retimed with the same shape. Footage is often upscaled and frame-interpolated first so the slow parts stay smooth; frame blending (pixel motion) or RSMB adds motion blur instead of layer motion blur.',
      'Zooms and shakes are short, two-keyframe moves timed to the grid: a scale push or landing over a half beat or a beat (or a 1-2 frame snap), shake amplitude spiking and decaying over about 8 frames, blur bursts of about 3 frames. Easing is lopsided and consistent: a fast start (outgoing influence about 5-14%) and a long soft landing (incoming about 50-85%), often the same ease copied across every property of one rig. Moves end one frame before the next cut and hold. Build-up shakes use the inverse curve (slow start, sharp arrival) and peak a couple of frames before the cut.',
      'Overlays everywhere: keyed blood and smoke, ash, sparks, energy leaks (unmultiplied), dust and grunge, logo or title cards; characters sometimes isolated with roto for depth.',
      'Sound design is part of the edit: dozens of whooshes, impacts, glitches, ambience and anime voice lines layered over the song, and the song itself cut and rearranged into sections.',
      'Most layers are adjustment layers: in a top project well over half of all layers carried effects for one moment only (radial blur, fractal-noise displacement, levels and tint, glow, flicker, shake).'
    ],
    intentional: ['Very fast clip changes, and 1-frame clips or flash frames (even one every other frame in a build)', 'Heavy motion blur, radial blur and smear on transitions', 'Dark, crushed or strongly tinted grades; double sharpening and film emulation', 'Warm and cool color swapping from shot to shot', 'Mixing many shows, and adding non-anime overlays (blood, glitch spheres, CRT, energy)', 'Clips cut mid-action, held frames on landings', 'Deeply nested precomps (clip > precomp > section > edit > main) and hundreds of layers', 'Locking to exactly one beat per clip for a whole section', 'A slow, quiet intro or fade-out ending'],
    good: [
      'Every transition hides the cut: the motion direction, speed and position of the subject continue across it.',
      'Transitions land on hits; the biggest transitions go on the biggest moments (drop, snare rolls, vocal accents).',
      'Clips are chosen for motion that fits the music: calm shots in calm parts, impact frames on impacts.',
      'Consistent grade so clips from different shows feel like one piece.',
      'Matches across the cut: eye lines at the same height, shapes and impact points at the same spot, the movement direction (diagonal, horizontal, toward camera) continuing into the next shot. When directions clash, a radial flash frame resets the eye first.',
      'Structure: a fast, flash-heavy intro, a build on the SFX, a steady section locked to the beat, then a stutter (1-frame clips) right before the final section, which gets its own grade switch.',
      'The biggest transitions (whips, tunnels, grade switches, the ending) sit on the strongest hits.',
      'Cuts locked to a half-beat or one-beat grid through whole sections, with the sound design filling the hits in between.'
    ],
    mistakes: [
      'A transition where motion reverses or jumps across the cut (subject on the left flies in from the right).',
      'Transitions that happen between hits, or the same transition repeated so often it gets predictable.',
      'Clips with burned-in subtitles, logos or letterbox mismatches left visible by accident.',
      'Grade that changes sharply between clips without a reason.'
    ],
    review: 'Render the frame before, on and after each transition around strong hits; check that motion, eye lines and center points carry through. Compare transition times with the hits of the song and the SFX, not the grid. Inspect a clip rig (precomp, null, adjustment layers) to see how shakes and zooms are built.',
    reference: 'jrv.y flow AMV: 23.976 fps, 1280x720, 152 BPM, about 1.5 clip changes per second (one every ~1.6 beats), many shows, dark grade with spark and light overlays, fades out at the end. A top editor\'s project (18 fps, 1920x1080, 12.4 s, about 250 layers, 27 numbered precomps, Sapphire/Universe/Bokeh/FilmConvert): middle section locked to 14-frame clips exactly on the beat, flash frames 0 frames from SFX hits, zooms landing from 176-301% or pushing in from 81-90%, eye-line and center-point matches, warm/cool swaps, a Tritone red grade for the last section. A second top project (23.976 fps, 1920x1080, 70 s, about 1,470 layers nested 5 deep, 442 comps, 869 adjustment layers, 151 time-remapped clips, over 100 SFX layers): 85 clip changes locked to half beats and beats of a 77.5 BPM song (clips of 9-10 and 18-19 frames), most-used effects radial blur, fractal noise, levels, tint, CC RepeTile, glow looks, S_Flicker, S_Shake, Bokeh, directional blurs.'
  },
  {
    id: 'jugg', name: 'Jugg edit', aliases: ['jugg', 'juggs', 'jugg edit'],
    summary: 'A simple style that can be excellent when well executed: mostly one clip, time-remapped like a velocity edit, at a low frame rate, with warp and low-frequency shakes.',
    defines: [
      'One clip (or very few) carries most of the edit; the same moments are replayed, reversed and held with time remapping.',
      'Low frame rate (around 18 fps) for a choppy feel.',
      'Warp and low-frequency shakes (wavy distortion, slow heavy shakes) on hits, white flashes, blur bursts.',
      'Often small lyric captions at the bottom, simple grade (one or two tints), 4:3 canvas.'
    ],
    intentional: ['Repeating the same clip and frames many times', 'Low fps and stutter', 'Overlapping adjustment layers that stack shakes and warps', 'Hard speed changes', 'Plain or no transitions', 'Black or white ending'],
    good: [
      'Speed ramps and replays follow the music: fast where it hits, slow or held where it breathes.',
      'Shakes and warps land on the hits and fade naturally; the strongest hits get the strongest warp.',
      'The chosen clip has enough motion and expression to carry the whole song.',
      'Captions (if any) are timed to the words.'
    ],
    mistakes: [
      'Speed changes that do not match the music, or ramps that stutter by accident (a missing keyframe or wrong easing).',
      'Shakes on every beat with the same strength so nothing stands out.',
      'An effect keyframed so it never shows (for example a warp with Amount 0).',
      'Captions out of sync with the vocals.'
    ],
    review: 'Use the timeline: time remap keyframes and shake keyframes against the hits. Render a few frames on the strongest hits to see warp strength.',
    reference: 'smokinsasa jugg edit: 18 fps, 1440x1080 (4:3), 117 BPM, one Hunter x Hunter clip replayed throughout, blue/purple grade, warp and blur shakes, white flashes, small lyric captions. The user\'s own Howumove edit (20 fps, 140 BPM, gameplay clips, S_Shake and Turbulent Displace per cut, black ending) is a jugg edit too.'
  },
  {
    id: 'velocity', name: 'Velocity', aliases: ['velocity', 'velo', 'speed ramp'],
    summary: 'Time remapping (speed ramps) of a clip to the music with very little else, sometimes a few zooms. Seen as a low-effort style.',
    defines: ['Speed ramps: slow-motion between hits, fast bursts into them.', 'Few or no effects beyond occasional zooms or shakes.', 'Usually one or a few clips.'],
    intentional: ['Few effects', 'Very simple structure', 'Low fps or frame blending'],
    good: ['Ramps that hit exactly on the beat and ease smoothly', 'Clip choice with clear motion so the speed changes read', 'Variety in ramp shapes across the song'],
    mistakes: ['Ramps landing early or late on hits', 'Same ramp shape repeated for the whole song', 'Jerky ramps from linear keyframes when smooth ones were intended'],
    review: 'Compare time remap keyframes with the hits; render frames on ramps to check readability.',
    reference: 'No reference edit yet.'
  },
  {
    id: 'mograph', name: '3D / typography / motion graphics', aliases: ['3d', 'typography', 'typo', 'mograph', 'motion graphics', 'lyric edit', 'lyrics'],
    summary: 'Many null layers and camera moves through 3D space, usually following the lyrics word by word, with 3D objects and cut-outs. The most respected style in the community.',
    defines: [
      'Text animated to the lyrics: words appear on the syllable, with 3D extrusion, outlines, glow and bold type.',
      'A 3D camera moving through scenes, driven by lots of null layers; scenes built from 3D objects, cut-out photos of the artist and props that match the words.',
      'Camera moves and scene changes replace hard cuts; continuous movement between scenes.',
      'Objects illustrate the lyrics literally (money, a jacket, diamonds, a rabbit).'
    ],
    intentional: ['Very few hard cuts', 'Dozens of nulls and parented layers', 'Literal, playful illustration of lyrics', 'Mixed fonts and colors per scene', 'A plain lyric-scroll or player-style ending'],
    good: [
      'Each word lands exactly on its syllable; emphasis words get the bigger animation.',
      'Camera moves have weight (eased, motion-blurred) and lead the eye to the next word.',
      'Readable text: contrast against the background, on screen long enough to read.',
      'Depth and lighting feel consistent across the scene.'
    ],
    mistakes: [
      'Words appearing early or late against the vocals.',
      'Text too small, too fast or low contrast to read.',
      'Linear, weightless camera moves or sudden jumps between scenes.',
      'Layers clipping through each other in 3D by accident, or missing motion blur on fast moves.'
    ],
    review: 'Text layer in-points and keyframes against the vocal hits; render frames on words and mid-move to check legibility and depth.',
    reference: 'heatzzs typography edit: 30 fps, 960x720 (4:3), 152 BPM, no hard cuts, word-by-word 3D text, scenes of money piles, a theater, a jacket store, diamonds; ends on a scrolling lyric screen.'
  },
  {
    id: 'mmv', name: 'MMV (manga music video)', aliases: ['mmv', 'manga', 'manga edit', 'manga music video'],
    summary: 'The style with the highest skill ceiling. Manga panels are cut out, redrawn and sometimes colored in Photoshop, imported as separate layers and animated piece by piece, with 3D backgrounds and visual effects. It often borrows from other styles, mostly mograph, with some time remapping.',
    defines: [
      'Panels split into many layers (characters, hair, background, speech bubbles, speed lines) animated separately for depth and parallax.',
      'Redrawn or cleaned art, sometimes fully colored; selective color on black and white art (one accent color).',
      'Visual effects added on top: fire, beams, energy, ink splatter, glow, light rays; 3D backgrounds and camera moves.',
      'Speech bubbles and manga text used as typography; slower emotional sections next to high-impact ones.',
      'Low frame rates (18 to 20 fps), letterbox bars that come and go.'
    ],
    intentional: ['Long holds on a single panel', 'Few hard cuts in emotional parts', 'Paper-white or ink-heavy looks', 'Blown-out glow and bloom in action parts', 'Visible sketch lines and ink texture', 'Odd canvas sizes'],
    good: [
      'Depth: layers move at different speeds so a flat panel feels 3D.',
      'Clean cut-outs (no leftover background or jagged edges) and redraws that match the original art.',
      'Effects that feel part of the art (matching line weight and color) and hit with the music.',
      'Pacing that follows the song\'s emotion: quiet panels in quiet parts, impact panels and effects on drops.'
    ],
    mistakes: [
      'Cut-out edges with halos or missing pieces, or a character layer moving without its shadow or hair.',
      'All layers moving together (no parallax), so the depth is lost.',
      'Effects that sit on top of the art without matching its style or light.',
      'Speech bubble text timed against the lyric it should match.'
    ],
    review: 'Render frames mid-move to check parallax and cut-out edges; check effect layers and keyframes against the hits.',
    reference: 'gekyoo MMVs: Tokyo Ghoul (20 fps, 1440x1080, 123 BPM, black and white with blue and red accents, 7 hard cuts in 26 s, speech bubbles as text, ink splatter, slow and emotional) and Dragon Ball (18 fps, 1486x1080, 122 BPM, colored panels, heavy glow and speed lines, about one cut per two beats, letterbox bars, watermark end card).'
  }
];

function find(q) {
  q = String(q || '').toLowerCase().trim();
  if (!q) return null;
  return STYLES.find(s => s.id === q || s.name.toLowerCase() === q) ||
    STYLES.find(s => s.aliases.some(a => a === q)) ||
    STYLES.find(s => s.aliases.some(a => q.includes(a)) || q.includes(s.id)) || null;
}

// What the ae_style_guide tool returns.
function guide(args) {
  const q = args && args.style;
  if (!q) return { styles: STYLES.map(s => ({ id: s.id, name: s.name, summary: s.summary })), common: COMMON, how: 'Call again with style set to an id to read its full guide.' };
  const s = find(q);
  if (!s) return { error: 'No guide for "' + String(q).slice(0, 60) + '".', styles: STYLES.map(x => x.id), note: 'If none fits, ask the user how their style works and judge it on its own terms.' };
  return Object.assign({ common: COMMON }, s);
}

module.exports = { STYLES, COMMON, find, guide };
