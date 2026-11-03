import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { tt } from '../i18n';

// ─── 3D model viewer (Library) ───────────────────────────────────────────────
//
// Turn and zoom a model Ava built in Blender. Reads the .glb that every build
// exports alongside the engine format, so the viewer never depends on FBX.
// Ava's preview render is the poster: shown while the model loads, and kept if
// WebGL is unavailable or the file will not load — the card is never blank.
//
// Lighting is a neutral studio environment (RoomEnvironment) so materials read
// the way they were made rather than flat-shaded. glTF is Y-up; Blender's
// exporter converts from Z-up, so the model stands the right way.

/** `fill` = take the parent's height (the 3D room's stage) instead of a fixed 50vh. */
export function ModelViewer({ src, poster, alt, fill = false }: { src: string; poster?: string; alt: string; fill?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setState('loading');

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setState('failed');   // no WebGL here — the poster stays
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envMap;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let disposed = false;
    let frame = 0;
    const loop = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };

    new GLTFLoader().load(
      src,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        // Centre it and frame it from a three-quarter view, whatever its size —
        // a 2 cm bolt and a 40 m bridge both fill the card.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        model.position.sub(centre);
        scene.add(model);
        const radius = Math.max(size.length() / 2, 1e-3);
        const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.4;
        camera.position.set(dist * 0.6, dist * 0.45, dist * 0.65);
        camera.near = dist / 100;
        camera.far = dist * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.minDistance = radius * 0.3;
        controls.maxDistance = dist * 6;
        controls.update();
        setState('ready');
        loop();
      },
      undefined,
      () => { if (!disposed) setState('failed'); },
    );

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
          m.dispose();
        }
      });
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [src]);

  return (
    <div className={`relative w-full bg-black/20 ${fill ? 'flex-1 min-h-[260px]' : ''}`} style={fill ? undefined : { height: '50vh', minHeight: 260 }}>
      <div ref={mountRef} className={`absolute inset-0 ${state === 'ready' ? '' : 'invisible'}`} />
      {state !== 'ready' && poster && (
        <img src={poster} alt={alt} className="absolute inset-0 h-full w-full object-contain p-4" />
      )}
      <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-[var(--text-muted)]">
        {state === 'ready'
          ? tt('library.model.viewer_hint', 'Drag to turn · scroll to zoom · right-drag to move')
          : state === 'loading'
          ? tt('library.model.viewer_loading', 'Loading the 3D view…')
          : tt('library.model.viewer_failed', 'The 3D view could not load here — this is the preview render.')}
      </div>
    </div>
  );
}
