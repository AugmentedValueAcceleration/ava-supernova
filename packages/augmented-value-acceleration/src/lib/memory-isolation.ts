import { supabase } from './supabase';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface PersonalMemory {
  id: string;
  user_id: string;
  content: string;
  category?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface TeamMemory {
  id: string;
  department: string;
  project_id?: string;
  content: string;
  author_id: string;
  author_name: string;
  category?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface CompanyMemory {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  category?: string;
  tags?: string[];
  visibility: 'all' | 'managers' | 'admins';
  created_at: string;
  updated_at: string;
}

export interface MemoryLayer {
  personal: PersonalMemory[];
  team: TeamMemory[];
  company: CompanyMemory[];
}

export type LayerType = 'personal' | 'team' | 'company';

export interface MemoryMetadata {
  category?: string;
  tags?: string[];
  department?: string;
  project_id?: string;
  visibility?: 'all' | 'managers' | 'admins';
  author_name?: string;
}

export interface MemoryStats {
  personal: number;
  team: number;
  company: number;
  total: number;
}

/* ── Recall ─────────────────────────────────────────────────────────────── */

export async function recallMemories(
  userId: string,
  query: string,
  layers: LayerType[],
  options?: { department?: string; project_id?: string; limit?: number }
): Promise<MemoryLayer> {
  const limit = options?.limit ?? 50;
  const result: MemoryLayer = { personal: [], team: [], company: [] };

  const searches: Promise<void>[] = [];

  // Personal layer — filtered to current user only
  if (layers.includes('personal')) {
    searches.push(
      (async () => {
        let q = supabase
          .from('memories')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (query) {
          q = q.ilike('content', `%${query}%`);
        }

        const { data } = await q;
        result.personal = (data || []) as PersonalMemory[];
      })()
    );
  }

  // Team layer — filtered by department or project
  if (layers.includes('team')) {
    searches.push(
      (async () => {
        let q = supabase
          .from('business_team_memories')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (options?.department) {
          q = q.eq('department', options.department);
        }
        if (options?.project_id) {
          q = q.eq('project_id', options.project_id);
        }
        if (query) {
          q = q.ilike('content', `%${query}%`);
        }

        const { data } = await q;
        result.team = (data || []) as TeamMemory[];
      })()
    );
  }

  // Company layer — all authenticated users can read
  if (layers.includes('company')) {
    searches.push(
      (async () => {
        let q = supabase
          .from('business_company_memories')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (query) {
          q = q.ilike('content', `%${query}%`);
        }

        const { data } = await q;
        result.company = (data || []) as CompanyMemory[];
      })()
    );
  }

  await Promise.all(searches);
  return result;
}

/* ── Save ───────────────────────────────────────────────────────────────── */

export async function saveMemory(
  userId: string,
  content: string,
  layer: LayerType,
  metadata?: MemoryMetadata
): Promise<{ success: boolean; error?: string }> {
  try {
    if (layer === 'personal') {
      const { error } = await supabase.from('memories').insert({
        user_id: userId,
        content,
        category: metadata?.category || 'general',
        tags: metadata?.tags || [],
      });
      if (error) throw error;
    }

    if (layer === 'team') {
      if (!metadata?.department && !metadata?.project_id) {
        return { success: false, error: 'Team memories require a department or project_id' };
      }
      const { error } = await supabase.from('business_team_memories').insert({
        department: metadata?.department || 'general',
        project_id: metadata?.project_id || null,
        content,
        author_id: userId,
        author_name: metadata?.author_name || 'Unknown',
        category: metadata?.category || 'general',
        tags: metadata?.tags || [],
      });
      if (error) throw error;
    }

    if (layer === 'company') {
      const { error } = await supabase.from('business_company_memories').insert({
        content,
        author_id: userId,
        author_name: metadata?.author_name || 'Unknown',
        category: metadata?.category || 'general',
        tags: metadata?.tags || [],
        visibility: metadata?.visibility || 'all',
      });
      if (error) throw error;
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save memory' };
  }
}

/* ── Delete ──────────────────────────────────────────────────────────────── */

export async function deleteMemory(
  userId: string,
  memoryId: string,
  layer: LayerType
): Promise<{ success: boolean; error?: string }> {
  try {
    if (layer === 'personal') {
      const { error } = await supabase
        .from('memories')
        .delete()
        .eq('id', memoryId)
        .eq('user_id', userId);
      if (error) throw error;
    }

    if (layer === 'team') {
      const { error } = await supabase
        .from('business_team_memories')
        .delete()
        .eq('id', memoryId);
      if (error) throw error;
    }

    if (layer === 'company') {
      const { error } = await supabase
        .from('business_company_memories')
        .delete()
        .eq('id', memoryId);
      if (error) throw error;
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete memory' };
  }
}

/* ── Stats ──────────────────────────────────────────────────────────────── */

export async function getMemoryStats(userId: string): Promise<MemoryStats> {
  const [personal, team, company] = await Promise.all([
    supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('business_team_memories').select('id', { count: 'exact', head: true }),
    supabase.from('business_company_memories').select('id', { count: 'exact', head: true }),
  ]);

  const p = personal.count ?? 0;
  const t = team.count ?? 0;
  const c = company.count ?? 0;

  return {
    personal: p,
    team: t,
    company: c,
    total: p + t + c,
  };
}
