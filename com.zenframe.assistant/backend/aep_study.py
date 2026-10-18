# Zenframe Assistant 1.4.0: study an After Effects project file (.aep) without opening it.
# Uses the open-source py-aep library (pip install py-aep). Read-only: the file is parsed, never written.
# Usage: python aep_study.py <file.aep> [overview|comp|keys] [comp name]
# Prints one JSON object on stdout.
import sys, json, re, collections, statistics, time

OVERLAY = re.compile(r'overlay|green ?screen|dust|grunge|spark|flare|leak|fog|smoke|fire|ash|light ?leak|lens|particle|rain|glitch|solid|null|adjustment|logo|text|title|\.png|\.jpe?g', re.I)


def out(obj):
    sys.stdout.write(json.dumps(obj, default=str, separators=(',', ':')))
    sys.stdout.flush()


ENUMS = {}


def enum_name(v, kind=None):
    # Values come back as enum members or, for some projects, as raw numbers.
    if isinstance(v, int) and kind:
        try:
            import py_aep
            return getattr(py_aep, kind)(v).name
        except Exception:
            pass
    return str(v).split('.')[-1]


def r3(x):
    return round(float(x), 3)


def main():
    if len(sys.argv) < 2:
        return out({'error': 'No project file given.'})
    path, mode = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'overview')
    want = sys.argv[3] if len(sys.argv) > 3 else ''
    try:
        import py_aep
    except Exception:
        return out({'error': 'missing-library', 'message': 'The py-aep library is not installed.'})
    t0 = time.time()
    try:
        app = py_aep.parse(path)
    except Exception as e:
        return out({'error': 'Could not read this project: ' + str(e)[:300]})
    p = app.project
    comps = list(p.compositions)
    by_name = collections.defaultdict(list)
    for c in comps:
        by_name[c.name].append(c)
    used = collections.Counter()
    for c in comps:
        for l in c.layers:
            s = getattr(l, 'source', None)
            if isinstance(s, py_aep.CompItem):
                used[s.id] += 1

    # The main comp: the top-level comp with the most going on inside it.
    weight = {}
    def size(c, depth=0, seen=None):
        if c.id in weight:
            return weight[c.id]
        if depth > 12:
            return 1
        n = 0
        for l in c.layers:
            n += 1
            s = getattr(l, 'source', None)
            if isinstance(s, py_aep.CompItem):
                n += size(s, depth + 1)
        weight[c.id] = n
        return n
    top = [c for c in comps if used[c.id] == 0]
    for c in top:
        size(c)
    top.sort(key=lambda c: -(weight.get(c.id, 0) * max(c.duration, 0.1)))
    main_comp = (by_name.get(want) or [None])[0] if want else (top[0] if top else (comps[0] if comps else None))
    if main_comp is None:
        return out({'error': 'No composition named "%s".' % want if want else 'This project has no compositions.'})
    fps = float(main_comp.frame_rate or 30)

    if mode == 'comp' or mode == 'keys':
        return out(comp_detail(py_aep, main_comp, fps, mode == 'keys'))

    stats = walk(py_aep, main_comp, fps)
    result = {
        'file': path.replace('\\', '/').split('/')[-1],
        'parseSeconds': round(time.time() - t0, 1),
        'project': {'items': p.num_items, 'comps': len(comps), 'topLevelComps': [
            {'name': c.name, 'size': [c.width, c.height], 'fps': round(c.frame_rate, 3), 'duration': r3(c.duration), 'layersInside': weight.get(c.id, 0)} for c in top[:8]]},
        'mainComp': {'name': main_comp.name, 'size': [main_comp.width, main_comp.height], 'fps': round(fps, 3), 'duration': r3(main_comp.duration)},
    }
    result.update(stats)
    result['note'] = 'Times are in main-comp seconds. Clip changes are estimated from video and precomp layers that are not overlays. Use mode "comp" with a comp name for its layers, or "keys" for its keyframes.'
    out(result)


