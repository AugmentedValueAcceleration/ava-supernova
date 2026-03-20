/**
 * Security module — automated scanning and vulnerability detection
 */
export {
  scanDependencies,
  scanSecrets,
  scanCodeVulns,
  runFullScan,
} from './scanner.js';

export type {
  DependencyVuln,
  SecretFinding,
  CodeVuln,
  ScanReport,
} from './scanner.js';
