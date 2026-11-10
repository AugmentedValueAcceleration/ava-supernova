/**
 * The Python that runs inside Blender for design_build_model.
 *
 * Kept as a file-in-a-string so core stays a single bundle (the extension and
 * the IDE sidecar both ship core without loose resource files). Written to
 * the OS temp folder before each run. Proven on Blender 5.2.2 LTS, 3 Nov 2026:
 * a crate built, continued (lid added on top of the saved file), and every
 * guard refusal confirmed — programs, network, native code, writes outside
 * the model folder.
 */
import { KIT_PY } from '../../brand/kit-py.js';

// prettier-ignore
export const BLENDER_RUNNER_PY = String.raw`# Ava's Blender runner. Started by design_build_model as:
#   blender -b [model.blend] --factory-startup --disable-autoexec --python runner.py -- job.json
# It prepares the scene, installs the guard, runs Ava's script, then saves,
# exports and renders a preview. The last line it prints is the result.
import sys, os, json, time, traceback, tempfile, shutil, math

JOB = json.load(open(sys.argv[sys.argv.index('--') + 1], encoding='utf-8'))
ASSET_DIR = os.path.realpath(JOB['assetDir'])
NAME = JOB['name']
BLEND = os.path.join(ASSET_DIR, NAME + '.blend')
STARTED = time.time()
result = {'ok': False, 'files': [], 'warnings': []}
${KIT_PY}

def emit():
    sys.stdout.write('\n@@AVA_RESULT@@' + json.dumps(result) + '\n')
    sys.stdout.flush()

import bpy
sys.dont_write_bytecode = True
bpy.context.preferences.filepaths.save_version = 0   # no .blend1 clutter beside the model

if not JOB['continue']:
    bpy.ops.wm.read_factory_settings(use_empty=True)  # a new canvas: nothing in it
for sc in bpy.data.scenes:
    sc.render.filepath = os.path.join(ASSET_DIR, 'render_')

# ── The guard ────────────────────────────────────────────────────────────────
# Python audit hooks see every file write, process start and network call made
# from Python, and cannot be removed once installed. A guard, not a sandbox:
# Blender's own C code (saving a .blend, writing a render) is not seen here,
# which is why the tool also refuses absolute paths in the script itself.
# Writes are allowed in the model folder and in Blender's OWN per-run temp
# folder (blender_xxxx), not the whole system temp. Python's tempfile is
# pointed there too, so any library that needs scratch space stays inside it.
_BTMP = bpy.app.tempdir or os.path.join(ASSET_DIR, '.tmp')
os.makedirs(_BTMP, exist_ok=True)
tempfile.tempdir = _BTMP
_ALLOWED = [os.path.normcase(os.path.realpath(p)) for p in {ASSET_DIR, _BTMP}]

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
_WRITE_ARGS = {  # event -> indexes of the paths it writes or removes
    'os.remove': (0,), 'os.rmdir': (0,), 'os.mkdir': (0,), 'os.chmod': (0,),
    'os.truncate': (0,), 'os.utime': (0,), 'shutil.rmtree': (0,),
    'os.rename': (0, 1), 'shutil.move': (0, 1), 'shutil.copyfile': (1,),
    'shutil.copytree': (1,), 'os.symlink': (1,), 'os.link': (1,),
}
_WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC

def _refuse(why):
    raise PermissionError(f'Blocked by the Design Studio guard: {why}. '
                          f'Scripts here may only build the model and write inside its own folder (ASSET_DIR).')

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
            _refuse(f'writing outside the model folder ({os.fsdecode(path)})')
    elif event in _WRITE_ARGS:
        for i in _WRITE_ARGS[event]:
            if i < len(args) and args[i] is not None and not isinstance(args[i], int) and not _inside(args[i]):
                _refuse(f'changing files outside the model folder ({os.fsdecode(args[i])})')

# Blender's own exporters load native code when first imported (the glTF one
# pulls in ctypes for Draco). Import them BEFORE the guard goes up, so the guard
# only ever sees what Ava's script does.
import ctypes  # noqa: F401
for _mod in ('io_scene_gltf2.blender.exp.export', 'io_scene_fbx.export_fbx_bin'):
    try:
        __import__(_mod)
    except Exception as e:
        result['warnings'].append(f'Could not preload {_mod}: {e}')

sys.addaudithook(_hook)

# ── Helpers Ava calls from her script ────────────────────────────────────────
# Texturing is where she lost twenty minutes on the first real model (3 Nov
# 2026): a beautiful live shader that exports as nothing, a dozen runs on UV
# layout, and Blender reporting only EEVEE when asked which engines exist —
# so she concluded Cycles (which baking needs) was missing. It is not. These
# do the known-good versions of both steps in one line each.

import math as _math

def _meshes(objects):
    if objects is None:
        return [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
    return [bpy.data.objects[o] if isinstance(o, str) else o for o in objects]

def _select_only(obs):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]

def _keep_live_uvs(obs):
    """Before a new layout goes in, keep the one the live shader was written
    against. A shader can READ its UVs (her barrel told wood from iron by
    position on the layout), so replacing them silently scrambles the look —
    found the first time this ran on a real model, 3 Nov 2026. The old layout
    is copied to 'LiveUV' and every material pointed at it explicitly; the new
    packed layout then takes the FIRST slot, the one game engines read."""
    mats = set()
    for o in obs:
        uvs = o.data.uv_layers
        if not uvs:
            uvs.new(name='UVMap')
            continue
        if 'LiveUV' not in uvs:
            uvs.active = uvs[0]
            uvs.new(name='LiveUV', do_init=True)   # copies the current layout
        uvs.active = uvs[0]
        for sl in o.material_slots:
            if sl.material and sl.material.use_nodes and not sl.material.get('ava_baked'):
                mats.add(sl.material)
    for m in mats:
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.bl_idname == 'ShaderNodeTexCoord' and n.outputs['UV'].links:
                uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'LiveUV'
                uvn.location = (n.location.x, n.location.y - 180)
                for l in list(n.outputs['UV'].links):
                    nt.links.new(uvn.outputs['UV'], l.to_socket)
            elif n.bl_idname == 'ShaderNodeUVMap' and n.uv_map in ('', 'UVMap'):
                n.uv_map = 'LiveUV'
            elif n.bl_idname == 'ShaderNodeTexImage' and not n.inputs['Vector'].links:
                uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'LiveUV'
                nt.links.new(uvn.outputs['UV'], n.inputs['Vector'])
    return mats

def ava_unwrap(objects=None, margin=0.004, angle=66):
    """Unwrap every mesh (or the ones named) and pack ALL their UV islands into
    one shared 0-1 square with no overlaps — what one texture set for the
    whole asset needs. Safe for a shader that reads its UVs: the old layout is
    kept as 'LiveUV' and the materials keep reading it, so the look does not
    change. Returns the number of objects unwrapped."""
    obs = _meshes(objects)
    if not obs:
        raise ValueError('ava_unwrap: no mesh objects to unwrap')
    _keep_live_uvs(obs)
    _select_only(obs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=_math.radians(angle), island_margin=margin)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f'AVA_UNWRAP: {len(obs)} objects packed into one UV square (old layout kept as LiveUV)')
    return len(obs)

def _principled(mat):
    out = next((n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) \
        or next((n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not out or not out.inputs['Surface'].links:
        return None, None
    node = out.inputs['Surface'].links[0].from_node
    return (node if node.type == 'BSDF_PRINCIPLED' else None), out

def ava_bake(objects=None, size=2048, maps=('base_color', 'roughness', 'metallic', 'normal'), samples=16):
    """Bake the live materials into image textures in ASSET_DIR/textures and
    put a clean, export-ready material on the objects — the step procedural
    shaders need before FBX/glTF, because live nodes do not export.

    Works per channel the proven way: colour, roughness and metal are baked
    through an emission pass (a plain diffuse bake turns metal black); the
    normal pass keeps bumps and carved detail. The live materials stay in the
    file, so changing the look and calling ava_bake() again re-bakes from them.
    Needs non-overlapping UVs across the objects — ava_unwrap() gives that."""
    import os as _os
    obs = _meshes(objects)
    if not obs:
        raise ValueError('ava_bake: no mesh objects to bake')
    for o in obs:
        if not o.data.uv_layers:
            raise ValueError(f'ava_bake: "{o.name}" has no UVs — call ava_unwrap() first')
        o.data.uv_layers.active = o.data.uv_layers[0]   # the bake lands on the first map
        # Re-baking: put the live materials back on first.
        src = o.get('ava_live_materials')
        if src:
            for i, nm in enumerate(src):
                if nm in bpy.data.materials and i < len(o.material_slots):
                    o.material_slots[i].material = bpy.data.materials[nm]

    mats = []
    for o in obs:
        for slot in o.material_slots:
            if slot.material and slot.material not in mats:
                mats.append(slot.material)
    if not mats:
        raise ValueError('ava_bake: the objects have no materials to bake')
    for m in mats:
        m.use_nodes = True
        if _principled(m)[0] is None:
            raise ValueError(f'ava_bake: material "{m.name}" does not end in a Principled BSDF')

    sc = bpy.context.scene
    prev_engine = sc.render.engine
    sc.render.engine = 'CYCLES'          # baking is Cycles-only; it IS available
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.render.bake.margin = 8
    _select_only(obs)

    asset = _os.path.basename(ASSET_DIR.rstrip('\\/'))
    tex_dir = _os.path.join(ASSET_DIR, 'textures')
    _os.makedirs(tex_dir, exist_ok=True)
    SPEC = {
        'base_color': ('Base Color', 'BaseColor', False),
        'roughness':  ('Roughness', 'Roughness', True),
        'metallic':   ('Metallic', 'Metallic', True),
        'normal':     (None, 'Normal', True),
    }
    images = {}
    for key in maps:
        if key not in SPEC:
            raise ValueError(f'ava_bake: unknown map "{key}" — use base_color, roughness, metallic, normal')
        socket_name, label, data = SPEC[key]
        img = bpy.data.images.new(f'{asset}_{label}', size, size, alpha=False)
        if data:
            img.colorspace_settings.name = 'Non-Color'
        temp = []   # (material, nodes added, links to restore)
        for m in mats:
            nt = m.node_tree
            bsdf, out = _principled(m)
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
            nt.nodes.active = tn
            added = [tn]; restore = None
            if socket_name:
                # Route this channel into an emission shader and bake EMIT:
                # exact values, metal included.
                sock = bsdf.inputs[socket_name]
                em = nt.nodes.new('ShaderNodeEmission'); added.append(em)
                if sock.links:
                    nt.links.new(sock.links[0].from_socket, em.inputs['Color'])
                else:
                    v = sock.default_value
                    em.inputs['Color'].default_value = tuple(v) if hasattr(v, '__len__') else (v, v, v, 1.0)
                restore = out.inputs['Surface'].links[0].from_socket
                nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
            temp.append((m, added, restore, out))
        if socket_name:
            bpy.ops.object.bake(type='EMIT')
        else:
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
        for m, added, restore, out in temp:
            if restore is not None:
                m.node_tree.links.new(restore, out.inputs['Surface'])
            for n in added:
                m.node_tree.nodes.remove(n)
        img.filepath_raw = _os.path.join(tex_dir, f'{asset}_{label}.png')
        img.file_format = 'PNG'
        img.save()
        images[key] = img

    # The export-ready material: the baked images, nothing live.
    baked = bpy.data.materials.get(f'M_{asset}_Baked') or bpy.data.materials.new(f'M_{asset}_Baked')
    baked.use_nodes = True
    nt = baked.node_tree; nt.nodes.clear()
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (300, 0)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    y = 300
    for key, img in images.items():
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.location = (-300, y); y -= 280
        if key == 'normal':
            nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (0, -500)
            nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        else:
            nt.links.new(tn.outputs['Color'], bsdf.inputs[SPEC[key][0]])
    baked['ava_baked'] = True

    for o in obs:
        live = [s.material.name if s.material else '' for s in o.material_slots]
        for nm in live:
            if nm in bpy.data.materials:
                bpy.data.materials[nm].use_fake_user = True   # kept for re-baking
        o['ava_live_materials'] = live
        for slot in o.material_slots:
            slot.material = baked

    sc.render.engine = prev_engine
    files = [f'textures/{_os.path.basename(i.filepath_raw)}' for i in images.values()]
    print(f'AVA_BAKE: {len(obs)} objects, {len(mats)} live material(s) -> {", ".join(files)} on {baked.name}')
    return files

# ── Ava's script ─────────────────────────────────────────────────────────────
script_path = os.path.join(ASSET_DIR, 'script.py')
ns = {'__name__': '__main__', '__file__': script_path, 'ASSET_DIR': ASSET_DIR, 'bpy': bpy, 'KIT': KIT,
      'ava_unwrap': ava_unwrap, 'ava_bake': ava_bake}
try:
    with open(script_path, encoding='utf-8') as f:
        code = compile(f.read(), 'script.py', 'exec')
    exec(code, ns)
except BaseException as e:   # SystemExit included: the saved model must stay as it was
    result['error'] = ''.join(traceback.format_exception(type(e), e, e.__traceback__)[-12:])
    emit()
    sys.exit(0)

# ── Save, export, measure ────────────────────────────────────────────────────
try:
    if os.path.exists(BLEND):   # keep the last 5 versions so a bad run can be undone
        vdir = os.path.join(ASSET_DIR, 'versions')
        os.makedirs(vdir, exist_ok=True)
        shutil.copy2(BLEND, os.path.join(vdir, time.strftime('%Y%m%d-%H%M%S') + '.blend'))
        for old in sorted(os.listdir(vdir))[:-5]:
            os.remove(os.path.join(vdir, old))
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    result['files'].append(NAME + '.blend')

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    lo = [math.inf] * 3; hi = [-math.inf] * 3
    for o in meshes:
        ev = o.evaluated_get(deps)
        m = ev.to_mesh()
        m.calc_loop_triangles()
        tris += len(m.loop_triangles)
        for v in m.vertices:
            w = ev.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
        ev.to_mesh_clear()
    result['objects'] = len(meshes)
    result['triangles'] = tris
    if meshes:
        result['size_m'] = [round(hi[i] - lo[i], 3) for i in range(3)]
        result['center'] = [(hi[i] + lo[i]) / 2 for i in range(3)]

    glb = os.path.join(ASSET_DIR, NAME + '.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=False, export_apply=True)
    result['files'].append(NAME + '.glb')
    if JOB.get('fbx'):
        fbx = os.path.join(ASSET_DIR, NAME + '.fbx')
        bpy.ops.export_scene.fbx(filepath=fbx, use_selection=False, apply_scale_options='FBX_SCALE_ALL', path_mode='COPY', embed_textures=True)
        result['files'].append(NAME + '.fbx')
    # Live shaders do not export. Say so whenever the export will reach an
    # engine bare — the gap she lost twenty minutes in on the first model.
    _PROC = ('ShaderNodeTexNoise', 'ShaderNodeTexVoronoi', 'ShaderNodeTexWave', 'ShaderNodeTexMusgrave',
             'ShaderNodeTexGradient', 'ShaderNodeTexMagic', 'ShaderNodeTexChecker', 'ShaderNodeTexBrick',
             'ShaderNodeMath', 'ShaderNodeVectorMath', 'ShaderNodeValToRGB', 'ShaderNodeBump', 'ShaderNodeMix')
    _live = sorted({sl.material.name for o in meshes for sl in o.material_slots
                    if sl.material and sl.material.use_nodes and not sl.material.get('ava_baked')
                    and any(n.bl_idname in _PROC for n in sl.material.node_tree.nodes)})
    if _live:
        result['warnings'].append(
            'The exported model carries NONE of the live shader detail in ' + ', '.join(_live) +
            ' — game engines and the Library viewer will show it flat. Bake it: ava_unwrap() if the UVs overlap, then ava_bake().')
    _tex = os.path.join(ASSET_DIR, 'textures')
    if os.path.isdir(_tex):
        result['files'] += ['textures/' + f for f in sorted(os.listdir(_tex))]
    # For the making record: fonts and pictures in the SAVED model, whoever put
    # them there (her script or the person by hand), and kit logos she used.
    try:
        result['fonts'] = sorted({(f.name if f.filepath in ('', '<builtin>') else
                                   os.path.basename(bpy.path.abspath(f.filepath)))
                                  + ('|builtin' if f.filepath in ('', '<builtin>') else '')
                                  for f in bpy.data.fonts if f.users})
        result['images_used'] = sorted({os.path.basename(bpy.path.abspath(i.filepath)) for i in bpy.data.images
                                        if i.users and i.filepath and i.source == 'FILE'
                                        and os.path.dirname(os.path.normcase(os.path.abspath(bpy.path.abspath(i.filepath)))) != os.path.normcase(os.path.abspath(_tex))})
    except Exception as e:
        result['warnings'].append(f'Could not list fonts and pictures for the making record: {e}')
    result['kit_logos'] = list(KIT_LOGOS_USED)
except BaseException as e:
    result['error'] = 'The script ran, but saving or exporting failed:\n' + \
        ''.join(traceback.format_exception(type(e), e, e.__traceback__)[-8:])
    emit()
    sys.exit(0)

# ── Preview ──────────────────────────────────────────────────────────────────
# Her own render wins. Otherwise use her camera, or frame the model from a
# three-quarter view. Temporary camera/lights are added AFTER saving, so they
# never end up in the model.
preview = os.path.join(ASSET_DIR, 'preview.png')
try:
    if os.path.exists(preview) and os.path.getmtime(preview) >= STARTED:
        result['preview'] = 'hers'
    elif meshes:
        scene = bpy.context.scene
        if scene.camera is None:
            from mathutils import Vector
            c = Vector(result['center']); size = max(result['size_m']) or 1.0
            cam_data = bpy.data.cameras.new('AvaPreviewCam'); cam_data.lens = 50
            cam = bpy.data.objects.new('AvaPreviewCam', cam_data)
            scene.collection.objects.link(cam)
            cam.location = c + Vector((1.0, -1.25, 0.8)).normalized() * size * 2.6
            cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
            cam_data.clip_end = size * 100
            scene.camera = cam
            result['preview_camera'] = 'auto'
        if not any(o.type == 'LIGHT' for o in scene.objects):
            for nm, rot, energy in (('AvaKey', (0.9, 0.2, 0.8), 4.0), ('AvaFill', (1.1, -0.3, -2.4), 1.5)):
                ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = energy
                lo_ = bpy.data.objects.new(nm, ld); lo_.rotation_euler = rot
                scene.collection.objects.link(lo_)
        if scene.world is None:
            scene.world = bpy.data.worlds.new('AvaPreviewWorld')
        r = scene.render
        r.resolution_x = r.resolution_y = 1024; r.resolution_percentage = 100
        r.film_transparent = True
        r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
        r.filepath = preview
        bpy.ops.render.render(write_still=True)
        result['preview'] = 'auto'
    if os.path.exists(preview):
        result['files'].append('preview.png')
except BaseException as e:
    result['warnings'].append('Preview render failed: ' + str(e))

result['ok'] = True
result['seconds'] = round(time.time() - STARTED, 1)
emit()
`;
