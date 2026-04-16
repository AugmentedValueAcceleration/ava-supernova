// NDJSON wire protocol between harness (parent) and browser-worker (child).
//
// One JSON object per line, both directions. The harness sends `Command`s
// with a correlation id and receives `Response`s with the same id. This is
// the exact contract the Rust sidecar will implement later — keeping it
// tight here means the port is mechanical, not a redesign.

export type ActionKind =
  | 'launch'      // cold-start chromium, open a fresh context
  | 'navigate'    // go to url, wait for load state
  | 'snapshot'    // capture title, url, visible text, link structure
  | 'screenshot'  // full-page png to disk, return path + byte size
  | 'click'       // click by CSS / role / text selector
  | 'close'       // close browser, return resource stats
  | 'ping';       // heartbeat — round-trip latency check

export interface Command {
  id: string;
  action: ActionKind;
  params?: Record<string, unknown>;
}

export interface Response {
  id: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
  elapsedMs: number;
}

// Structured trajectory log — every step recorded for post-run analysis.
// Matches the shape Session 1 used so downstream eval tooling can ingest
// both prototypes the same way.
export interface TrajectoryStep {
  stepNumber: number;
  command: Command;
  response: Response;
  timestamp: string;
}

export interface RunSummary {
  startedAt: string;
  endedAt: string;
  totalDurationMs: number;
  coldStartMs: number | null;           // from launch command
  steps: TrajectoryStep[];
  chromiumProcessesBefore: number;
  chromiumProcessesAfter: number;
  orphansDetected: number;              // after - before (should be 0)
  cleanShutdown: boolean;
  workerExitCode: number | null;
}
