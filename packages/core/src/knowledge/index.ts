// Domain knowledge bundles. The builtin domain packs (marketing,
// finance, devops, etc.) were removed in v0.59.2 — frontier models
// already cover that ground, the auto-activated injection added
// silent token cost after the chat-tier rebalance, and end-of-turn
// telemetry showed the lift was negligible.
//
// What remains is the desktop-automation knowledge that ships with
// computer_use — small, app-specific visual + keyboard-shortcut
// patterns the IDE Actor uses to navigate Windows 11 / Notepad /
// browser / File Explorer. That is genuine value the model doesn't
// have from training, and it loads only when computer_use is active.
export * from './computer-use-knowledge.js';
