# Memory v3 — Graph-Based Memory System
## Complete Technical Specification for Ava Supernova 1.0

**Status:** Plan complete. Ready to build.
**Target:** Ship as 1.0 anchor feature — the "You made me do this" launch weapon.
**Scope:** ~2500-3500 lines across 8-10 files in `packages/core/src/memory/`
**Principle:** Local-first. BYOK users get everything. Cloud is additive opt-in.

---

## 1. Data Model

### 1.1 MemoryNode

Every memory is a node in a directed graph.

```typescript
interface MemoryNode {
  id: string;                          // UUID
  content: string;                     // The actual memory text (markdown)
  category: MemoryCategory;            // pattern | preference | architecture | bug-fix | convention | person | tool-config | decision | general | approval | design-decision
  scope: 'global' | 'project';
  layer: MemoryLayer;                  // person | workflow | project | discovery

  // ── Confidence system ──────────────────────────────────
  confidence: number;                  // 0.0–1.0
  confidenceSource: ConfidenceSource;  // explicit | inferred | extracted | migrated
  lastReinforcedAt: string;            // ISO timestamp of last confidence boost
  reinforcementCount: number;          // How many times confidence was boosted

  // ── Temporal ───────────────────────────────────────────
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
  lastRecalledAt: string | null;       // Last time this node was surfaced in a brief or recall
  recallCount: number;                 // Total times recalled

  // ── Scope qualifiers ──────────────────────────────────
  branch: string | null;               // Git branch scope (carried from v2)
  directoryScope: string | null;       // Directory within project
  tags: string[];                      // Freeform tags for filtering

  // ── Lifecycle ──────────────────────────────────────────
  archived: boolean;                   // In cold storage
  archivedAt: string | null;
  archivedReason: 'decay' | 'contradiction' | 'manual' | 'stale' | null;

  // ── Source tracking ────────────────────────────────────
  source: 'user-explicit' | 'auto-extract' | 'llm-extract' | 'compression' | 'procedural' | 'ambient' | 'tool-save';
  sourceSessionId: string | null;      // Which session created this node
}

type ConfidenceSource = 'explicit' | 'inferred' | 'extracted' | 'migrated';
```

### 1.2 MemoryEdge

Typed directed relationships between nodes.

```typescript
interface MemoryEdge {
  id: string;                          // UUID
  fromNodeId: string;                  // Source node
  toNodeId: string;                    // Target node
  type: EdgeType;
  weight: number;                      // 0.0–1.0 (strength of relationship)
  createdAt: string;
  metadata: Record<string, unknown>;   // Edge-type-specific data
}

type EdgeType =
  | 'because'         // Causal: A because B (chose Tailwind because user prefers it)
  | 'implies'         // Inference: A implies B (prefers Tailwind implies frontend dev)
  | 'resolved-by'     // Bug→fix: A resolved by B
  | 'contradicts'     // Conflict: A contradicts B (flagged for resolution)
  | 'generalised-to'  // Specific→general: A generalises to B
  | 'approved-by'     // Decision→approval: A was approved by B (user said "go for it")
  | 'supersedes'      // Replacement: A supersedes B (newer preference)
  | 'related-to'      // Weak association: A related to B
  | 'depends-on'      // Prerequisite: A depends on B
  | 'learned-from';   // Procedural: procedure A learned from observations B,C,D
```

### 1.3 ProceduralPattern

Crystallised tool-use sequences learned from observation.

```typescript
interface ProceduralPattern {
  id: string;
  taskType: string;                    // "react-component" | "bug-fix" | "refactor" | free-text
  project: string | null;              // Project-specific or global
  toolSequence: string[];              // ["file_read", "file_read", "file_edit", "bash"]
  argPatterns: Record<string, string>; // Typical arg shapes (file extensions, paths)
  observationCount: number;            // How many times this pattern was seen
  confidence: number;                  // 0.0–1.0, increases with observations
  lastObservedAt: string;
  createdAt: string;
  linkedNodeIds: string[];             // Memory nodes this was learned from
}
```

### 1.4 ProjectBrain

Pre-computed synthesis of all project knowledge.

```typescript
interface ProjectBrain {
  projectRoot: string;
  generatedAt: string;
  nodeCount: number;                   // How many nodes contributed
  brief: string;                       // ~200 tokens, the injection text
  stack: string[];                     // Detected/remembered technologies
  keyDecisions: string[];              // Top 5 decisions by confidence
  activeWork: string[];                // Recent session summaries
  knownPatterns: string[];             // Top procedural patterns
  confidenceAvg: number;               // Average confidence across project nodes
  lastSessionDate: string;
}
```

