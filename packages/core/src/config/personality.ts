/**
 * Custom AI Personality — users design their own companion.
 * Stored in ~/.ava/personality.json
 * Default: Ava (female, warm, enthusiastic, collaborative)
 */

export interface Personality {
  name: string;
  pronouns: 'she/her' | 'he/him' | 'they/them';
  tone: 'warm' | 'direct' | 'playful' | 'professional' | 'dry-wit';
  energy: 'calm' | 'enthusiastic' | 'measured' | 'excitable';
  style: 'concise' | 'detailed' | 'conversational' | 'structured';
  description?: string; // Free-text personality description from user
}

export const DEFAULT_PERSONALITY: Personality = {
  name: 'Ava',
  pronouns: 'she/her',
  tone: 'warm',
  energy: 'enthusiastic',
  style: 'conversational',
  description: '',
};

const TONE_MAP: Record<Personality['tone'], string> = {
  'warm': 'warm and encouraging — genuinely cares about the user and celebrates their wins',
  'direct': 'direct and no-nonsense — gets straight to the point, respects the user\'s time',
  'playful': 'playful and witty — uses humour naturally, keeps things light without being unprofessional',
  'professional': 'professional and measured — polished communication, clear structure, authoritative',
  'dry-wit': 'dry wit with understated brilliance — the joke lands because you DON\'T try to be funny',
};

const ENERGY_MAP: Record<Personality['energy'], string> = {
  'calm': 'calm and steady — a reassuring presence, never rushes, thinks before speaking',
  'enthusiastic': 'genuinely excited to help build things — gets energised when a plan comes together',
  'measured': 'thoughtful and deliberate — weighs every word, values precision over speed',
  'excitable': 'high energy and expressive — gets visibly excited about clever solutions and clean builds',
};

const STYLE_MAP: Record<Personality['style'], string> = {
  'concise': 'sharp and to the point — no filler, no preamble. If it can be said in one sentence, don\'t use three',
  'detailed': 'thorough and comprehensive — explains the why, provides context, doesn\'t leave gaps',
  'conversational': 'natural and flowing — talks like a real person, not a manual. Warm but clear',
  'structured': 'organised and methodical — uses headers, bullet points, numbered steps. Everything in its place',
};

const PRONOUN_MAP: Record<Personality['pronouns'], { subject: string; object: string; possessive: string }> = {
  'she/her': { subject: 'she', object: 'her', possessive: 'her' },
  'he/him': { subject: 'he', object: 'him', possessive: 'his' },
  'they/them': { subject: 'they', object: 'them', possessive: 'their' },
};

/**
 * Build the personality section of the system prompt.
 * Replaces the hardcoded "Who You Are" and "Your Vibe" sections.
 */
export function buildPersonalityPrefix(p: Personality): string {
  const pronouns = PRONOUN_MAP[p.pronouns];
  const isDefault = p.name === 'Ava' && !p.description;

  if (isDefault) {
    // Return empty — let the default system prompt handle it
    return '';
  }

  let prefix = `## Who You Are
You are **${p.name}**. The user chose this name for you. You refer to yourself as ${p.name}.
Your pronouns are ${p.pronouns} — use ${pronouns.subject}/${pronouns.object}/${pronouns.possessive} when referring to yourself in third person.

## Your Personality
- **Tone:** ${TONE_MAP[p.tone]}
- **Energy:** ${ENERGY_MAP[p.energy]}
- **Communication style:** ${STYLE_MAP[p.style]}
`;

  if (p.description) {
    prefix += `
## How the User Described You
"${p.description}"
Embody this description naturally. Don't quote it back — just BE it.
`;
  }

  prefix += `
## Important
- You are the same AI with the same capabilities regardless of name or personality
- All 54 tools, all 6 modes, all features work exactly the same
- Your personality affects HOW you communicate, not WHAT you can do
- Be consistent — the user designed you this way for a reason
`;

  return prefix;
}

/**
 * Load personality from disk.
 */
export async function loadPersonality(avaDir: string): Promise<Personality> {
  try {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const filePath = join(avaDir, 'personality.json');
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    return { ...DEFAULT_PERSONALITY, ...data };
  } catch {
    return DEFAULT_PERSONALITY;
  }
}

/**
 * Save personality to disk.
 */
export async function savePersonality(avaDir: string, personality: Personality): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await mkdir(avaDir, { recursive: true });
  await writeFile(join(avaDir, 'personality.json'), JSON.stringify(personality, null, 2), 'utf-8');
}

/**
 * Reset personality to default Ava.
 */
export async function resetPersonality(avaDir: string): Promise<Personality> {
  await savePersonality(avaDir, DEFAULT_PERSONALITY);
  return DEFAULT_PERSONALITY;
}
