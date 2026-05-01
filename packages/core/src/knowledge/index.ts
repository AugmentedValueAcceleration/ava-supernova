// Domain knowledge bundles. The builtin domain packs (marketing,
// finance, devops, etc.) were removed in v0.59.2 — frontier models
// already cover that ground, the auto-activated injection added
// silent token cost after the chat-tier rebalance, and end-of-turn
// telemetry showed the lift was negligible.
//
// computer_use knowledge was retired alongside the Holo3 integration.
// The desktop_* tool family handles automation differently and doesn't
// need a curated knowledge pack — its element-detection layer
// (OmniParser) returns the visible UI tree directly.
//
// This file is intentionally empty — kept so existing imports of
// `@ava/core/knowledge` don't break, but exports nothing today.
export {};
