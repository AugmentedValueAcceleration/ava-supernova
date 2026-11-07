/**
 * The Python that runs inside GIMP for design_build_image. A string so core
 * stays a single bundle; written to the OS temp folder before each run.
 * Proven on GIMP 3.2.6, 4 Nov 2026: an icon built, reopened and added to, a
 * second image joining the set, and every guard refusal confirmed.
 */
import { KIT_PY } from '../../brand/kit-py.js';

// prettier-ignore
export const GIMP_RUNNER_PY = String.raw`# Ava's GIMP runner. Started by design_build_image as:
#   gimp-console -i --batch-interpreter python-fu-eval -b "exec(open(r'runner.py').read())" --quit
# with AVA_GIMP_JOB pointing at the job file. It installs the guard, runs Ava's
# script, then saves every image she touched as .xcf, exports a PNG of each and
# builds a preview. The last line it prints is the result.
import sys, os, json, time, traceback, shutil
import gi
gi.require_version('Gimp', '3.0')
gi.require_version('Gegl', '0.4')
from gi.repository import Gimp, Gegl, Gio

JOB = json.load(open(os.environ['AVA_GIMP_JOB'], encoding='utf-8'))
ASSET_DIR = os.path.realpath(JOB['assetDir'])
STARTED = time.time()
result = {'ok': False, 'files': [], 'warnings': [], 'images': [], 'report': [], 'looks': []}
${KIT_PY}

def emit():
    sys.stdout.write('\n@@AVA_RESULT@@' + json.dumps(result) + '\n')
    sys.stdout.flush()

# ── The guard ────────────────────────────────────────────────────────────────
# Same as Blender's. GIMP's own file plug-ins run in other processes and are
# not seen here, which is why the tool also refuses absolute paths in the
# script itself. A guard, not a sandbox.
_TMP = os.path.join(ASSET_DIR, '.tmp')
os.makedirs(_TMP, exist_ok=True)
import tempfile
tempfile.tempdir = _TMP
_ALLOWED = [os.path.normcase(ASSET_DIR)]
def _inside(p):
    try:
        rp = os.path.normcase(os.path.realpath(os.fsdecode(p)))
    except Exception:
        return False
    return any(rp == a or rp.startswith(a.rstrip(os.sep) + os.sep) for a in _ALLOWED)
_BLOCKED = {
    'subprocess.Popen': 'starting other programs', 'os.system': 'starting other programs',
    'os.exec': 'starting other programs', 'os.posix_spawn': 'starting other programs',
    'os.spawn': 'starting other programs', 'os.startfile': 'opening files in other programs',
    'os.kill': 'stopping other programs', 'webbrowser.open': 'opening a browser',
    'socket.connect': 'network access', 'socket.bind': 'network access',
    'socket.getaddrinfo': 'network access', 'socket.gethostbyname': 'network access',
    'urllib.Request': 'network access', 'ctypes.dlopen': 'loading native code',
    'ctypes.dlsym': 'calling native code', 'ctypes.call_function': 'calling native code',
    'winreg.CreateKey': 'changing the registry', 'winreg.SetValue': 'changing the registry',
    'winreg.DeleteKey': 'changing the registry', 'winreg.DeleteValue': 'changing the registry',
}
_WRITE_ARGS = {
    'os.remove': (0,), 'os.rmdir': (0,), 'os.mkdir': (0,), 'os.chmod': (0,),
    'os.truncate': (0,), 'os.utime': (0,), 'shutil.rmtree': (0,),
    'os.rename': (0, 1), 'shutil.move': (0, 1), 'shutil.copyfile': (1,),
    'shutil.copytree': (1,), 'os.symlink': (1,), 'os.link': (1,),
}
_WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC
def _refuse(why):
    raise PermissionError(f'Blocked by the Design Studio guard: {why}. '
                          f'Scripts here may only make the image and write inside its own folder (ASSET_DIR).')
def _hook(event, args):
    if event in _BLOCKED:
        _refuse(_BLOCKED[event])
    if event == 'open':
        path, mode, flags = (list(args) + [None, None, 0])[:3]
        if path is None or isinstance(path, int):
            return
        writing = (isinstance(mode, str) and any(c in mode for c in 'wax+')) or \
                  (mode is None and isinstance(flags, int) and flags & _WRITE_FLAGS)
        if writing and not _inside(path):
            _refuse(f'writing outside the folder ({os.fsdecode(path)})')
    elif event in _WRITE_ARGS:
        for i in _WRITE_ARGS[event]:
            if i < len(args) and args[i] is not None and not isinstance(args[i], int) and not _inside(args[i]):
                _refuse(f'changing files outside the folder ({os.fsdecode(args[i])})')

# ── Helpers ──────────────────────────────────────────────────────────────────
_open = {}   # name -> Gimp.Image she touched this run

def _file(path):
    return Gio.File.new_for_path(path)

def _safe_name(name):
    n = ''.join(c if c.isalnum() or c in '-_' else '-' for c in str(name))
    while '--' in n:
        n = n.replace('--', '-')
    n = n.strip('-')
    if not n:
        raise ValueError('an image needs a name')
    return n

def ava_image(name=None, width=1024, height=1024):
    """The image called 'name' in this piece of work: opens its saved .xcf —
    including anything the person changed by hand in GIMP — or makes a new
    transparent one the first time. With no name, the work's only image, or the
    one named after the work. Call once per image; a set is several names.
    Everything you touch is saved and exported after your script. Each run is a
    new GIMP: this is the only way to reach saved work."""
    saved = sorted(f[:-4] for f in os.listdir(ASSET_DIR) if f.endswith('.xcf'))
    if name is None:
        name = saved[0] if len(saved) == 1 else JOB.get('name') or 'image'
    name = _safe_name(name)
    if name in _open:
        return _open[name]
    # One piece of work splitting into two files cost her eight runs: a name
    # that differs only in case or punctuation is the same image.
    same = [s for s in saved if s.lower().replace('-', '') == name.lower().replace('-', '')]
    if same:
        name = same[0]
    if name in _open:
        return _open[name]
    xcf = os.path.join(ASSET_DIR, name + '.xcf')
    if os.path.exists(xcf):
        img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, _file(xcf))
    else:
        img = Gimp.Image.new(width, height, Gimp.ImageBaseType.RGB)
        if saved:
            result['warnings'].append(f'ava_image("{name}") started a NEW image. This work already has: {saved}. If this is a new piece of the set, carry on; if you meant one of those, use its exact name.')
    _open[name] = img
    return img

def ava_layer(image, name='Layer', fill=None):
    """A new transparent layer the size of the image, on top. fill = a colour
    like '#f0a24b' floods it."""
    w, h = image.get_width(), image.get_height()
    lay = Gimp.Layer.new(image, name, w, h, Gimp.ImageType.RGBA_IMAGE, 100, Gimp.LayerMode.NORMAL)
    image.insert_layer(lay, None, 0)
    if fill:
        Gimp.context_set_foreground(Gegl.Color.new(fill))
        lay.fill(Gimp.FillType.FOREGROUND)
    return lay

def ava_place(image, path, name=None):
    """Bring an image file into 'image' as a new layer — a Blender render, a
    generated reference, another piece of the set. 'path' inside ASSET_DIR."""
    full = path if os.path.isabs(path) else os.path.join(ASSET_DIR, path)
    lay = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, image, _file(full))
    if name:
        lay.set_name(name)
    image.insert_layer(lay, None, 0)
    return lay

def ava_filter(layer, op, **props):
    """Run a GEGL filter on a layer and keep the result, e.g.
    ava_filter(lay, 'gegl:dropshadow', x=4.0, y=4.0, radius=8.0).
    Underscores in names become dashes."""
    f = Gimp.DrawableFilter.new(layer, op, '')
    cfg = f.get_config()
    for k, v in props.items():
        k = k.replace('_', '-')
        if isinstance(v, str) and v.startswith('#'):
            v = Gegl.Color.new(v)
        cfg.set_property(k, v)
    f.update()
    layer.merge_filter(f)
    return layer

def ava_export(image, filename, size=None):
    """Export a flattened copy into ASSET_DIR/exports — size=(w, h) for an
    exact size; PNG keeps transparency. The layered source is untouched."""
    out = os.path.join(ASSET_DIR, 'exports')
    os.makedirs(out, exist_ok=True)
    _visible(image)
    copy = image.duplicate()
    copy.merge_visible_layers(Gimp.MergeType.CLIP_TO_IMAGE)
    if size:
        copy.scale(int(size[0]), int(size[1]))
    Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, copy, _file(os.path.join(out, filename)), None)
    copy.delete()
    print(f'AVA_EXPORT: exports/{filename}')
    return 'exports/' + filename


_new_finals = []

def ava_final(image, filename, size=None):
    """Make a finished file: the real thing, not a test. It goes in final/, shows
    on the stage and in the Library, and is what brand kits offer. Use it when
    the piece is done and they are happy. A run that fails adds nothing."""
    _visible(image)
    out = os.path.join(ASSET_DIR, 'final')
    os.makedirs(out, exist_ok=True)
    copy = image.duplicate()
    copy.merge_visible_layers(Gimp.MergeType.CLIP_TO_IMAGE)
    if size:
        copy.scale(int(size[0]), int(size[1]))
    Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, copy, _file(os.path.join(out, filename)), None)
    copy.delete()
    _new_finals.append('final/' + filename)
    print(f'AVA_FINAL: final/{filename}')
    return 'final/' + filename


# ── Drawing helpers ──────────────────────────────────────────────────────────
# Her first logo lost 5 of 11 runs to GIMP 2 habits: a tuple where 3.2 wants
# separate numbers, Image.select_all, ChannelOps.ADD_EXCLUDE, layer.name. These
# are the verified 3.2 calls behind one shape vocabulary, so a step spends its
# run on the design and not on the API (4 Nov 2026).
Gimp.context_set_antialias(True)

_OPS = {'replace': Gimp.ChannelOps.REPLACE, 'add': Gimp.ChannelOps.ADD,
        'subtract': Gimp.ChannelOps.SUBTRACT, 'intersect': Gimp.ChannelOps.INTERSECT}

def _select(image, shape, op='replace'):
    mode = _OPS[op]
    if isinstance(shape, dict):
        if 'rect' in shape:
            x, y, w, h = shape['rect']
            r = shape.get('radius', 0)
            if r:
                image.select_round_rectangle(mode, x, y, w, h, r, r)
            else:
                image.select_rectangle(mode, x, y, w, h)
        elif 'ellipse' in shape:
            x, y, w, h = shape['ellipse']
            image.select_ellipse(mode, x, y, w, h)
        elif 'svg' in shape:
            w, h = image.get_width(), image.get_height()
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><path d="{shape["svg"]}"/></svg>'
            ok, paths = image.import_paths_from_string(svg, len(svg), True, False)
            if not ok or not paths:
                raise ValueError('That SVG path could not be read. Use d-attribute syntax: "M 10 10 C 40 0, 60 0, 90 10 Z"')
            image.select_item(mode, paths[0])
            for p in paths:
                image.remove_path(p)
        else:
            raise ValueError('A shape is a list of points, or rect=(x,y,w,h), ellipse=(x,y,w,h), or svg="M ... Z"')
    else:
        pts = [float(n) for n in shape]
        if len(pts) < 6 or len(pts) % 2:
            raise ValueError('A polygon is a flat list: [x1, y1, x2, y2, x3, y3, ...]')
        image.select_polygon(mode, pts)

def _shapes(shape):
    return shape if isinstance(shape, tuple) else (shape,)

def ava_fill(layer, shape, colour):
    """Fill a shape on a layer. shape: [x1,y1,x2,y2,...], dict(rect=(x,y,w,h),
    radius=12), dict(ellipse=(x,y,w,h)), or dict(svg="M 10 10 C ... Z") for
    smooth curves. Several shapes as a tuple are filled together."""
    image = layer.get_image()
    for i, s in enumerate(_shapes(shape)):
        _select(image, s, 'replace' if i == 0 else 'add')
    Gimp.context_set_foreground(Gegl.Color.new(colour))
    layer.edit_fill(Gimp.FillType.FOREGROUND)
    Gimp.Selection.none(image)
    return layer

def ava_cut(layer, shape):
    """Remove a shape from a layer: real transparency, for negative space."""
    image = layer.get_image()
    for i, s in enumerate(_shapes(shape)):
        _select(image, s, 'replace' if i == 0 else 'add')
    layer.edit_clear()
    Gimp.Selection.none(image)
    return layer

def ava_gradient(layer, shape, start, end, y0, y1):
    """Fill a shape with a vertical gradient between two colours, top to bottom
    from y0 to y1. Good for edge light and metal on a flat mark."""
    image = layer.get_image()
    for i, s in enumerate(_shapes(shape)):
        _select(image, s, 'replace' if i == 0 else 'add')
    Gimp.context_set_foreground(Gegl.Color.new(start))
    Gimp.context_set_background(Gegl.Color.new(end))
    Gimp.context_set_gradient_fg_bg_rgb()
    layer.edit_gradient_fill(Gimp.GradientType.LINEAR, 0.0, False, 1, 0.0, False, 0.0, float(y0), 0.0, float(y1))
    Gimp.Selection.none(image)
    return layer

def ava_fonts(match=''):
    """Font names installed here that contain 'match'."""
    return sorted(f.get_name() for f in Gimp.fonts_get_list(match))

# ── Layers ───────────────────────────────────────────────────────────────────
# Thirteen of the title logo's 24 failed runs were guesses at these jobs:
# layer.duplicate, lower_layer, layer.remove, moving layers between images.

def _named(image, ref):
    if not isinstance(ref, str):
        return ref
    for l in image.get_layers():
        if l.get_name() == ref:
            return l
    raise ValueError(f'No layer called "{ref}". Layers here: {[l.get_name() for l in image.get_layers()]}')

def ava_copy_layer(layer, name=None, into=None):
    """Copy a layer, on top of its own image or of another one (into=image)."""
    dest = into or layer.get_image()
    copy = Gimp.Layer.new_from_drawable(layer, dest)
    dest.insert_layer(copy, None, 0)
    _, x, y = layer.get_offsets()
    copy.set_offsets(x, y)
    if name:
        copy.set_name(name)
    return copy

def ava_remove(layer):
    """Delete a layer."""
    layer.get_image().remove_layer(layer)

def ava_move(layer, to=None, above=None, below=None):
    """Change a layer's place: to='top', to='bottom', above=other or below=other."""
    image = layer.get_image()
    last = len(image.get_layers()) - 1
    now = image.get_item_position(layer)
    if to == 'top':
        pos = 0
    elif to == 'bottom':
        pos = last
    elif above is not None:
        ref = image.get_item_position(_named(image, above))
        pos = ref if ref < now else ref - 1
    elif below is not None:
        ref = image.get_item_position(_named(image, below))
        pos = ref + 1 if ref < now else ref
    else:
        raise ValueError("Say where: to='top', to='bottom', above=layer or below=layer")
    image.reorder_item(layer, None, max(0, min(last, pos)))
    return layer

def _visible(image):
    if not any(l.get_visible() for l in image.get_layers()):
        raise ValueError('Nothing is visible in this image: every layer is hidden, or it has no layers.')

def ava_merged(image, layers=None, name='Merged'):
    """A merged copy of some layers as ONE new layer on top of the same image,
    leaving the originals editable. layers = names or layers; default is
    everything visible. This is the safe way to derive a glow or a shadow."""
    copy = image.duplicate()
    if layers is not None:
        keep = {l if isinstance(l, str) else l.get_name() for l in layers}
        missing = keep - {l.get_name() for l in copy.get_layers()}
        if missing:
            raise ValueError(f'No layer called {sorted(missing)}. Layers here: {[l.get_name() for l in copy.get_layers()]}')
        for l in copy.get_layers():
            l.set_visible(l.get_name() in keep)
    _visible(copy)
    merged = copy.merge_visible_layers(Gimp.MergeType.CLIP_TO_IMAGE)
    lay = Gimp.Layer.new_from_drawable(merged, image)
    image.insert_layer(lay, None, 0)
    _, x, y = merged.get_offsets()
    lay.set_offsets(x, y)
    lay.set_name(name)
    lay.set_mode(Gimp.LayerMode.NORMAL)
    lay.set_opacity(100.0)
    lay.set_visible(True)
    copy.delete()
    return lay

def ava_glow(image, layers=None, radius=24.0, opacity=50.0, colour=None, name='Glow'):
    """A real glow on its own switchable layer: a blurred merged copy, in Screen
    mode. Call it twice for a tight bloom plus a wide halo. opacity is 0-100."""
    if 0 < opacity <= 1:
        raise ValueError(f'opacity is 0-100, so {opacity} would be invisible. Did you mean {opacity * 100:g}?')
    lay = ava_merged(image, layers, name)
    lay.resize_to_image_size()   # a blur cannot spread past the layer's edge
    if colour:
        ava_filter(lay, 'gegl:color-overlay', value=colour)
    ava_filter(lay, 'gegl:gaussian-blur', std_dev_x=float(radius), std_dev_y=float(radius))
    lay.set_mode(Gimp.LayerMode.SCREEN)
    lay.set_opacity(float(opacity))
    return lay

def ava_pixel(image, x, y):
    """The colour you would really see at x, y in the whole image, as '#RRGGBB',
    or '#RRGGBBAA' where it isn't solid. Image coordinates, all layers combined."""
    copy = image.duplicate()
    _visible(copy)
    merged = copy.merge_visible_layers(Gimp.MergeType.CLIP_TO_IMAGE)
    _, ox, oy = merged.get_offsets()
    w, h = merged.get_width(), merged.get_height()
    lx, ly = int(x) - ox, int(y) - oy
    if not (0 <= lx < w and 0 <= ly < h):
        copy.delete()
        return '#00000000'
    c = merged.get_pixel(lx, ly)
    copy.delete()
    r, g, b, a = c.get_rgba_with_space(None)
    hex_ = '#%02X%02X%02X' % tuple(int(round(max(0.0, min(1.0, v)) * 255)) for v in (r, g, b))
    return hex_ if a >= 0.999 else hex_ + '%02X' % int(round(a * 255))

_TEST_NAMES = ('test', 'compare', 'comparison', 'thumb', 'proof', 'tmp', 'temp', 'scratch', 'draft', 'check', 'trial')

def _is_test(name):
    low = name.lower()
    return any(low == t or low.startswith((t + '-', t + '_', t + ' ')) for t in _TEST_NAMES)

def ava_images():
    """The saved images in this work, by name."""
    return sorted(f[:-4] for f in os.listdir(ASSET_DIR) if f.endswith('.xcf'))

# ── Seeing the work ──────────────────────────────────────────────────────────
# She only ever got the preview: every image in the folder on one sheet at
# 256px. Her exports and comparison sheets never reached her, so she measured
# pixels instead of looking (4 Nov 2026).
_LOOK_DIR = os.path.join(ASSET_DIR, '.look')
MAX_LOOKS = 4
_looks = []

def _path(p):
    full = p if os.path.isabs(p) else os.path.join(ASSET_DIR, p)
    if not os.path.exists(full):
        raise ValueError(f'There is no file at {p}. Paths are relative to the work, e.g. exports/name.png or references/art.png.')
    return full

def _load(what):
    if isinstance(what, str):
        return Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, _file(_path(what)))
    return what.duplicate()

def _is_colour(on):
    return isinstance(on, str) and on.startswith('#')

def _keep_look(img, label):
    if len(_looks) >= MAX_LOOKS:
        result['warnings'].append(f'Only {MAX_LOOKS} looks come back per run; "{label}" was left out.')
        return
    os.makedirs(_LOOK_DIR, exist_ok=True)
    path = os.path.join(_LOOK_DIR, f'{len(_looks) + 1}.png')
    Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, _file(path), None)
    _looks.append({'file': os.path.basename(path), 'label': label})

def ava_show(what, crop=None, on='#24242c', label=None):
    """Look at something as it really is, up to 1024px: an image, or a file such
    as 'exports/logo.png'. crop=(x, y, w, h) zooms in. on= is what shows through
    transparency: a colour, or a picture in the work such as
    'references/title.png'. Hidden layers stay hidden. Up to 4 come back to you."""
    img = _load(what)
    _visible(img)
    if crop:
        x, y, w, h = [int(n) for n in crop]
        img.crop(w, h, x, y)
    W, H = img.get_width(), img.get_height()
    _lay_on(img, on)
    img.flatten()
    k = 1024 / max(W, H)
    if k < 1 or crop:
        k = min(k, 8)
        Gimp.context_set_interpolation(Gimp.InterpolationType.NONE if k > 1 else Gimp.InterpolationType.CUBIC)
        img.scale(max(1, int(W * k)), max(1, int(H * k)))
        Gimp.context_set_interpolation(Gimp.InterpolationType.CUBIC)
    _keep_look(img, label or (what if isinstance(what, str) else 'the image'))
    img.delete()

def _lay_on(img, back):
    """Put a colour or a picture behind everything, as a real bottom layer, so
    Screen glows and the like composite against it as they will in use."""
    W, H = img.get_width(), img.get_height()
    if _is_colour(back):
        bg = Gimp.Layer.new(img, 'bg', W, H, Gimp.ImageType.RGBA_IMAGE, 100, Gimp.LayerMode.NORMAL)
        img.insert_layer(bg, None, len(img.get_layers()))
        Gimp.context_set_foreground(Gegl.Color.new(back))
        bg.fill(Gimp.FillType.FOREGROUND)
    else:
        bg = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, img, _file(_path(back)))
        img.insert_layer(bg, None, len(img.get_layers()))
        bg.scale(W, H, False)
        bg.set_offsets(0, 0)

def ava_proof(what, on=None, widths=(256, 120, 64), label=None):
    """The proof sheet: the piece, cropped tight, composited large on each
    background, with its real small sizes in true pixels below. on= colours
    and/or pictures in the work, e.g. ('references/title.png', '#101014'); with
    none, the kit's own surface beside plain light and mid, so work is tested
    where it will live. Hide any backdrop layer first. Saved as
    exports/proof.png and shown to you."""
    if on is None:
        on = (KIT.colour('surface'), '#f4f4f4', '#808080') if KIT else ('#f4f4f4', '#808080', '#101014')
    src = _load(what)
    _visible(src)
    W, H = src.get_width(), src.get_height()
    merged = src.merge_visible_layers(Gimp.MergeType.CLIP_TO_IMAGE)
    src.select_item(Gimp.ChannelOps.REPLACE, merged)
    bounds = Gimp.Selection.bounds(src)
    src.delete()
    x1, y1, x2, y2 = bounds[2:6] if bounds[1] else (0, 0, W, H)
    pad = max(x2 - x1, y2 - y1) // 24
    x1, y1, x2, y2 = max(0, x1 - pad), max(0, y1 - pad), min(W, x2 + pad), min(H, y2 + pad)
    sw, sh = x2 - x1, y2 - y1
    os.makedirs(_LOOK_DIR, exist_ok=True)
    backs = [on] if isinstance(on, str) else list(on)
    cw, big, strip = 1024 // len(backs), 300, 170
    sheet = Gimp.Image.new(cw * len(backs), big + strip, Gimp.ImageBaseType.RGB)
    def place(path, w, h, x, y):
        lay = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, sheet, _file(path))
        sheet.insert_layer(lay, None, 0)
        lay.scale(w, h, False)
        lay.set_offsets(x, y)
    Gimp.context_set_interpolation(Gimp.InterpolationType.CUBIC)
    left_out = set()
    for i, back in enumerate(backs):
        x0 = i * cw
        tile = _load(what)
        _lay_on(tile, back)
        tile.flatten()
        # On a picture the large view is the whole frame, the piece where it
        # really sits; a tight crop of a picture only reads as a patch.
        full_path = None
        if not _is_colour(back):
            full_path = os.path.join(_LOOK_DIR, f'proof-{i}-full.png')
            Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, tile, _file(full_path), None)
        tile.crop(sw, sh, x1, y1)
        tile_path = os.path.join(_LOOK_DIR, f'proof-{i}.png')
        Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, tile, _file(tile_path), None)
        tile.delete()
        bg = Gimp.Layer.new(sheet, 'bg', cw, big + strip, Gimp.ImageType.RGBA_IMAGE, 100, Gimp.LayerMode.NORMAL)
        sheet.insert_layer(bg, None, 0)
        Gimp.context_set_foreground(Gegl.Color.new(back if _is_colour(back) else '#101014'))
        bg.fill(Gimp.FillType.FOREGROUND)
        bg.set_offsets(x0, 0)
        big_w, big_h = (W, H) if full_path else (sw, sh)
        k = min((cw - 24) / big_w, (big - 24) / big_h)
        w, h = max(1, int(big_w * k)), max(1, int(big_h * k))
        place(full_path or tile_path, w, h, x0 + (cw - w) // 2, (big - h) // 2)
        px, py, row = x0 + 12, big + 8, 0
        for wide in widths:
            wide = int(wide)
            h = max(1, round(sh * wide / sw))
            if px > x0 + 12 and px + wide > x0 + cw - 8:
                px, py, row = x0 + 12, py + row + 10, 0
            if wide > cw - 20 or py + h > big + strip - 6:
                left_out.add(wide)
                continue
            place(tile_path, wide, h, px, py)
            px += wide + 12
            row = max(row, h)
    if left_out:
        result['warnings'].append(f'The proof sheet had no room for widths {sorted(left_out)}px. Use fewer backgrounds or show that size with ava_show.')
    sheet.flatten()
    out = os.path.join(ASSET_DIR, 'exports')
    os.makedirs(out, exist_ok=True)
    Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, sheet, _file(os.path.join(out, 'proof.png')), None)
    print('AVA_EXPORT: exports/proof.png')
    _keep_look(sheet, label or f'proof sheet, small widths {list(widths)}px')
    sheet.delete()

# ── The report after every run ───────────────────────────────────────────────
# What the file really is, so a mistake shows without guessing: her glow sat at
# opacity 0.55 of 100 for about 12 runs, and opaque layers hid her wordmark for 12.
def _report(name, img):
    W, H = img.get_width(), img.get_height()
    lines, warns = [f'{name} ({W}×{H}), top layer first:'], []
    layers = img.get_layers()
    hiding = None
    for l in layers[:40]:
        n = l.get_name()
        _, x, y = l.get_offsets()
        w, h = l.get_width(), l.get_height()
        op, on = l.get_opacity(), l.get_visible()
        mode = l.get_mode().value_nick
        try:
            ink = (l.histogram(Gimp.HistogramChannel.ALPHA, 0.0, 1.0)[1] / 255) if l.has_alpha() else 1.0
        except Exception:
            ink = None
        kind = 'text, ' if l.is_text_layer() else ''
        lines.append(f'  "{n}" {kind}{w}×{h} at {x},{y} · {mode} · opacity {op:g} · {"on" if on else "HIDDEN"}' +
                     (f' · covers {ink * w * h / (W * H) * 100:.1f}% of the canvas' if ink is not None else ''))
        if not on:
            continue
        if hiding:
            if ink:
                warns.append(f'"{n}" cannot be seen: "{hiding}" is solid and sits on top of it.')
            continue
        if 0 < op <= 1:
            warns.append(f'"{n}" opacity is {op:g}, and the scale is 0-100, so it is almost invisible. Did you mean {op * 100:g}?')
        if ink == 0:
            warns.append(f'"{n}" is empty: nothing is on it.')
        if x >= W or y >= H or x + w <= 0 or y + h <= 0:
            warns.append(f'"{n}" is completely off the canvas.')
        if ink is not None and ink > 0.995 and op >= 99.9 and mode == 'normal' and x <= 0 and y <= 0 and x + w >= W and y + h >= H:
            hiding = n
    if not any(l.get_visible() for l in layers):
        warns.append('Every layer is hidden, so this image exports as nothing.')
    return lines, warns

def ava_text(image, text, font='Sans-serif Bold', size=96, colour='#ffffff', x=0, y=0, name=None, spacing=0.0):
    """A real, editable text layer: the person can retype it in GIMP. size is
    in pixels; spacing adds letter spacing. Check names with ava_fonts('rajdhani')."""
    f = Gimp.Font.get_by_name(font)
    if f is None:
        near = ava_fonts(font.split()[0])[:12]
        raise ValueError(f'No font called "{font}". Close matches: {near}. If this is the font they agreed, ask them whether you may install it, then use design_install_font.')
    lay = Gimp.TextLayer.new(image, text, f, float(size), Gimp.Unit.pixel())
    image.insert_layer(lay, None, 0)
    lay.set_color(Gegl.Color.new(colour))
    if spacing:
        lay.set_letter_spacing(float(spacing))
    lay.set_offsets(int(x), int(y))
    lay.set_name(name or text[:40])
    return lay

shutil.rmtree(_LOOK_DIR, ignore_errors=True)
sys.addaudithook(_hook)

# ── Ava's script ─────────────────────────────────────────────────────────────
script_path = os.path.join(ASSET_DIR, 'script.py')
ns = {'__name__': '__main__', '__file__': script_path, 'ASSET_DIR': ASSET_DIR,
      'Gimp': Gimp, 'Gegl': Gegl, 'Gio': Gio, 'os': os, 'KIT': KIT,
      'ava_copy_layer': ava_copy_layer, 'ava_remove': ava_remove, 'ava_move': ava_move, 'ava_merged': ava_merged,
      'ava_glow': ava_glow, 'ava_pixel': ava_pixel, 'ava_images': ava_images, 'ava_show': ava_show, 'ava_proof': ava_proof, 'ava_final': ava_final,
      'ava_image': ava_image, 'ava_layer': ava_layer, 'ava_place': ava_place,
      'ava_filter': ava_filter, 'ava_export': ava_export, 'ava_fill': ava_fill, 'ava_cut': ava_cut,
      'ava_gradient': ava_gradient, 'ava_text': ava_text, 'ava_fonts': ava_fonts}
try:
    with open(script_path, encoding='utf-8') as f:
        code = compile(f.read(), 'script.py', 'exec')
    exec(code, ns)
except BaseException as e:   # the saved work must stay as it was
    result['error'] = ''.join(traceback.format_exception(type(e), e, e.__traceback__)[-12:])
    emit()
    raise SystemExit(0)

# ── Save, export, preview ────────────────────────────────────────────────────
try:
    if not _open:
        raise RuntimeError('The script made no image. Start with: img = ava_image("name", 512, 512)')
    vdir = os.path.join(ASSET_DIR, 'versions')
    stamp = time.strftime('%Y%m%d-%H%M%S')
    saved_any = False
    for name, img in _open.items():
        if not img.get_layers():
            # Saving one crashes GIMP's PNG writer, and an empty file on the
            # stage is what split the title logo in two.
            result['warnings'].append(f'"{name}" has no layers, so it was not saved. Saved images here: {ava_images()}.')
            continue
        saved_any = True
        xcf = os.path.join(ASSET_DIR, name + '.xcf')
        if os.path.exists(xcf):   # keep the last 5 versions of each image
            os.makedirs(vdir, exist_ok=True)
            shutil.copy2(xcf, os.path.join(vdir, f'{name}.{stamp}.xcf'))
            old = sorted(f for f in os.listdir(vdir) if f.startswith(name + '.'))
            for f in old[:-5]:
                os.remove(os.path.join(vdir, f))
        Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, _file(xcf), None)
        copy = img.duplicate()
        copy.merge_visible_layers(Gimp.MergeType.CLIP_TO_IMAGE)
        Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, copy, _file(os.path.join(ASSET_DIR, name + '.png')), None)
        copy.delete()
        result['images'].append({'name': name, 'width': img.get_width(), 'height': img.get_height(),
                                 'layers': len(img.get_layers())})
        lines, warns = _report(name, img)
        result['report'] += lines
        result['warnings'] += warns
    if not saved_any:
        raise RuntimeError(f'Nothing to save: no image here has any layers. Saved images in this work: {ava_images()}. Open one by name, or add a layer.')
    # Finals are written last, so a failed run can't add one.
    finals_path = os.path.join(ASSET_DIR, 'finals.json')
    try:
        finals = json.load(open(finals_path, encoding='utf-8'))
    except Exception:
        finals = []
    finals += [f for f in _new_finals if f not in finals]
    if _new_finals:
        json.dump(finals, open(finals_path, 'w', encoding='utf-8'), indent=2)
        result['newFinals'] = _new_finals
    # Preview: the finished files once there are any. Until then, the piece being
    # worked on: what this run touched, leaving out her tests, so the person can
    # always tell what the focus is. Every image at once told them nothing.
    shown = [os.path.join(ASSET_DIR, f) for f in finals if os.path.exists(os.path.join(ASSET_DIR, f))]
    if not shown:
        saved_names = ava_images()
        pieces = [n for n in saved_names if not _is_test(n)]
        focus = [n for n in pieces if n in _open] or pieces or saved_names
        try:
            chosen = json.load(open(os.path.join(ASSET_DIR, 'main.json'), encoding='utf-8'))
            if chosen in saved_names:
                focus = [chosen]
        except Exception:
            pass
        shown = [os.path.join(ASSET_DIR, n + '.png') for n in focus if os.path.exists(os.path.join(ASSET_DIR, n + '.png'))]
    names = shown
    cols = (min(len(names), 3) if len(names) <= 6 else 6) or 1
    rows = (len(names) + cols - 1) // cols
    cell = 768 if len(names) == 1 else 512 if len(names) <= 6 else 256
    sheet = Gimp.Image.new(cols * cell, rows * cell, Gimp.ImageBaseType.RGB)
    bg = Gimp.Layer.new(sheet, 'bg', cols * cell, rows * cell, Gimp.ImageType.RGBA_IMAGE, 100, Gimp.LayerMode.NORMAL)
    sheet.insert_layer(bg, None, 0)
    # Left empty on purpose: transparency stays real, so the room can show it.
    for i, n in enumerate(names):
        lay = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, sheet, _file(n))
        sheet.insert_layer(lay, None, 0)
        w, h = lay.get_width(), lay.get_height()
        k = min((cell - 16) / w, (cell - 16) / h)
        nw, nh = max(1, int(w * k)), max(1, int(h * k))
        lay.scale(nw, nh, False)
        lay.set_offsets((i % cols) * cell + (cell - nw) // 2, (i // cols) * cell + (cell - nh) // 2)
    sheet.merge_visible_layers(Gimp.MergeType.CLIP_TO_IMAGE)
    Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, sheet, _file(os.path.join(ASSET_DIR, 'preview.png')), None)
    sheet.delete()
    # What comes back to her: what she asked to see, else what this run touched.
    try:
        if not _looks:
            for name, img in list(_open.items())[:MAX_LOOKS]:
                if img.get_layers() and any(l.get_visible() for l in img.get_layers()):
                    ava_show(img, label=name)
        result['looks'] = _looks
    except Exception as e:
        result['warnings'].append(f'Could not prepare the look: {e}')
    result['files'] = sorted(f for f in os.listdir(ASSET_DIR) if f.endswith(('.xcf', '.png')))
    ex = os.path.join(ASSET_DIR, 'exports')
    if os.path.isdir(ex):
        result['files'] += ['exports/' + f for f in sorted(os.listdir(ex))]
    result['ok'] = True
    result['seconds'] = round(time.time() - STARTED, 1)
except BaseException as e:
    result['error'] = 'The script ran, but saving failed:\n' + \
        ''.join(traceback.format_exception(type(e), e, e.__traceback__)[-8:])
shutil.rmtree(_TMP, ignore_errors=True)
emit()
for img in list(_open.values()):
    try:
        img.delete()
    except Exception:
        pass
`;
