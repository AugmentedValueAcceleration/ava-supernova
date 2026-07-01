// Public surface for the audit module. Both extension AvaViewProvider
// and IDE sidecar import from here.

export {
  appendEntry,
  readEntries,
  summarise,
  AUDIT_LOG_PATH,
  AUDIT_DIR,
} from './logger.js';
export type { AuditSummary } from './logger.js';

export {
  computeCost,
  formatCost,
} from './cost.js';

export {
  detectPatterns,
} from './patterns.js';
export type { Finding, FindingKind, FindingParams } from './patterns.js';

export {
  annotateIntegrity,
} from './integrity.js';

export {
  buildExport,
} from './export.js';
export type { ExportBundle } from './export.js';

export type {
  AuditEntry,
  AuditCost,
  AuditFilter,
  IntegrityStatus,
} from './types.js';
