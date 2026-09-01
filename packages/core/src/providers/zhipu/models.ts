import type { ModelDefinition } from '../../core/types.js';

export const ZHIPU_MODELS: ModelDefinition[] = [
  {
    // GLM-5.3 (z.ai, 14 August 2026) - the same base as GLM-5.2 with more
    // post-training, at identical pricing. Replaces 5.2, which replaced
    // 5.1/5/4.7; the API id is the bare `glm-5.3` and the 1M window is
    // built in.
    //
    // TEXT ONLY, and this is the second GLM release running where the
    // aggregator sites said otherwise. 5.2 shipped here as
    // `supportsVision: true` until 2026-07-17, which sent images straight
    // through the attach gate into:
    //   {"error":{"code":"1210","message":"messages.content.type 参数非法,
    //    取值范围 ['text']"}}
    // z.ai's own docs for 5.3 say it "currently supports text-only inputs"
    // (checked 2026-09-01), so the flag below is set from the vendor rather
    // than from anyone summarising the vendor.
    //
    // The GLM naming trap still holds - a higher number does not mean it can
    // see - but it now has one exception, immediately below.
    id: 'glm-5.3',
    name: 'GLM-5.3',
    provider: 'zhipu',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    desktopCapable: true,
    pricing: { inputPerMillion: 1.40, outputPerMillion: 4.40 },
  },
  {
    // GLM-5.3-Flash (z.ai, August 2026) - 320B-A18B MoE, open weights, and
    // the first GLM in our catalogue that genuinely reads images: z.ai lists
    // its input modalities as "Video / Image / Text / File", output text.
    // Checked at docs.z.ai on 2026-09-01, not inferred from the family.
    //
    // "Flash" here is a price tier, not a size tier. It is a reasoning model
    // and it keeps its thinking on - see ZHIPU_REASONING_FLASH in
    // request-shaping/params.ts for why the substring rule does not catch it.
    //
    // Priced at list. There is a launch promotion running to 2026-09-09 at
    // $0.075/M input; putting a promotional rate in the catalogue would leave
    // every receipt wrong the day it lapses.
    id: 'glm-5.3-flash',
    name: 'GLM-5.3 Flash',
    provider: 'zhipu',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.50 },
  },
];
