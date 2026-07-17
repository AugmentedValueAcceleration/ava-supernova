// Desktop automation + browser control tools, kept OUT of registerBuiltins on
// purpose.
//
// Microsoft blocked this extension from the VS Code Marketplace over exactly
// these tools, and their compliance team's requirement was that the extension
// cannot *include* them — not merely that it shouldn't call them. Reinstated
// with v0.48.1 (2026-04-21).
//
// If registerBuiltins imported these classes, they would be reachable from the
// extension's module graph and esbuild would bundle them into the published
// VSIX regardless of any runtime exclude — which is exactly what was happening
// until 2026-07-17. The registry excluded them by name, but the code shipped.
//
// So the split is physical, not conditional: this module is imported ONLY by
// hosts that are allowed to ship desktop automation (the Tauri IDE and the
// CLI, both distributed outside the marketplace). The extension never imports
// it, so the classes never enter its bundle.
//
// DO NOT import this module from tool-registry.ts, agent.ts, or index.ts's
// eager paths. Doing so re-links it into the extension and silently re-ships
// the tools MS told us to remove.

import type { Tool } from './types.js';
import type { ToolRegistry } from './tool-registry.js';
import { DesktopListElementsTool } from './desktop-list-elements.js';
import { DesktopClickByNameTool } from './desktop-click-by-name.js';
import { DesktopFocusWindowTool } from './desktop-focus-window.js';
import { DesktopTypeTool } from './desktop-type.js';
import { DesktopKeyPressTool } from './desktop-key-press.js';
import { DesktopLaunchAppTool } from './desktop-launch-app.js';
import { DesktopPlanApproveTool } from './desktop-plan-approve.js';
import { BrowserNavigateTool } from './browser-navigate.js';
import { BrowserSnapshotTool } from './browser-snapshot.js';
import { BrowserClickTool } from './browser-click.js';
import { BrowserTypeTool } from './browser-type.js';
import { BrowserCloseTool } from './browser-close.js';

/**
 * Build the desktop-automation + browser-control tools.
 *
 * Names must stay in sync with DESKTOP_TOOL_NAMES in agent/agent.ts, which is
 * what the mode gate and the extension's exclude list both key off. The
 * desktop-tools.test.ts contract test asserts the two agree, so a tool added
 * here without a name there fails CI rather than shipping to the marketplace.
 */
export function createDesktopTools(): Tool[] {
  return [
    new DesktopPlanApproveTool(),
    new DesktopLaunchAppTool(),
    new DesktopListElementsTool(),
    new DesktopClickByNameTool(),
    new DesktopFocusWindowTool(),
    new DesktopTypeTool(),
    new DesktopKeyPressTool(),
    new BrowserNavigateTool(),
    new BrowserSnapshotTool(),
    new BrowserClickTool(),
    new BrowserTypeTool(),
    new BrowserCloseTool(),
  ];
}

/**
 * Register the desktop-automation + browser-control tools onto a registry.
 *
 * Call this ONLY from a host that is allowed to ship desktop automation: the
 * Tauri IDE and the CLI, both distributed outside the VS Code Marketplace.
 * The VS Code extension must never call it, and must never import this module.
 *
 * Call it AFTER registerBuiltins() — these are additions to the base set.
 */
export function registerDesktopTools(registry: ToolRegistry): void {
  for (const tool of createDesktopTools()) registry.register(tool);
}
