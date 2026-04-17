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
  type(text: string): Promise<void>;
  key(key: string): Promise<void>;
  close(): Promise<void>;
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
