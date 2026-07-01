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