---

## 2. Graph Engine (`packages/core/src/memory/graph-engine.ts` — NEW)

Central engine that manages the node+edge graph with all operations.

### 2.1 Core Operations

```
class MemoryGraph {
  // ── Read ──────────────────────────────────────────────
  getNode(id: string): MemoryNode | null
  getEdgesFrom(nodeId: string, type?: EdgeType): MemoryEdge[]
  getEdgesTo(nodeId: string, type?: EdgeType): MemoryEdge[]
  getConnectedNodes(nodeId: string, depth?: number): MemoryNode[]
  traverseChain(startNodeId: string, edgeType: EdgeType, maxDepth?: number): MemoryNode[]
  
  // ── Write ─────────────────────────────────────────────
  addNode(node: Omit<MemoryNode, 'id'>): MemoryNode
  updateNode(id: string, patch: Partial<MemoryNode>): MemoryNode
  addEdge(edge: Omit<MemoryEdge, 'id'>): MemoryEdge
  removeEdge(id: string): void
  archiveNode(id: string, reason: string): void
  restoreNode(id: string): void
  
  // ── Query ─────────────────────────────────────────────
  recall(query: string, opts: GraphRecallOptions): ScoredNode[]
  findContradictions(node: MemoryNode): MemoryNode[]
  findRelated(node: MemoryNode, threshold?: number): MemoryNode[]
  
  // ── Maintenance ───────────────────────────────────────
  applyDecay(now?: Date): { decayed: number; archived: number }
  pruneOrphans(): number  // Remove nodes with no edges and low confidence
  computeProjectBrain(projectRoot: string): ProjectBrain
  
  // ── Persistence ───────────────────────────────────────
  save(): Promise<void>
  load(): Promise<void>
}
```

### 2.2 GraphRecallOptions

```typescript
interface GraphRecallOptions {
  scope: 'global' | 'project' | 'all';
  mode?: AvaMode;                      // Mode-aware weighting
  limit: number;                       // Max results
  minConfidence?: number;              // Filter low-confidence nodes
  includeArchived?: boolean;
  branch?: string;
  edgeTraversal?: boolean;             // Follow edges to find contextually related nodes
  traversalDepth?: number;             // How deep to follow edges (default 2)
}
```

### 2.3 ScoredNode (recall result)

```typescript
interface ScoredNode {
  node: MemoryNode;
  score: number;                       // Composite 0–1
  matchType: 'tfidf' | 'edge' | 'embedding' | 'exact';
  chain?: MemoryNode[];                // If found via edge traversal, the path
  chainEdgeTypes?: EdgeType[];         // Edge types in the path
}
```

---

## 3. Confidence System (`packages/core/src/memory/confidence.ts` — NEW)

### 3.1 Initial Confidence by Source

| Source | Initial confidence |
|---|---|
| User explicitly says "remember this" | 1.0 |
| User states a preference ("I always use X") | 0.9 |
| User approves a decision ("go for it") | 0.8 |
| LLM extraction (Layer 2 reflectAndExtract) | 0.7 |
| Ambient capture (candidate scoring) | 0.6 |
| Auto-extract regex (Layer 1) | 0.5 |
| Compression-extracted session summary | 0.4 |
| Migrated from v2 | 0.5 |

### 3.2 Decay Model

```
newConfidence = confidence - (daysSinceLastReinforcement * DECAY_RATE)
DECAY_RATE = 0.005 per day (halves in ~100 days if never reinforced)
```

- Decay is applied lazily: calculated on read, persisted on session end
- Nodes below 0.1 are auto-archived with reason 'decay'

### 3.3 Reinforcement Events

| Event | Confidence boost |
|---|---|
| Node surfaced in recall result and session continues successfully | +0.05 |
| Node surfaced in project brain brief | +0.03 |
| User explicitly recalls and uses the information | +0.10 |
| User restates the same fact/preference | +0.20 |
| User confirms when asked about a contradiction | +0.30 |
| Another node links TO this one via a new edge | +0.05 |

- Confidence is capped at 1.0
- Reinforcement updates `lastReinforcedAt` and resets the decay clock

---

## 4. Contradiction Detection (`packages/core/src/memory/contradictions.ts` — NEW)

### 4.1 Detection Algorithm

On every `addNode()`:

