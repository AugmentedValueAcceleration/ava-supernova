import { Component, lazy, Suspense, type ReactNode } from 'react';

// three.js is ~650 KB, so the viewer is its own chunk, fetched only when a
// model is on screen. That fetch can fail — a webview served stale files after
// a rebuild did exactly that on 3 Nov 2026, and with no boundary the error
// took the whole Design Studio down. Now a failure falls back to Ava's preview
// render: the model is still shown, just not turnable.
const ModelViewer = lazy(() => import('./ModelViewer').then((m) => ({ default: m.ModelViewer })));

class FallbackOnError extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[ava] 3D viewer failed to load, showing the preview instead:', error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function LazyModelViewer({ src, poster, alt, fill = false }: { src: string; poster?: string; alt: string; fill?: boolean }) {
  const box = fill ? 'flex-1 min-h-[260px]' : '';
  const style = fill ? undefined : { height: '50vh', minHeight: 260 };
  const still = poster
    ? <img src={poster} alt={alt} className={`w-full object-contain bg-black/20 p-4 ${box}`} style={style} />
    : <div className={`bg-black/20 ${box}`} style={style} />;
  return (
    <FallbackOnError key={src} fallback={still}>
      <Suspense fallback={still}>
        <ModelViewer src={src} poster={poster} alt={alt} fill={fill} />
      </Suspense>
    </FallbackOnError>
  );
}
