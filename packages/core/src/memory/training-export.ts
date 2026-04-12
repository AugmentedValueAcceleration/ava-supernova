import type { MemoryGraph } from './graph-engine.js';
/**
 * Training Data Export — graph → JSONL with reasoning chains.
 *
 * Every node with its edges is a potential training example for Ava's
 * future own-model. This module traverses the graph and produces
 * structured training examples that include causal reasoning chains —
 * far more valuable than flat fact pairs because they teach the model
 * WHY, not just WHAT.
 *
 * Export formats:
 *   - JSONL-SFT: supervised fine-tuning (prompt/response pairs)
 *   - JSONL-DPO: direct preference optimisation (prompt/chosen/rejected)
 *   - Reasoning chains: traverses because/approved-by/resolved-by edges
 */


import type { EdgeType } from './types.js';

/** A single training example. */
export interface TrainingExample {
  /** The context/question. */
  prompt: string;
  /** The ideal response. */
  response: string;
  /** Reasoning chain (from edge traversal). */
  reasoning?: string;
  /** Which edge types contributed to this example. */
  edgeTypes: EdgeType[];
  /** Confidence of the source nodes. */
  confidence: number;
  /** Category for filtering. */
  category: string;
  /** Metadata for dataset management. */
  metadata: {
    nodeIds: string[];
    project?: string;
    generatedAt: string;
  };
}

/**
 * Export training examples from the graph by traversing decision chains.
 */
export function exportTrainingData(graph: MemoryGraph): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const now = new Date().toISOString();

  const nodes = graph.getActiveNodes();

  for (const node of nodes) {
    // Skip low-confidence nodes — they're not reliable training signal
    const conf = graph.getEffectiveConfidence(node);
    if (conf < 0.4) continue;

    // ── Decision chains: decision + because edges ────────────────────
    if (node.category === 'decision') {
      const becauseChain = graph.traverseChain(node.id, 'because', 3);
      const approvalEdges = graph.getEdgesTo(node.id, 'approved-by');

      if (becauseChain.length > 0 || approvalEdges.length > 0) {
        const reasoning = becauseChain.map(n => n.content).join(' → ');
        const approvalContext = approvalEdges.length > 0
          ? graph.getNode(approvalEdges[0].fromNodeId)?.content ?? ''
          : '';

        examples.push({
          prompt: `What was decided and why?`,
          response: node.content,
          reasoning: reasoning || approvalContext || undefined,
          edgeTypes: becauseChain.length > 0 ? ['because'] : ['approved-by'],
          confidence: conf,
          category: 'decision',
          metadata: {
            nodeIds: [node.id, ...becauseChain.map(n => n.id)],
            generatedAt: now,
          },
        });
      }
    }

    // ── Bug fix chains: bug + resolved-by ────────────────────────────
    if (node.category === 'bug-fix') {
      const resolvedBy = graph.traverseChain(node.id, 'resolved-by', 2);
      const generalised = graph.traverseChain(node.id, 'generalised-to', 2);

      if (resolvedBy.length > 0) {
        examples.push({
          prompt: `Bug: ${node.content.slice(0, 200)}`,
          response: resolvedBy.map(n => n.content).join('\n'),
          reasoning: generalised.length > 0
            ? `Generalised lesson: ${generalised.map(n => n.content).join(' → ')}`
            : undefined,
          edgeTypes: ['resolved-by', ...(generalised.length > 0 ? ['generalised-to' as EdgeType] : [])],
          confidence: conf,
          category: 'bug-fix',
          metadata: {
            nodeIds: [node.id, ...resolvedBy.map(n => n.id), ...generalised.map(n => n.id)],
            generatedAt: now,
          },
        });
      }
    }

    // ── Architecture/preference as context examples ──────────────────
    if (node.category === 'architecture' || node.category === 'preference') {
      const implicationsChain = graph.traverseChain(node.id, 'implies', 2);

      examples.push({
        prompt: `What are the conventions/preferences for this project?`,
        response: node.content,
        reasoning: implicationsChain.length > 0
          ? `Implies: ${implicationsChain.map(n => n.content).join(' → ')}`
          : undefined,
        edgeTypes: implicationsChain.length > 0 ? ['implies'] : [],
        confidence: conf,
        category: node.category,
        metadata: {
          nodeIds: [node.id, ...implicationsChain.map(n => n.id)],
          generatedAt: now,
        },
      });
    }
  }

  // Sort by confidence descending — highest quality examples first
  examples.sort((a, b) => b.confidence - a.confidence);

  return examples;
}

/**
 * Format training examples as JSONL for SFT (supervised fine-tuning).
 */
export function toJsonlSft(examples: TrainingExample[]): string {
  return examples.map(ex => {
    const entry: Record<string, unknown> = {
      messages: [
        { role: 'user', content: ex.prompt },
        { role: 'assistant', content: ex.response },
      ],
      metadata: {
        category: ex.category,
        confidence: ex.confidence,
        reasoning: ex.reasoning,
        edgeTypes: ex.edgeTypes,
        ...ex.metadata,
      },
    };
    return JSON.stringify(entry);
  }).join('\n');
}

/**
 * Format as JSONL with reasoning chains visible in the response.
 * More suitable for training models that should show their work.
 */
export function toJsonlWithReasoning(examples: TrainingExample[]): string {
  return examples.filter(ex => ex.reasoning).map(ex => {
    const entry = {
      messages: [
        { role: 'user', content: ex.prompt },
        { role: 'assistant', content: `${ex.response}\n\nReasoning: ${ex.reasoning}` },
      ],
      metadata: {
        category: ex.category,
        confidence: ex.confidence,
        edgeTypes: ex.edgeTypes,
        ...ex.metadata,
      },
    };
    return JSON.stringify(entry);
  }).join('\n');
}
