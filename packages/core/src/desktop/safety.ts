// ─── Desktop Automation Safety Ontology ────────────────────────────────────
//
// Five risk classes, classification rules, and approval logic for the
// desktop automation mode. This is the foundation that Planner uses to
// tag every ProposedAction and that the approval gate uses to decide
// whether to block, confirm, or auto-allow.
//
// The ontology deliberately errs on the side of false positives —
// classifying something as more dangerous than it is means the user
// gets an extra confirmation prompt. Classifying it as less dangerous
// means Ava silently does something irreversible. We'll take the nag
// over the incident every time.

// ── Risk classes ──────────────────────────────────────────────────────────

export type RiskClass =
  | 'observational'          // read UIA tree, screenshot, OCR, hover
  | 'navigational'           // mouse move, scroll, switch focus, open menu
  | 'mutative-reversible'    // type into field, paste, open app, navigate URL
  | 'mutative-irreversible'  // send, submit, pay, delete, confirm, close-unsaved
  | 'privileged';            // UAC elevation, sudo, credential prompts, registry

// ── Permission levels ─────────────────────────────────────────────────────

export type PermissionLevel =
  | 'watch'   // Ava narrates, user clicks. Safest.
  | 'ask'     // Ava acts but confirms every mutative action.
  | 'drive';  // Ava acts freely within whitelist. Irreversibles still confirm.

// ── Irreversible verb blocklist ───────────────────────────────────────────
// Matched against UIA AutomationName, DOM labels, button text, and
// OmniParser captions. Case-insensitive word-boundary match.
// English only for v1 — documented limitation.

export const IRREVERSIBLE_VERBS = new Set([
  'send',
  'submit',
  'pay',
  'buy',
  'purchase',
  'delete',
  'confirm',
  'accept',
  'unsubscribe',
  'leave',
  'block',
  'remove',
  'destroy',
  'purge',
  'publish',
  'post',
  'tweet',
  'share',
  'close',         // close-without-saving is irreversible
  'discard',
  'reject',
  'terminate',
  'cancel',        // cancel-subscription, cancel-order — context dependent
  'revoke',
  'transfer',
]);

// ── Sensitive field patterns ──────────────────────────────────────────────
// Field names / IDs matching these patterns escalate to mutative-irreversible
// and trigger the secret handle flow.

const SENSITIVE_FIELD_PATTERN = /password|secret|token|key|credential|ssn|card.?number|cvv|cvc|pin/i;

// ── Privileged context patterns ───────────────────────────────────────────

const PRIVILEGED_PATTERNS = [
  /user account control/i,
  /UAC/,
  /elevation/i,
  /sudo/i,
  /administrator/i,
  /registry editor/i,
  /regedit/i,
  /group policy/i,
  /gpedit/i,
  /credential manager/i,
  /keychain/i,
  /disable.*antivirus/i,
  /windows defender/i,
];

// ── Classification input ──────────────────────────────────────────────────

export interface ActionClassificationInput {
  /** The action kind from ProposedAction (click, type, key, navigate, etc.) */
  kind: string;
  /** UIA AutomationName or DOM accessible name of the target element */
  targetName?: string;
  /** UIA ControlType or DOM role (button, textbox, menuitem, etc.) */
  targetType?: string;
  /** Input field name/id attribute (for type actions) */
  fieldName?: string;
  /** Whether the target is a masked/password field (UIA IsPassword or input[type=password]) */
  isMaskedField?: boolean;
  /** Whether the action is happening in a UAC/elevated context */
  isElevated?: boolean;
  /** OmniParser's caption for the target element (supplementary signal) */
  omniParserCaption?: string;
  /** The window/app name where the action is happening */
  appName?: string;
}

// ── Classification result ─────────────────────────────────────────────────

export interface ClassificationResult {
  riskClass: RiskClass;
  /** Which signal(s) drove the classification — for audit log */
  reasons: string[];
  /** Whether the secret handle flow should be activated */
  requiresSecretHandle: boolean;
}

// ── Classifier ────────────────────────────────────────────────────────────

/**
 * Classify a proposed action into a risk class.
 *
 * Three signals combined, pessimistic escalation:
 *   1. UIA/DOM target metadata — control type + name against verb blocklist
 *   2. OmniParser caption — supplementary, not authoritative
 *   3. Action parameters — masked fields, privileged context
 *
 * When signals disagree, the HIGHEST risk class wins.
 */
