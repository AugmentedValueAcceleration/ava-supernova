import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { verifyQuote, type ArticleStore, type ArticleInput, type FetchedCorpus } from '../news/index.js';

/**
 * Emit a finished article to the Newsroom canvas — one call per article.
 *
 * This tool does the deterministic work the model cannot be trusted with, in the
 * same spirit as write_post's character count: it does not ASK her to be honest,
 * it makes dishonesty FAIL.
 *
 *   - Every QUOTE is checked against the text she actually fetched this turn. A
 *     quote she reconstructed from memory does not appear in the corpus, so the
 *     article is refused and she has to fix it before it can exist. A fabricated
 *     quote is a libel risk and the end of the product; the honour system is not
 *     good enough for that.
 *
 *   - An article with NO sources is refused outright. "Sourced or silent" is the
 *     first law, and a law that isn't enforced is a suggestion.
 *
 *   - Her opinion is a SEPARATE field. If ava_read's text turns up inside the
 *     body, the fence has been breached and the article is refused.
 *
 * Refusals come back as instructions, not scolding — she fixes and re-calls in
 * the same turn, exactly as she does when a post is over the character cap.
 */
export class WriteArticleTool implements Tool {
  readonly name = 'write_article';
  readonly description =
    'Emit the finished article as a card. ONE call per article. Never write an article body in your chat reply. Every claim in the body must be supported by `sources`; every quote must be verbatim from a page you fetched this turn (it is CHECKED); `ava_read` is a separate field and must never appear in the body.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_article',
    description:
      'Emit the finished article as a card. Call ONCE per article. NEVER write an article body in your chat reply — the reply is for reasoning and reporting back. Every quote is VERIFIED against the pages you fetched this turn: a quote you cannot evidence will be rejected and you must fix it. `ava_read` is a separate field — never blend your opinion into the body.',
    parameters: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'Plain and precise. Never a tease, never hype.' },
        standfirst: { type: 'string', description: 'One sentence under the headline: what happened, in plain words.' },
        body: {
          type: 'string',
          description:
            'The report, in YOUR OWN words. Markdown. Facts only — what is established, who established it, what is disputed. NO opinion (that goes in ava_read). Never reproduce another outlet\'s article: you are writing your own account, not republishing theirs.',
        },
        category: {
          type: 'string',
          enum: ['world', 'ai', 'technology', 'open-source', 'security-privacy', 'business', 'science', 'health', 'food', 'education', 'sport'],
        },
        sources: {
          type: 'array',
          description: 'Every outlet the report rests on. If a claim in the body is not supported by one of these, it does not belong in the body.',
          items: {
            type: 'object',
            properties: {
              outlet: { type: 'string' },
              headline: { type: 'string', description: "That outlet's headline, verbatim." },
              url: { type: 'string' },
            },
            required: ['outlet', 'headline', 'url'],
          },
        },
        quotes: {
          type: 'array',
          description: 'Verbatim quotes used in the body. Each is CHECKED against what you fetched this turn — if you cannot evidence it, it will be rejected. Never reconstruct a quote from memory.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'The quote, word for word.' },
              speaker: { type: 'string', description: 'Who said it.' },
              outlet: { type: 'string', description: 'Which outlet reported it.' },
              url: { type: 'string' },
            },
            required: ['text', 'outlet', 'url'],
          },
        },
        coverage: {
          type: 'object',
          description: 'The spread. Receipts, not ratings — never a political lean.',
          properties: {
            independent_sources: { type: 'number', description: 'Outlets that did their own reporting. The number that means something.' },
            total_outlets: { type: 'number', description: 'Total carrying it, including syndicated copies. NOT corroboration.' },
            wire: { type: 'string', description: 'The wire service, if the coverage is largely one report echoed (e.g. "Reuters").' },
            not_covering: { type: 'string', description: 'Who is conspicuously silent, if that is part of the story.' },
            disagreement: { type: 'string', description: 'Where outlets report the same event differently — quote both headlines.' },
          },
        },
        unverified: {
          type: 'array',
          description: 'Claims you could NOT stand up. These are PUBLISHED, in plain sight. "I could not verify this" is a publishable sentence; a confident false claim is not.',
          items: { type: 'string' },
        },
        ava_read: { type: 'string', description: 'YOUR view — fenced off, labelled, unmistakably opinion. Be sharp. But it must NOT appear in the body.' },
        image_prompt: {
          type: 'string',
          description:
            "The SUBJECT of the header photograph — a PLACE, a BUILDING or an OBJECT that is genuinely ON THIS STORY. Be specific and concrete: a Strait of Hormuz story is 'an oil tanker in the Strait of Hormuz at dawn, seen from the shore'; a rates story is 'the facade of the Bank of England'; a floods story is 'a flooded rural road under grey water'. Two absolute limits: (1) NEVER a person — no faces, no figures, no crowds, not even 'a man in the distance'; report politics through the seat of power rather than the person holding it, so Washington is the White House, Westminster is Big Ben or the door of No. 10, Greater Manchester is the Town Hall. (2) NEVER the event itself — no fire, no explosion, no wreckage, no casualties, no warships exchanging fire. A generated picture of a real event is a fabricated news photograph, which is the same crime as a fabricated quote. The camera style is applied for you; just name the subject.",
        },
      },
      required: ['headline', 'body', 'category', 'sources'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.articleStore as ArticleStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Article storage is not available in this context. The host must inject `articleStore` into shared state.',
      };
    }

    const headline = String(args.headline ?? '').trim();
    const body = String(args.body ?? '').trim();
    const category = String(args.category ?? '').trim();
    const avaRead = String(args.ava_read ?? '').trim();

    if (!headline) return { success: false, output: 'write_article requires a headline.' };
    if (body.length < 80) return { success: false, output: 'write_article requires a real body — this is an article, not a caption.' };
    if (!category) return { success: false, output: 'write_article requires a category.' };

    // ── Law 1: sourced or silent ────────────────────────────────────────────
    const rawSources = Array.isArray(args.sources) ? args.sources : [];
    const sources = rawSources
      .map((s) => {
        const o = (s && typeof s === 'object') ? s as Record<string, unknown> : {};
        return {
          outlet: String(o.outlet ?? '').trim(),
          headline: String(o.headline ?? '').trim(),
          url: String(o.url ?? '').trim(),
        };
      })
      .filter((s) => s.outlet && s.url);

    if (sources.length === 0) {
      return {
        success: false,
        output:
          'REFUSED: no sources. An article with nothing behind it is not reporting — it is an assertion. Call research_story, then cite what you actually read. If the story cannot be stood up, say so in the chat and do not write it.',
      };
    }

    // ── Law 2: quotes are verified, not trusted ─────────────────────────────
    const corpus = (context.sharedState?.fetchedCorpus as FetchedCorpus | undefined) ?? { hits: [] };
    const rawQuotes = Array.isArray(args.quotes) ? args.quotes : [];
    const quotes = rawQuotes
      .map((q) => {
        const o = (q && typeof q === 'object') ? q as Record<string, unknown> : {};
        return {
          text: String(o.text ?? '').trim(),
          speaker: String(o.speaker ?? '').trim() || undefined,
          outlet: String(o.outlet ?? '').trim(),
          url: String(o.url ?? '').trim(),
        };
      })
      .filter((q) => q.text);

    if (quotes.length > 0 && corpus.hits.length === 0) {
      return {
        success: false,
        output:
          'REFUSED: you have quotes but fetched nothing this turn. A quote must come from a page you actually read — not from memory. Call research_story or fact_check first, then quote from what comes back.',
      };
    }

    const unevidenced = quotes.filter((q) => !verifyQuote(q.text, corpus).ok);
    if (unevidenced.length > 0) {
      return {
        success: false,
        output:
          `REFUSED: ${unevidenced.length} quote(s) do not appear in anything you fetched this turn:\n` +
          unevidenced.map((q) => `  · "${q.text.slice(0, 100)}${q.text.length > 100 ? '…' : ''}" (attributed to ${q.outlet || 'unknown'})`).join('\n') +
          '\n\nEither quote it EXACTLY as it appears in a source you pulled, or drop the quote and paraphrase — saying that you are paraphrasing. ' +
          'This is not a formatting complaint: a quote you cannot evidence is one you may have reconstructed, and a fabricated quote ends this product. ' +
          'Note the excerpt may not contain the whole article, so the quote may well be real — but if you cannot evidence it, it does not run.',
      };
    }

    // ── Law 3: the fence between report and opinion ─────────────────────────
    if (avaRead.length > 40) {
      // Compare on a normalised slice so trivial whitespace/casing doesn't hide a leak.
      const probe = avaRead.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
      if (body.toLowerCase().replace(/\s+/g, ' ').includes(probe)) {
        return {
          success: false,
          output:
            'REFUSED: your read has leaked into the body. The report and your opinion are two separate zones — that separation is the reason a reader can trust the report at all. Take the opinion OUT of the body and leave it in ava_read.',
        };
      }
    }

    const unverified = (Array.isArray(args.unverified) ? args.unverified : [])
      .map((u) => String(u ?? '').trim())
      .filter(Boolean);

    const article: ArticleInput = {
      headline,
      standfirst: String(args.standfirst ?? '').trim() || undefined,
      body,
      category,
      sources,
      quotes,
      coverage: (args.coverage && typeof args.coverage === 'object') ? args.coverage as Record<string, unknown> : undefined,
      unverified,
      ava_read: avaRead || undefined,
      image_prompt: String(args.image_prompt ?? '').trim() || undefined,
    };

    const { id } = await store.save(article);

    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        id,
        headline,
        category,
        sources: sources.length,
        quotes_verified: quotes.length,
        unverified_claims: unverified.length,
        note: 'Article drafted. Every quote was checked against what you fetched this turn.',
      }),
    };
  }
}
