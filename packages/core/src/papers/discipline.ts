import type { PaperDiscipline } from './types.js';

/**
 * Map an arXiv category code (e.g. 'cs.AI', 'q-bio.QM', 'physics.gen-ph')
 * to one of Ava's discipline buckets. Used when arXiv is the source of
 * truth so the Featured-tab pivots can filter by discipline.
 */
export function arxivCategoryToDiscipline(category: string): PaperDiscipline {
  const prefix = category.toLowerCase().split('.')[0];
  switch (prefix) {
    case 'cs':
    case 'stat':
      return 'ai_cs';
    case 'math':
      return 'math';
    case 'physics':
    case 'astro-ph':
    case 'cond-mat':
    case 'gr-qc':
    case 'hep-ex':
    case 'hep-lat':
    case 'hep-ph':
    case 'hep-th':
    case 'nucl-ex':
    case 'nucl-th':
    case 'quant-ph':
      return 'physics';
    case 'q-bio':
      return 'biology';
    case 'q-fin':
    case 'econ':
      return 'economics';
    case 'eess':
      return 'engineering';
    default:
      return 'other';
  }
}

/**
 * Map an OpenAlex top-level concept ("field") name to a discipline.
 * OpenAlex returns a list of concepts per work; pass the highest-
 * level (level=0) concept name. Falls back to 'other' on miss.
 */
export function openalexFieldToDiscipline(field: string | null | undefined): PaperDiscipline {
  if (!field) return 'other';
  const f = field.toLowerCase();
  if (f.includes('computer science') || f.includes('artificial intelligence')) return 'ai_cs';
  if (f.includes('biology') || f.includes('biochem') || f.includes('genetic')) return 'biology';
  if (f.includes('medic') || f.includes('clinical') || f.includes('pharmacol') || f.includes('nursing')) return 'medicine';
  if (f.includes('physics') || f.includes('astronomy')) return 'physics';
  if (f.includes('chemistry') || f.includes('material')) return 'chemistry';
  if (f.includes('geology') || f.includes('environmental') || f.includes('earth') || f.includes('atmospheric') || f.includes('oceanography')) return 'earth_sciences';
  if (f.includes('psychology') || f.includes('sociology') || f.includes('political') || f.includes('anthropology') || f.includes('linguistic')) return 'social_sciences';
  if (f.includes('econ') || f.includes('finance') || f.includes('business')) return 'economics';
  if (f.includes('engineering')) return 'engineering';
  if (f.includes('math')) return 'math';
  return 'other';
}

/**
 * Coarse keyword-based fallback when neither arXiv categories nor
 * OpenAlex concepts are available (e.g. Crossref-only lookups).
 */
export function inferDisciplineFromText(title: string, abstract?: string): PaperDiscipline {
  const text = `${title} ${abstract ?? ''}`.toLowerCase();
  if (/\b(neural network|transformer|deep learning|llm|reinforcement learning|computer vision|nlp|machine learning)\b/.test(text)) return 'ai_cs';
  if (/\b(protein|gene|crispr|genome|cell|enzyme|microbi)\b/.test(text)) return 'biology';
  if (/\b(clinical|patient|trial|placebo|disease|cancer|vaccine|epidemiolog)\b/.test(text)) return 'medicine';
  if (/\b(quantum|particle|relativity|gravitational|cosmolog|astrophys)\b/.test(text)) return 'physics';
  if (/\b(catalys|polymer|reaction|molecule|synthesi)\b/.test(text)) return 'chemistry';
  if (/\b(climate|warming|earthquake|geolog|atmospher|ocean)\b/.test(text)) return 'earth_sciences';
  if (/\b(psycholog|behaviour|behavior|social|society|cognitive)\b/.test(text)) return 'social_sciences';
  if (/\b(economic|inflation|monetary|labour market|gdp|trade policy)\b/.test(text)) return 'economics';
  if (/\b(engineering|aerospace|mechanical|civil|structural)\b/.test(text)) return 'engineering';
  if (/\b(theorem|lemma|conjecture|topolog|algebra|combinator)\b/.test(text)) return 'math';
  return 'other';
}