def walk(py_aep, main_comp, fps):
    fx, fxm, sw, props = collections.Counter(), {}, collections.Counter(), collections.Counter()
    ease = collections.defaultdict(lambda: {'spanFrames': [], 'outInfluence': [], 'inInfluence': [], 'values': []})
    clips, audio, markers = [], [], []
    st = {'layers': 0, 'depth': 0}

    def kf_walk(group, layer, off, k, depth=0):
        try:
            kids = list(group)
        except Exception:
            return
        for pr in kids:
            kf = getattr(pr, 'keyframes', None)
            if kf is None:
                if depth < 6:
                    kf_walk(pr, layer, off, k, depth + 1)
                continue
            if not kf:
                continue
            name = getattr(pr, 'name', '?')
            props[name] += 1
            e = ease[name]
            times = []
            for kfi in kf[:30]:
                try:
                    times.append(float(kfi.time))
                except Exception:
                    pass
                try:
                    e['outInfluence'].append(round(kfi.out_temporal_ease[0].influence))
                    e['inInfluence'].append(round(kfi.in_temporal_ease[0].influence))
                except Exception:
                    pass
            for a, b in zip(times, times[1:]):
                e['spanFrames'].append(round(abs(b - a) * k * fps))
            if name in ('Scale',) and len(e['values']) < 12:
                try:
                    vals = []
                    for kfi in kf[:4]:
                        v = kfi.value
                        vals.append(round(v[0] if isinstance(v, (list, tuple)) else v))
                    e['values'].append(vals)
                except Exception:
                    pass

    def visit(comp, off, k, win, depth, path):
        st['depth'] = max(st['depth'], depth)
        for l in comp.layers:
            st['layers'] += 1
            if st['layers'] > 20000:
                return
            try:
                a = max(win[0], off + k * l.in_point)
                b = min(win[1], off + k * l.out_point)
            except Exception:
                continue
            if b <= a:
                continue
            try:
                if not l.enabled and not getattr(l, 'has_audio', False):
                    continue
            except Exception:
                pass
            s = getattr(l, 'source', None)
            adj = bool(getattr(l, 'adjustment_layer', False))
            for key in ('adjustment_layer', 'motion_blur', 'three_d_layer', 'time_remap_enabled', 'collapse_transformation'):
                try:
                    if getattr(l, key):
                        sw[key] += 1
                except Exception:
                    pass
            try:
                bm = enum_name(l.blending_mode, 'BlendingMode')
                if bm != 'NORMAL':
                    sw['blend ' + bm.lower()] += 1
            except Exception:
                pass
            try:
                tm = enum_name(l.track_matte_type, 'TrackMatteType')
                if tm not in ('NO_TRACK_MATTE', 'NONE'):
                    sw['track matte'] += 1
            except Exception:
                pass
            try:
                if l.parent is not None:
                    sw['parented'] += 1
            except Exception:
                pass
            try:
                fb = enum_name(l.frame_blending_type, 'FrameBlendingType')
                if fb not in ('NO_FRAME_BLEND', 'NONE'):
                    sw['frame blending ' + fb.lower()] += 1
            except Exception:
                pass
            try:
                for ef in l.effects:
                    fx[ef.name] += 1
                    fxm[ef.name] = getattr(ef, 'match_name', '')
            except Exception:
                pass
            try:
                kf_walk(l, l, off, k)
            except Exception:
                pass
            try:
                for m in l.markers:
                    markers.append(r3(off + k * m.time))
            except Exception:
                pass
            name = getattr(l, 'name', '') or getattr(s, 'name', '')
            is_comp = isinstance(s, py_aep.CompItem)
            remap = bool(getattr(l, 'time_remap_enabled', False))
            # Audio from files
            try:
                f = s.main_source.file if (s is not None and not is_comp) else None
            except Exception:
                f = None
            if f and getattr(l, 'has_audio', False) and not getattr(l, 'has_video', False):
                audio.append({'name': name[:80], 'file': str(f), 'start': r3(off + k * l.start_time), 'in': r3(a), 'out': r3(b), 'stretch': round(k * l.stretch, 2)})
            if is_comp and depth < 10 and not remap:
                visit(s, off + k * l.start_time, k * l.stretch / 100.0, (a, b), depth + 1, path + [name])
            elif not adj and (is_comp or (s is not None and getattr(l, 'has_video', False))) and not OVERLAY.search(name + ' ' + str(getattr(s, 'name', ''))):
                clips.append(r3(a))

    visit(main_comp, 0.0, 1.0, (0.0, float(main_comp.duration)), 0, [])
    cuts = sorted(set(t for t in clips if t > 1.0 / fps))
    gaps = [round((b - a) * fps) for a, b in zip(cuts, cuts[1:]) if b - a > 0.5 / fps]
    ease_out = {}
    for name in ('Scale', 'Position', 'Rotation', 'Time Remap', 'Amplitude', 'Blur Radius', 'Opacity'):
        e = ease.get(name)
        if not e or not e['spanFrames']:
            continue
        ease_out[name] = {
            'keyedProperties': props[name],
            'commonSpanFrames': collections.Counter(e['spanFrames']).most_common(5),
            'commonOutgoingInfluence': collections.Counter(e['outInfluence']).most_common(4),
            'commonIncomingInfluence': collections.Counter(e['inInfluence']).most_common(4),
        }
        if e['values']:
            ease_out[name]['examples'] = e['values'][:10]
    music = sorted(audio, key=lambda x: -(x['out'] - x['in']))
    return {
        'layersWalked': st['layers'], 'nestingDepth': st['depth'],
        'switches': sw.most_common(14),
        'effects': [[n, c, fxm.get(n, '')] for n, c in fx.most_common(40)],
        'effectKinds': len(fx),
        'animatedProperties': props.most_common(20),
        'motion': ease_out,
        'clipChanges': {'count': len(cuts), 'times': cuts[:150], 'commonLengthsFrames': collections.Counter(gaps).most_common(8),
                        'medianLengthFrames': statistics.median(gaps) if gaps else None},
        'audio': {'layers': len(audio), 'longest': music[:8], 'shortLayers': sum(1 for x in audio if x['out'] - x['in'] < 4)},
        'markers': sorted(set(markers))[:80],
    }


