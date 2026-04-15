/**
 * Ava's working set of granted secrets.
 *
 * The user's vault lives in VSCode SecretStorage and is the source of truth.
 * This class is the runtime capability surface Ava sees: an in-memory map of
 * secrets the user has explicitly granted for the current session. Wiped on
 * `new_chat` and on extension reload — never persisted to disk.
 *
 * Slice 1 plumbs the class. Slice 2 wires it into a `secret_request` tool +
 * grant prompt UX. Slice 3 adds the env-writer tool that fetches by id from
 * here so secret values never appear in tool arguments.
 */

export interface GrantedSecret {
  id: string;
  label: string;
  value: string;
  /** ms epoch when the grant landed — used for session-age telemetry. */
  grantedAt: number;
}

export class SecretAccess {
  private grants = new Map<string, GrantedSecret>();

  /** Add a secret to Ava's working set. Idempotent on id. */
  grant(id: string, label: string, value: string): void {
    this.grants.set(id, { id, label, value, grantedAt: Date.now() });
  }

  /** Resolve a granted secret by id. Returns undefined when not granted. */
  get(id: string): GrantedSecret | undefined {
    return this.grants.get(id);
  }

  has(id: string): boolean {
    return this.grants.has(id);
  }

  /** List the labels currently granted (no values). Safe for telemetry. */
  listGranted(): Array<{ id: string; label: string; grantedAt: number }> {
    return [...this.grants.values()].map(({ id, label, grantedAt }) => ({ id, label, grantedAt }));
  }

  /** Wipe all grants — called on new_chat and on extension dispose. */
  forgetAll(): void {
    this.grants.clear();
  }

  /** Revoke a single grant (e.g. user clicks 'forget this' in the vault page). */
  revoke(id: string): void {
    this.grants.delete(id);
  }

  size(): number {
    return this.grants.size;
  }
}
