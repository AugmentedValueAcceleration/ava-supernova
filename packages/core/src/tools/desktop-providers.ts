/**
 * Host-side provider interfaces that back the desktop-automation tools.
 *
 * These are populated by the Tauri IDE (or any other host) via
 * `ToolExecutionContext.sharedState` and consumed by the desktop_* and
 * browser_* tools. Core does not depend on Tauri — hosts fulfil the
 * contract and tools fail cleanly when a provider is absent.
 *
 * Keep this file interface-only. No runtime logic, no imports.
 */

export interface UIAElement {
  name: string;
  control_type: string;
  cx: number;
  cy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** UIA IsEnabled — false = greyed out (a disabled "Empty Recycle Bin" means
   *  the bin is already empty). Absent on older hosts ⇒ treat as enabled. */
  enabled?: boolean;
  /** Another window physically covers this element's centre — a click would
   *  hit THAT window instead (desktop icons behind an app window). Absent on
   *  older hosts ⇒ treat as not occluded. */
  occluded?: boolean;
}

export interface UIAProvider {
  listElements(): Promise<UIAElement[]>;
  findElement(name: string): Promise<{ name: string; control_type: string; cx: number; cy: number } | null>;
  clickElement(name: string): Promise<{ name: string; cx: number; cy: number } | null>;
  focusWindow(name: string): Promise<string | null>;
}

export interface InputProvider {
  click(x: number, y: number): Promise<void>;
  doubleClick(x: number, y: number): Promise<void>;
  rightClick(x: number, y: number): Promise<void>;
  typeText(text: string): Promise<void>;
  keyPress(key: string): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>;
  moveMouse(x: number, y: number): Promise<void>;
  drag(x: number, y: number, endX: number, endY: number): Promise<void>;
  /**
   * Flash a click-through highlight box on (x, y, w, h) for ~ms — the visual
   * "here's where I'm about to act" preview shown before Drive-mode actions.
   * Optional: hosts without an overlay omit it and Drive still confirms
   * irreversible actions, so the preview is UX, never a safety guard.
   */
  highlight?(x: number, y: number, w: number, h: number, ms?: number): Promise<void>;
  /**
   * Minimize every window to reveal the desktop — so desktop icons become
   * visible in the accessibility tree and clickable. The fix for "the target
   * icon is behind an open window". Optional; hosts without it simply can't
   * clear occlusion.
   */
  minimizeAll?(): Promise<void>;
}

export interface BrowserSnapshotElement {
  tag: 'link' | 'button' | 'input' | 'textarea' | 'select' | string;
  selector: string;
  text?: string;
  placeholder?: string;
  href?: string;
  value?: string;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  elements: BrowserSnapshotElement[];
}

export interface BrowserProvider {
  navigate(url: string): Promise<{ url: string; title: string }>;
  snapshot(): Promise<BrowserSnapshot>;
  click(selector: string): Promise<void>;
  /** Type into the focused element, or into `selector` when given (page.fill). */
  type(text: string, selector?: string): Promise<void>;
  key(key: string): Promise<void>;
  /** Wheel-scroll the page. Optional — native scroll is a Phase D primitive. */
  scroll?(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>;
  close(): Promise<void>;
  /**
   * Whether a browser is ALREADY running. Perception must only snapshot a
   * live browser — snapshot()/navigate() may launch one as a side effect,
   * which observation must never do. Hosts that can't tell should omit this;
   * absent means "not live" for perception purposes.
   */
  isLive?(): boolean;
}

export interface VisionProvider {
  /**
   * Visually locate an element on the CURRENT screen from a plain-English
   * description ("the blue Save button"). The host captures the screenshot,
   * runs the grounding model (local or cloud per the user's perception
   * setting), and returns SCREEN-PIXEL coordinates — or null if the element
   * can't be found. Hosts must never capture or transmit a screenshot unless
   * the user's vision setting allows it.
   */
  localize(targetDescription: string): Promise<{ x: number; y: number } | null>;
  /** Whether a vision lane is currently usable (setting + key/model present). */
  isAvailable(): boolean;
  /** Structured capability — lane + whether it's a verified path — so Scout
   *  can advertise vision honestly (e.g. "local vision, unverified"). Optional
   *  for back-compat; hosts should implement it. Shape mirrors
   *  `VisionCapability` from `@ava/core/desktop`. */
  capability?(): { available: boolean; lane: 'off' | 'local' | 'cloud-byok' | 'cloud-platform'; verified: boolean; reason: string };
}

export interface AppLauncherProvider {
  /**
   * Launch a named executable or full path. The host MUST reject shell
   * interpreters and admin / registry tools by basename — this is the
   * trust boundary, not a convenience. No shell interpolation, no args
   * string, no env injection.
   */
  launch(app: string): Promise<{ pid?: number; launched: string }>;
}
