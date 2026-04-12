/**
 * Pack Router — automatically activates knowledge packs based on the
 * user's task, not just file structure detection.
 *
 * Runs on the first user message of a session. Matches keywords/phrases
 * against pack domains and returns which packs to load. The user never
 * has to manually enable packs — Ava knows what she needs.
 *
 * This replaces the "manually enabled packs" system as the primary
 * activation mechanism. File-structure detection (game projects, app
 * projects) runs first; the router fills in anything the file detection
 * missed based on what the user actually asked for.
 */

import type { KnowledgeDomain } from './types.js';
import { BUILTIN_PACKS } from './builtin-packs.js';

/** Domain keywords — if any keyword matches the user's message, that domain's pack activates. */
const DOMAIN_KEYWORDS: Record<KnowledgeDomain, string[]> = {
  marketing: ['marketing', 'growth', 'seo', 'social media', 'content strategy', 'conversion', 'acquisition', 'retention', 'analytics', 'campaign'],
  finance: ['finance', 'financial', 'revenue', 'budget', 'pricing', 'unit economics', 'fundraising', 'investor', 'p&l', 'cash flow', 'runway'],
  legal: ['legal', 'compliance', 'gdpr', 'ccpa', 'privacy policy', 'terms of service', 'license', 'copyright', 'trademark', 'contract'],
  sales: [],
  hr: [],
  product: ['product strategy', 'roadmap', 'user research', 'feature prioriti', 'product market fit', 'mvp'],
  design: ['ui design', 'ux design', 'wireframe', 'mockup', 'figma', 'design system', 'user flow'],
  devops: ['devops', 'docker', 'kubernetes', 'k8s', 'terraform', 'ci/cd', 'pipeline', 'deploy', 'infrastructure', 'aws', 'gcp', 'azure', 'monitoring', 'grafana'],
  security: ['security', 'vulnerability', 'penetration', 'audit', 'owasp', 'xss', 'sql injection', 'csrf', 'cve'],
  'data-science': ['data science', 'machine learning', 'ml', 'deep learning', 'neural network', 'pandas', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'training data', 'model'],
  education: [],
  'game-development': ['game', 'unreal', 'unity', 'godot', 'game engine', 'level design', 'gameplay'],
  'web-development': ['web', 'react', 'next.js', 'vue', 'svelte', 'css', 'html', 'frontend', 'backend', 'full-stack', 'fullstack', 'api', 'rest', 'graphql'],
  'mobile-development': ['mobile', 'react native', 'flutter', 'swift', 'kotlin', 'ios', 'android', 'capacitor', 'expo', 'app store'],
  'api-development': ['api', 'rest api', 'graphql', 'endpoint', 'webhook', 'rate limit', 'authentication', 'jwt', 'oauth'],
  'systems-programming': ['systems', 'rust', 'c++', 'low-level', 'kernel', 'embedded', 'memory management', 'concurrency', 'threading'],
  'app-development': ['redesign', 'layout', 'spacing', 'professional', 'polish', 'ui', 'ux', 'looks', 'cramped', 'design tokens', 'visual', 'component', 'page'],
  internal: [],
  custom: [],
};

/**
 * Given a user message, return the pack IDs that should be activated.
 * Excludes packs that are already loaded (via file detection or manual enable).
 */
export function routePacks(
  userMessage: string,
  alreadyLoadedIds: Set<string>,
): string[] {
  const lower = userMessage.toLowerCase();
  const activated: string[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.length === 0) continue;
    const matches = keywords.some(kw => lower.includes(kw));
    if (!matches) continue;

    // Find the pack for this domain
    const pack = BUILTIN_PACKS.find(p => p.domain === domain);
    if (!pack) continue;
    if (alreadyLoadedIds.has(pack.id)) continue;

    activated.push(pack.id);
  }

  return activated;
}

/**
 * Get the full pack content for a list of pack IDs.
 */
export function getPackContent(packIds: string[]): string {
  const sections: string[] = [];
  for (const id of packIds) {
    const pack = BUILTIN_PACKS.find(p => p.id === id);
    if (pack) {
      sections.push(`## Active Knowledge Pack: ${pack.name}\n\n${pack.context}`);
    }
  }
  return sections.join('\n\n');
}

/**
 * Convenience: route + get content in one call.
 */
export function autoActivatePacks(
  userMessage: string,
  alreadyLoadedIds: Set<string>,
): { packIds: string[]; content: string } {
  const packIds = routePacks(userMessage, alreadyLoadedIds);
  const content = getPackContent(packIds);
  return { packIds, content };
}