1. Find existing nodes with: same scope, same category (or related category), confidence > 0.2
2. Compute similarity: TF-IDF cosine (from v2 index) OR embedding cosine if available
3. If similarity > 0.7 AND content semantically differs:
   a. Run a quick LLM check (Qwen Flash, ~50 tokens): "Do these two statements contradict? A: {old} B: {new}"
   b. If yes: create `contradicts` edge between them
   c. Flag the newer node with `contradiction: true` in metadata
4. If similarity > 0.9 AND content is essentially the same: merge (update existing, don't create duplicate)

### 4.2 Resolution

Contradictions are resolved via:
- **Auto-resolution:** If the newer node has higher confidence, add `supersedes` edge and demote the old one
- **User-resolution:** Surface in the memory brief: "You said X before but Y now. I'm using Y — correct?" If user confirms, resolve. If user says X was right, demote Y.
- **Context-dependent:** Both are valid in different contexts (e.g., "dark mode always" globally but "light mode for this project"). Both kept, scoped appropriately.

---

## 5. Procedural Learning (`packages/core/src/memory/procedural.ts` — NEW)

### 5.1 Observation Tracking

After every successful tool-call sequence (agent turn with 2+ tool calls that ends with no error):

1. Extract the tool-call sequence: `["file_read", "grep", "file_edit", "bash"]`
2. Extract key arg patterns: file extensions touched, directories accessed
3. Hash the sequence + arg patterns into a signature
4. Check existing ProceduralPatterns for a matching signature
5. If match: increment `observationCount`, update `lastObservedAt`, boost `confidence`
6. If no match but similar (60%+ tool overlap): create new pattern as a variant
7. If no match and novel: create new pattern with `observationCount: 1`, `confidence: 0.3`

### 5.2 Crystallisation Threshold

When `observationCount >= 3` AND `confidence >= 0.6`:
- Pattern is "crystallised" — it's now a reliable learned procedure
- Create a `learned-from` edge from the pattern to the sessions that produced it
- The task classifier can use crystallised patterns to predict the right approach

### 5.3 Influence on Agent Behaviour

Crystallised patterns are surfaced in two ways:
1. **Task classifier enhancement:** When classifying a new task, check if any crystallised patterns match the task type. If yes, use the pattern's tool sequence as a hint in the directness injection: "For this task type you typically use: file_read → file_edit → bash. Consider following this approach."
2. **Project brain inclusion:** Top 3 procedural patterns by confidence are included in the project brain brief so Ava knows her own habits for this project.

---

## 6. Mode-Aware Recall (`packages/core/src/memory/mode-recall.ts` — NEW)

### 6.1 Category Weights per Mode

Each mode has a weighting profile that scales category scores during recall:

```typescript
const MODE_WEIGHTS: Record<AvaMode, Record<MemoryCategory, number>> = {
  work: {
    architecture: 1.5, pattern: 1.5, 'bug-fix': 1.3, convention: 1.3, decision: 1.2,
    'tool-config': 1.2, preference: 0.8, person: 0.3, general: 1.0,
    approval: 1.0, 'design-decision': 1.2,
  },
  chat: {
    person: 2.0, preference: 1.5, general: 1.2, decision: 0.8,
    architecture: 0.3, pattern: 0.3, 'bug-fix': 0.2, convention: 0.3,
    'tool-config': 0.2, approval: 0.5, 'design-decision': 0.5,
  },
  teach: {
    pattern: 1.5, general: 1.3, convention: 1.3, person: 1.0,
    preference: 1.0, architecture: 0.8, 'bug-fix': 0.8, decision: 0.8,
    'tool-config': 0.5, approval: 0.5, 'design-decision': 0.5,
  },
  security: {
    'bug-fix': 2.0, architecture: 1.5, convention: 1.3, 'tool-config': 1.2,
    pattern: 1.0, decision: 1.0, general: 0.8, preference: 0.3,
    person: 0.2, approval: 0.5, 'design-decision': 0.3,
  },
  plan: {
    decision: 2.0, architecture: 1.5, approval: 1.5, general: 1.2,
    preference: 1.0, pattern: 0.8, 'bug-fix': 0.8, convention: 0.8,
    person: 0.5, 'tool-config': 0.5, 'design-decision': 1.0,
  },
  brainstorm: {
    person: 1.5, preference: 1.5, decision: 1.3, general: 1.3,
    architecture: 0.8, approval: 1.0, 'design-decision': 1.0,
    pattern: 0.5, 'bug-fix': 0.3, convention: 0.3, 'tool-config': 0.3,
  },
};
```

### 6.2 Recall Score Formula

```
finalScore = (tfidfScore * 0.40) + (confidenceScore * 0.25) + (recencyScore * 0.20) + (modeWeight * 0.15)
```

Where:
- `tfidfScore` = TF-IDF cosine similarity (carried from v2)
- `confidenceScore` = node.confidence (0–1)
- `recencyScore` = exponential decay from lastRecalledAt or updatedAt (30-day half-life, carried from v2)
- `modeWeight` = MODE_WEIGHTS[currentMode][node.category] normalised to 0–1

---

## 7. Project Brain (`packages/core/src/memory/project-brain.ts` — NEW)

### 7.1 Synthesis Algorithm

Called at end of each session (or on demand) for the current project:

1. Collect all non-archived project-scoped nodes
2. Sort by confidence (descending)
3. Group by category
4. For each category, take top 3 by confidence
5. Extract procedural patterns with confidence > 0.6
6. Build the brief from template:

```
[Project: {name}]
Stack: {detected technologies from architecture nodes}
Key decisions: {top 5 decision nodes, one line each}
Active work: {most recent session summary nodes}
Patterns: {top 3 procedural patterns}
Known issues: {top 3 bug-fix nodes not marked resolved}
Last session: {date}
Nodes: {count} active, confidence avg {avg}
```

7. Target: ~200 tokens. If over, prioritise by confidence and trim lowest.
8. Cache to `brain.json`. Only regenerate if graph has changed since last generation.

### 7.2 Injection Point

In `MemoryAgent.generateBrief()`:
- Load project brain from cache (or compute if stale)
- Prepend as `[Project Brain]` block before the general memory brief
- This replaces the simpler `[Project Context]` prefix from v2.1

---

## 8. Ambient Capture (`packages/core/src/memory/ambient-capture.ts` — NEW)

### 8.1 Replaces Regex-Based Extraction

Current system: regex patterns scan messages → matching lines extracted → saved as memories. Misses everything that doesn't match a pattern.

Ambient system: EVERY assistant+user message pair is a candidate. A lightweight scoring model evaluates each candidate on three dimensions:

### 8.2 Candidate Scoring (runs after every turn)

```typescript
interface CaptureCandidate {
  userMessage: string;
  assistantMessage: string;
  toolsUsed: string[];
  turnIndex: number;
}

interface CandidateScore {
  novelty: number;      // 0–1: how different is this from existing nodes?
  relevance: number;    // 0–1: how likely to be useful in future sessions?
  confidence: number;   // 0–1: how clearly stated/decided is this?
  composite: number;    // weighted average
}
```

### 8.3 Scoring Model

**Option A — LLM-based (Qwen Flash, ~100 tokens per turn):**
- Prompt: "Rate this exchange on novelty (0-1), relevance (0-1), confidence (0-1). Return JSON only."
- Cheap: ~100 input tokens + 30 output tokens per turn on the cheapest model
- Accurate: the LLM understands context better than any heuristic

**Option B — Heuristic fallback (zero cost, for BYOK users without a model available):**
- Novelty: TF-IDF similarity to existing nodes (lower similarity = higher novelty)
- Relevance: presence of decision/architecture/convention/preference keywords
- Confidence: presence of explicit markers ("remember", "always", "we decided")

### 8.4 Promotion Threshold

- Composite score > 0.6: promote to real node
- Composite score 0.4–0.6: hold as candidate, promote if similar content appears again
- Composite score < 0.4: discard

### 8.5 Node Extraction from Promoted Candidates

When a candidate is promoted:
1. Run the existing Layer 2 LLM extraction (reflectAndExtract) to produce structured memory
2. OR use the ambient scoring model's output if it included a distilled summary
3. Assign initial confidence from the candidate's confidence score
4. Auto-detect category from content
5. Auto-detect scope (project vs global) using the improved scope guidance
6. Check for contradictions before inserting
7. Add to graph

---

## 9. Principled Forgetting (`packages/core/src/memory/forgetting.ts` — NEW)

### 9.1 Archive Criteria (evaluated on session start)

A node is archived when ANY of:
- `confidence < 0.1` after decay calculation
- Not recalled in 90 days AND has 0 active (non-archived) edges to other nodes
- Superseded by a newer node via `supersedes` edge AND the newer node has confidence > 0.7
- Contradicted by a higher-confidence node AND no user resolution after 30 days

### 9.2 Archive vs Delete

- **Archive** = move to cold storage (`cold/archive.json`). Searchable via explicit `deepRecall()` with `includeArchived: true`. Not surfaced in normal recall or briefs.
- **Hard delete** = only on explicit user request ("forget this") or after 1 year in cold storage with zero recalls.

### 9.3 Session-Scoped Markers

Some observations are session-only:
- "User seems frustrated" (emotional inference) → expires at session end
- "Currently debugging X" (working state) → covered by working memory layer, not persisted
- "Tried approach Y, it failed" → persisted as episodic (useful for future avoidance)

---

## 10. Storage Format

### 10.1 File Layout

```
~/.ava/memory/
├── graph.json              # All global-scoped nodes + all edges
├── procedures.json         # Crystallised procedural patterns (global)
├── brain-global.json       # Global brain cache (cross-project user profile)
├── tfidf-index.json        # TF-IDF index (carried from v2, updated on writes)
├── cold/
│   └── archive.json        # Archived nodes (cold storage)
└── sync-state.json         # Cloud sync cursor

<projectRoot>/.ava/memory/
├── graph.json              # Project-scoped nodes + project edges
├── procedures.json         # Project-specific procedural patterns
├── brain.json              # Project brain cache
└── cold/
    └── archive.json        # Project archived nodes
```

### 10.2 graph.json Format

```json
{
  "version": 3,
  "nodes": [ ...MemoryNode[] ],
  "edges": [ ...MemoryEdge[] ],
  "lastModified": "ISO timestamp",
  "lastDecayRun": "ISO timestamp",
  "lastForgetRun": "ISO timestamp"
}
```

### 10.3 Backwards Compatibility

- v2 `memory.json` is auto-detected on first load
- Migration runs automatically (see Section 11)
- v2 file renamed to `memory-v2-backup.json` after migration
- v3 graph.json becomes the sole source of truth

---

## 11. Migration (v2 → v3)

### 11.1 Auto-Migration on First Load

When `MemoryGraph.load()` finds `memory.json` but no `graph.json`:

1. Parse all v2 entries from memory.json
2. For each entry, create a MemoryNode:
   - `confidence: 0.5` (migrated)
   - `confidenceSource: 'migrated'`
   - `source: 'tool-save'` or inferred from tags
   - All v2 fields (category, scope, branch, tags, archived, etc.) carried forward
3. Run TF-IDF similarity across all migrated nodes
4. For pairs with similarity > 0.7 in same category: add `related-to` edge
5. For pairs with similarity > 0.9 in same category: merge (keep higher recall count)
6. Run contradiction detection on remaining pairs
7. Compute initial project brain
8. Write graph.json + brain.json
9. Rename memory.json → memory-v2-backup.json

### 11.2 Duration Estimate

- 500 entries: < 1 second
- 5,000 entries: ~3-5 seconds
- 15,000+ entries: ~10-15 seconds (but we just nuked to zero, so this is theoretical)

---

## 12. Integration Points

### 12.1 Files to Modify

| File | Change |
|---|---|
| `packages/core/src/memory/memory-manager.ts` | Refactor to use MemoryGraph internally. Public API stays compatible (saveEntry → addNode, recall → graph.recall). |
| `packages/core/src/memory/memory-agent.ts` | generateBrief() uses project brain + graph recall. extractAndSave() creates nodes with edges. |
| `packages/core/src/memory/auto-extract.ts` | Pattern groups create nodes + edges (approval → `approved-by` edge to preceding assistant node). Fallback for ambient capture when no LLM available. |
| `packages/core/src/memory/types.ts` | Add MemoryNode, MemoryEdge, ProceduralPattern, ProjectBrain, EdgeType, GraphRecallOptions, ScoredNode types. |
| `packages/core/src/agent/agent.ts` | After each tool-call batch, feed to procedural observer. On session end, trigger decay + brain recompute. |
| `packages/core/src/tools/memory-save.ts` | Create node via graph.addNode(). Run contradiction check. |
| `packages/core/src/tools/memory-recall.ts` | Use graph.recall() with mode-aware weights. Return chain info when edge traversal finds the result. |
| `packages/core/src/index.ts` | Export new types and classes. |

### 12.2 New Files

| File | Purpose |
|---|---|
| `packages/core/src/memory/graph-engine.ts` | MemoryGraph class — all node/edge/query/maintenance operations |
| `packages/core/src/memory/confidence.ts` | Confidence scoring, decay calculation, reinforcement |
| `packages/core/src/memory/contradictions.ts` | Contradiction detection algorithm, resolution helpers |
| `packages/core/src/memory/procedural.ts` | ProceduralObserver — tracks tool sequences, crystallises patterns |
| `packages/core/src/memory/mode-recall.ts` | Mode-aware recall profiles and category weighting |
| `packages/core/src/memory/project-brain.ts` | ProjectBrain synthesis, caching, injection |
| `packages/core/src/memory/ambient-capture.ts` | Always-on candidate scoring, promotion, replaces regex-only extraction |
| `packages/core/src/memory/forgetting.ts` | Principled forgetting — archive criteria, decay application, cold storage management |
| `packages/core/src/memory/migration-v3.ts` | v2→v3 auto-migration logic |

### 12.3 Cloud Sync Changes

The existing `PlatformMemorySync` pushes flat entries. For v3:
- Push entire graph.json (nodes + edges) as a single payload
- Pull merges by node ID (same as entry ID merging in v2, just with edge awareness)
- Conflict resolution: last-write-wins per node, edges from both sides merged
- Sync-state.json tracks last-synced graph version hash

### 12.4 Training Data Export

```typescript
// In graph-engine.ts or a new export file
function exportTrainingData(graph: MemoryGraph): TrainingExample[] {
  // For each decision/approval node, traverse its because/approved-by edges
  // to build a reasoning chain. Each chain becomes one training example:
  // { prompt: "the question/context", response: "the decision", reasoning: "the chain" }
  
  // For each bug-fix + resolved-by chain: 
  // { prompt: "the bug", response: "the fix", reasoning: "how it was found" }
  
  // For each procedural pattern:
  // { prompt: "task type description", response: "tool sequence", reasoning: "learned from N observations" }
}
```

---

## 13. Dashboard Integration (post-core, can ship incrementally)

### 13.1 Memory Health Widget (Overview page)
- Active nodes: N
- Confidence avg: X.XX
- Contradictions pending: N
- Procedures learned: N
- Stalest node: "X from N days ago"

### 13.2 Graph Visualisation (Memory page enhancement)
- Node list with confidence badges (green/yellow/red)
- Edge list showing relationships
- Contradiction alerts with resolve button
- Archive/restore controls

### 13.3 Procedural Patterns View
- List of learned patterns with observation count
- Tool sequence visualisation
- "Forget this pattern" control

---

## 14. Build Order (Single Unified Build)

Recommended order for implementation within one or two sessions:

1. **Types** — Define all interfaces in `types.ts` (MemoryNode, MemoryEdge, ProceduralPattern, ProjectBrain, etc.)
2. **Graph Engine** — Core `MemoryGraph` class with node/edge CRUD, persistence, basic recall
3. **Confidence** — Scoring + decay functions (used by graph engine)
4. **Contradiction Detection** — Detection algorithm + resolution helpers (used at write time)
5. **Mode-Aware Recall** — Category weight profiles + enhanced scoring formula
6. **Project Brain** — Synthesis algorithm + cache + injection into MemoryAgent
7. **Migration** — v2→v3 converter (so we can test with real data immediately)
8. **Procedural Learning** — Observer + crystallisation (hooks into agent.ts)
9. **Ambient Capture** — Candidate scoring + promotion (replaces regex extraction)
10. **Forgetting** — Archive criteria + decay application + cold storage
11. **Refactor MemoryManager** — Wrap MemoryGraph, maintain public API compatibility
12. **Refactor MemoryAgent** — Use project brain + graph recall + ambient capture
13. **Update Tools** — memory_save creates nodes with edges, memory_recall uses graph
14. **Training Export** — Graph → JSONL with reasoning chains
15. **Integration Tests** — Migration, recall accuracy, contradiction detection, procedural crystallisation

---

## 15. Success Criteria

The system is ready for 1.0 when:

1. **Cold start eliminated.** Every session starts with a project brain injection. No more blank context on first turn.
2. **Recall precision > 80%.** 12+ of 15 recalled nodes are genuinely relevant to the current task (vs ~4-5 today).
3. **Contradictions caught.** When the user says "actually, use X instead of Y", the old memory is demoted and the contradiction is visible.
4. **Procedures crystallise.** After 3 identical task patterns, the system has a learned procedure node.
5. **Forgetting works.** After 90 days of simulated use, the graph has < 500 active nodes per project with > 0.5 avg confidence (vs 14K+ low-quality flat entries in v1).
6. **The demo works.** Split-screen Copilot vs Ava. "What does this project use?" Copilot: blank. Ava: full causal chain from the graph. "You made me do this."

---

*Plan complete. Ready to build.*