def comp_detail(py_aep, comp, fps, with_keys):
    layers = []
    for l in list(comp.layers)[:150]:
        s = getattr(l, 'source', None)
        o = {'i': getattr(l, 'index', None), 'name': getattr(l, 'name', '')[:60], 'in': r3(l.in_point), 'out': r3(l.out_point)}
        try:
            o['source'] = s.name[:60] if s is not None else None
            o['kind'] = 'precomp' if isinstance(s, py_aep.CompItem) else ('adjustment' if l.adjustment_layer else type(l).__name__)
        except Exception:
            pass
        try:
            o['effects'] = [ef.name for ef in l.effects][:12]
        except Exception:
            pass
        for key in ('time_remap_enabled', 'motion_blur', 'three_d_layer'):
            try:
                if getattr(l, key):
                    o[key] = True
            except Exception:
                pass
        try:
            if l.parent is not None:
                o['parent'] = l.parent.name
        except Exception:
            pass
        if with_keys:
            keys = []
            def kw(group, pathn, depth=0):
                try:
                    kids = list(group)
                except Exception:
                    return
                for pr in kids:
                    kf = getattr(pr, 'keyframes', None)
                    if kf is None:
                        if depth < 6:
                            kw(pr, pathn + [getattr(pr, 'name', '?')], depth + 1)
                        continue
                    if not kf or len(keys) >= 12:
                        continue
                    ks = []
                    for kfi in kf[:8]:
                        try:
                            v = kfi.value
                            v = [round(x, 2) for x in v][:3] if isinstance(v, (list, tuple)) else (round(v, 3) if isinstance(v, float) else (v if isinstance(v, (int, str)) else None))
                        except Exception:
                            v = None
                        item = {'t': r3(kfi.time), 'v': v}
                        try:
                            item['interp'] = [enum_name(kfi.in_interpolation_type, 'KeyframeInterpolationType').lower(), enum_name(kfi.out_interpolation_type, 'KeyframeInterpolationType').lower()]
                            item['ease'] = {'in': [round(e.influence) for e in kfi.in_temporal_ease][:1], 'out': [round(e.influence) for e in kfi.out_temporal_ease][:1]}
                        except Exception:
                            pass
                        ks.append(item)
                    keys.append({'prop': ' > '.join((pathn + [getattr(pr, 'name', '?')])[-3:]), 'keys': ks})
            try:
                kw(l, [])
            except Exception:
                pass
            if keys:
                o['keys'] = keys
        layers.append(o)
    return {'comp': comp.name, 'size': [comp.width, comp.height], 'fps': round(fps, 3), 'duration': r3(comp.duration), 'layerCount': len(comp.layers), 'layers': layers}


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        out({'error': 'The project reader stopped: ' + str(e)[:300]})
