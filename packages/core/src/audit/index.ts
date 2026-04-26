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
export type { Finding } from './patterns.js';

export {
  buildExport,
} from './export.js';
export type { ExportBundle } from './export.js';

export type {
  AuditEntry,
  AuditCost,
  AuditFilter,
} from './types.js';
