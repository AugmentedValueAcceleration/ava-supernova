import type { SupabaseClient, User } from '@supabase/supabase-js';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface PluginProps {
  supabase: SupabaseClient;
  currentUser: User;
  navigate: (page: string) => void;
}

export interface PluginNavItem {
  section: string;
  label: string;
  icon: React.ReactNode;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string;
  component: React.ComponentType<PluginProps>;
  navItem: PluginNavItem;
  permissions: string[];
  enabled?: boolean;
}

export interface PluginRegistration {
  plugin: Plugin;
  registeredAt: string;
  enabled: boolean;
}

/* ── Registry ───────────────────────────────────────────────────────────── */

const plugins: Map<string, PluginRegistration> = new Map();

/**
 * Register a new plugin. Overwrites if the id already exists.
 */
export function registerPlugin(plugin: Plugin): void {
  plugins.set(plugin.id, {
    plugin,
    registeredAt: new Date().toISOString(),
    enabled: plugin.enabled !== false,
  });
}

/**
 * Unregister a plugin by id.
 */
export function unregisterPlugin(id: string): boolean {
  return plugins.delete(id);
}

/**
 * Get all registered plugins.
 */
export function getPlugins(): PluginRegistration[] {
  return Array.from(plugins.values());
}

/**
 * Get only enabled plugins.
 */
export function getEnabledPlugins(): PluginRegistration[] {
  return Array.from(plugins.values()).filter((p) => p.enabled);
}

/**
 * Get a plugin by id.
 */
export function getPluginById(id: string): PluginRegistration | undefined {
  return plugins.get(id);
}

/**
 * Enable or disable a plugin.
 */
export function setPluginEnabled(id: string, enabled: boolean): boolean {
  const registration = plugins.get(id);
  if (!registration) return false;
  registration.enabled = enabled;
  return true;
}

/**
 * Get plugins grouped by their nav section.
 */
export function getPluginsBySection(): Record<string, PluginRegistration[]> {
  const sections: Record<string, PluginRegistration[]> = {};
  plugins.forEach((registration) => {
    if (!registration.enabled) return;
    const section = registration.plugin.navItem.section;
    if (!sections[section]) sections[section] = [];
    sections[section].push(registration);
  });
  return sections;
}

/**
 * Get the total number of registered plugins.
 */
export function getPluginCount(): { total: number; enabled: number; disabled: number } {
  let enabled = 0;
  let disabled = 0;
  plugins.forEach((p) => {
    if (p.enabled) enabled++;
    else disabled++;
  });
  return { total: plugins.size, enabled, disabled };
}