export function classifyAction(input: ActionClassificationInput): ClassificationResult {
  const reasons: string[] = [];
  let maxClass: RiskClass = 'observational';
  let requiresSecretHandle = false;

  const escalate = (cls: RiskClass, reason: string) => {
    reasons.push(reason);
    if (riskOrdinal(cls) > riskOrdinal(maxClass)) {
      maxClass = cls;
    }
  };

  // ── Signal 0: action kind baseline ──────────────────────────────────
  const kind = input.kind.toLowerCase();

  const observationalKinds = new Set(['screenshot', 'observe', 'observe_more', 'snapshot', 'ping']);
  const navigationalKinds = new Set(['scroll', 'hover', 'focus', 'wait', 'mouse_move']);
  const mutativeKinds = new Set(['click', 'double_click', 'right_click', 'type', 'key', 'navigate', 'paste']);

  if (observationalKinds.has(kind)) {
    escalate('observational', `kind '${kind}' is observational`);
  } else if (navigationalKinds.has(kind)) {
    escalate('navigational', `kind '${kind}' is navigational`);
  } else if (mutativeKinds.has(kind)) {
    escalate('mutative-reversible', `kind '${kind}' is mutative`);
  } else {
    // Unknown kind — be conservative
    escalate('mutative-reversible', `unknown kind '${kind}' defaulted to mutative-reversible`);
  }

  // ── Signal 1: target name against irreversible verb blocklist ───────
  const textSignals = [
    input.targetName,
    input.omniParserCaption,
  ].filter(Boolean).map(s => s!.toLowerCase());

  for (const text of textSignals) {
    for (const verb of IRREVERSIBLE_VERBS) {
      // Word boundary match — "send" matches "Send Email" but not "sending_id"
      const pattern = new RegExp(`\\b${verb}\\b`, 'i');
      if (pattern.test(text)) {
        escalate('mutative-irreversible', `verb '${verb}' found in target text '${text}'`);
        break;
      }
    }
  }

  // ── Signal 2: target type heuristics ────────────────────────────────
  if (input.targetType) {
    const t = input.targetType.toLowerCase();
    // Buttons and links are mutative by default; escalation happens via verb match
    if (t === 'button' || t === 'link' || t === 'menuitem') {
      escalate('mutative-reversible', `target type '${t}' is interactable`);
    }
  }

  // ── Signal 3: sensitive field detection ─────────────────────────────
  if (input.isMaskedField) {
    escalate('mutative-irreversible', 'target is a masked/password field');
    requiresSecretHandle = true;
  }

  if (input.fieldName && SENSITIVE_FIELD_PATTERN.test(input.fieldName)) {
    escalate('mutative-irreversible', `field name '${input.fieldName}' matches sensitive pattern`);
    requiresSecretHandle = true;
  }

  // ── Signal 4: privileged context ────────────────────────────────────
  if (input.isElevated) {
    escalate('privileged', 'action is in an elevated/UAC context');
  }

  const contextTexts = [input.appName, input.targetName].filter(Boolean);
  for (const text of contextTexts) {
    for (const pattern of PRIVILEGED_PATTERNS) {
      if (pattern.test(text!)) {
        escalate('privileged', `privileged pattern matched in '${text}'`);
        break;
      }
    }
  }

  return { riskClass: maxClass, reasons, requiresSecretHandle };
}

// ── Approval logic ────────────────────────────────────────────────────────

export interface ApprovalDecision {
  /** Whether the action requires user confirmation before execution */
  requiresApproval: boolean;
  /** Whether the action is forbidden entirely (privileged without opt-in) */
  forbidden: boolean;
  /** Whether approval may be cached for this action class (always false for irreversible) */
  cacheable: boolean;
  /** Human-readable reason for the decision */
  reason: string;
}

/**
 * Determine whether an action needs approval given the current permission level.
 *
 * Rules from the spec:
 *   - Observational: always auto-allowed
 *   - Navigational: auto-allowed in Drive, logged
 *   - Mutative-reversible: confirm in Ask, auto in Drive within whitelist
 *   - Mutative-irreversible: ALWAYS confirm, regardless of permission level,
 *     approval never cached
 *   - Privileged: FORBIDDEN by default, requires explicit per-session opt-in
 */
export function decideApproval(
  riskClass: RiskClass,
  permissionLevel: PermissionLevel,
  privilegedOptIn: boolean = false,
): ApprovalDecision {
  switch (riskClass) {
    case 'observational':
      return { requiresApproval: false, forbidden: false, cacheable: true, reason: 'Observational actions are always auto-allowed' };

    case 'navigational':
      if (permissionLevel === 'watch') {
        return { requiresApproval: true, forbidden: false, cacheable: true, reason: 'Watch mode requires confirmation for navigation' };
      }
      return { requiresApproval: false, forbidden: false, cacheable: true, reason: 'Navigational actions auto-allowed in Ask/Drive' };

    case 'mutative-reversible':
      if (permissionLevel === 'watch' || permissionLevel === 'ask') {
        return { requiresApproval: true, forbidden: false, cacheable: true, reason: 'Mutative action requires confirmation in Watch/Ask mode' };
      }
      return { requiresApproval: false, forbidden: false, cacheable: true, reason: 'Mutative-reversible auto-allowed in Drive (within whitelist)' };

    case 'mutative-irreversible':
      // NEVER cached. ALWAYS confirms. This is the differentiator.
      return { requiresApproval: true, forbidden: false, cacheable: false, reason: 'Irreversible actions always require fresh confirmation' };

    case 'privileged':
      if (!privilegedOptIn) {
        return { requiresApproval: false, forbidden: true, cacheable: false, reason: 'Privileged actions are forbidden without explicit opt-in' };
      }
      return { requiresApproval: true, forbidden: false, cacheable: false, reason: 'Privileged action — single-use approval required even with opt-in' };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function riskOrdinal(cls: RiskClass): number {
  switch (cls) {
    case 'observational': return 0;
    case 'navigational': return 1;
    case 'mutative-reversible': return 2;
    case 'mutative-irreversible': return 3;
    case 'privileged': return 4;
  }
}

/**
 * Check whether an app name is in the session whitelist.
 * The whitelist contains user-provided app names that Ava matched to
 * process names / URLs at mode entry. This function does a normalised
 * case-insensitive substring match.
 */
export function isWhitelisted(appName: string, whitelist: string[]): boolean {
  const normalised = appName.toLowerCase().trim();
  return whitelist.some(w => {
    const wn = w.toLowerCase().trim();
    return normalised.includes(wn) || wn.includes(normalised);
  });
}
