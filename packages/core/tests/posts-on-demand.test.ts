// Posts on demand (8 Nov 2026).
//
// "We never plan out anything, it's all done on demand." Without a day plan,
// the post itself has to carry what the plan used to: whether it was one of
// the every-day posts, which feature it promoted, his Landed mark and her
// verdict.

import { describe, it, expect } from 'vitest';
import { WritePostTool } from '../src/tools/write-post.js';
import { CheckPostsTool } from '../src/tools/check-posts.js';
import { ReviewPostTool } from '../src/tools/review-post.js';
import { ProposeBriefTool } from '../src/tools/propose-brief.js';
import { modeAllowedTools } from '../src/agent/agent.js';
import type { ExistingPost, PostStore, SocialPostInput, PostBrief } from '../src/social/index.js';

const ctx = (store: Partial<PostStore>, extra: Record<string, unknown> = {}) =>
  ({ cwd: '.', sharedState: { postStore: { write: async () => ({ id: 'p1' }), ...store }, ...extra } }) as never;

describe('write_post records the markers', () => {
  it('passes daily and feature through to the store', async () => {
    let got: SocialPostInput | null = null;
    const r = await new WritePostTool().execute(
      { platform: 'discord', content: 'Come and build with us in the Discord.', daily: ' discord ', feature: '' },
      ctx({ write: async (p) => { got = p; return { id: 'p1' }; } }),
    );
    expect(r.success).toBe(true);
    expect(got!.daily).toBe('discord');
    expect(got!.feature).toBeNull();
  });
});

describe('check_posts shows what the room is run on', () => {
  const posts: ExistingPost[] = [
    { id: 'a', platform: 'tweet', subject: 'join the discord', createdAt: '2026-11-08T09:00:00Z', kind: 'text', daily: 'discord', landed: true, verdict: 'the invite line was too soft' },
    { id: 'b', platform: 'bluesky', subject: 'talk mode', createdAt: '2026-11-08T10:00:00Z', kind: 'text', feature: 'Talk mode' },
  ];

  it('lists markers, his mark, her verdict and the ids', async () => {
    const r = await new CheckPostsTool().execute({}, ctx({ list: async () => posts }));
    expect(r.output).toMatch(/every day: discord/);
    expect(r.output).toMatch(/feature: Talk mode/);
    expect(r.output).toMatch(/he marked it LANDED/);
    expect(r.output).toMatch(/your verdict: the invite line was too soft/);
    expect(r.output).toMatch(/id: a/);
    expect(r.output).toMatch(/Every-day posts in this window: discord\./);
    expect(r.output).toMatch(/Features promoted in this window: Talk mode\./);
  });

  it('says none when no every-day post went out', async () => {
    const r = await new CheckPostsTool().execute({}, ctx({ list: async () => [posts[1]] }));
    expect(r.output).toMatch(/Every-day posts in this window: none\./);
  });
});

describe('review_post', () => {
  it('records her verdict on the posts named', async () => {
    let seen: [string[], string] | null = null;
    const r = await new ReviewPostTool().execute(
      { ids: ['a', ' b '], verdict: 'Strong hook, weak close.' },
      ctx({ review: async (ids, v) => { seen = [ids, v]; return 2; } }),
    );
    expect(r.success).toBe(true);
    expect(seen).toEqual([['a', 'b'], 'Strong hook, weak close.']);
  });

  it('refuses an empty verdict', async () => {
    const r = await new ReviewPostTool().execute({ ids: ['a'], verdict: '  ' }, ctx({ review: async () => 1 }));
    expect(r.success).toBe(false);
  });

  it('says so when the host cannot record one', async () => {
    const r = await new ReviewPostTool().execute({ ids: ['a'], verdict: 'fine' }, ctx({}));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/cannot record a verdict/);
  });

  it('reports unknown ids rather than claiming success', async () => {
    const r = await new ReviewPostTool().execute({ ids: ['zz'], verdict: 'fine' }, ctx({ review: async () => 0 }));
    expect(r.success).toBe(false);
  });
});

describe('the brief carries the markers to the writing turn', () => {
  it('keeps daily and feature on the brief', async () => {
    let got: PostBrief | null = null;
    const r = await new ProposeBriefTool().execute({
      subject: 'star the repo', argues: 'a', audience: 'b', angle: 'c', form: 'd', mustLand: 'e', reasoning: 'f', daily: 'star_repo',
    }, { cwd: '.', sharedState: { briefStore: { propose: async (b: PostBrief) => { got = b; } } } } as never);
    expect(r.success).toBe(true);
    expect(got!.daily).toBe('star_repo');
    expect(got!.feature).toBeUndefined();
  });
});

describe('the room no longer plans the day', () => {
  it('offers review_post and none of the planning tools', () => {
    const social = modeAllowedTools('social')!;
    expect(social.has('review_post')).toBe(true);
    expect(social.has('check_posts')).toBe(true);
    for (const gone of ['suggest_beats', 'day_plan_read', 'day_plan_write', 'day_plan_item_status', 'day_plan_review']) {
      expect(social.has(gone)).toBe(false);
    }
  });
});
