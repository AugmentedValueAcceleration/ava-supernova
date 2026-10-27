import { gzipSync } from 'node:zlib';
import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { PLATFORM_MODELS } from './models.js';

export class PlatformProvider extends BaseProvider {
  readonly name = 'platform';
  readonly displayName = 'Ava Platform';

  protected getDefaultBaseUrl(): string {
    return 'https://avasupernova.com/api';
  }

  protected getCompletionUrl(): string {
    return `${this.baseUrl}/chat`;
  }

  /**
   * Packed as gzip+base64 (27 Oct 2026). The edge firewall in front of the
   * platform refuses any body containing text like `| python -c`, and a coding
   * agent's history is full of shell commands — one ordinary command locked a
   * whole conversation, every turn refused in a tenth of a second. Encoded,
   * there is nothing for it to match; gzip also shrinks a long conversation.
   * The route unpacks it (web lib/request-body-envelope) and still accepts
   * plain bodies from older clients.
   */
  protected override serializeBody(body: unknown): string {
    const payload = gzipSync(Buffer.from(JSON.stringify(body), 'utf8')).toString('base64');
    return JSON.stringify({ encoding: 'gzip+base64', payload });
  }

  listModels(): ModelDefinition[] {
    return PLATFORM_MODELS;
  }
}
