// Session-level stats accumulator — shared between AvaViewProvider and DashboardPanel

export interface SessionStats {
  messages: number;
  tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model_breakdown: Array<{
    model: string;
    provider: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  session_start: string;
}

class SessionStatsTracker {
  private stats: SessionStats;

  constructor() {
    this.stats = this.empty();
  }

  recordUsage(model: string, provider: string, inputTokens: number, outputTokens: number): void {
    this.stats.total_input_tokens += inputTokens;
    this.stats.total_output_tokens += outputTokens;

    const existing = this.stats.model_breakdown.find(
      m => m.model === model && m.provider === provider
    );
    if (existing) {
      existing.requests++;
      existing.input_tokens += inputTokens;
      existing.output_tokens += outputTokens;
    } else {
      this.stats.model_breakdown.push({
        model,
        provider,
        requests: 1,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
    }
  }

  recordMessage(): void {
    this.stats.messages++;
  }

  recordToolCall(): void {
    this.stats.tool_calls++;
  }

  getStats(): SessionStats {
    return { ...this.stats, model_breakdown: [...this.stats.model_breakdown] };
  }

  private empty(): SessionStats {
    return {
      messages: 0,
      tool_calls: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      model_breakdown: [],
      session_start: new Date().toISOString(),
    };
  }
}

export const sessionStats = new SessionStatsTracker();
