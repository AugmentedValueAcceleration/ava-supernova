# Privacy Policy — Ava | Supernova

**Last updated:** 7 April 2026

Ava | Supernova is an open-source AI coding agent. This policy explains what data the extension collects, how it is used, and where it is sent.

## What Data is Collected

### Code Context
When you interact with Ava, the extension sends **portions of your code** (open files, selected text, terminal output) to AI model providers for processing. This is the core functionality — Ava needs to see your code to help you.

### Conversation History
Messages you send to Ava and her responses are stored **locally on your machine** in VS Code's workspace storage. They are not uploaded to any server unless you explicitly connect a platform account for cross-device sync.

### Memory
Ava's memory system stores your preferences, project context, and workflow patterns **locally** in `~/.ava/memory/`. If you connect a platform account, memories can optionally sync to the platform for cross-device access. You can delete all memories at any time from Settings.

### Usage Metrics
If you connect a platform account (optional), basic usage metrics are recorded: token counts, model usage, and message counts. This is used for billing and rate limiting. No code content is stored in usage logs.

### No Screen Capture
The VS Code extension does **not** capture screenshots, record your screen, or access any visual content outside of the VS Code editor. Screen capture functionality is excluded from the extension entirely.

### Shared Learning (Opt-In)

The extension includes a **Contribute Shared Learning** setting (disabled by default). When you choose to enable it, the following anonymised feedback data is shared when you rate messages:

- Your rating (thumbs up/down) and selected reason (e.g., "Wrong", "Incomplete")
- The model and mode used
- Timestamp and message ID

**No code, no conversation content, and no personal data is shared.** This data is used solely to improve Ava's response quality for all users. You can disable this setting at any time in VS Code Settings. When disabled, all feedback is stored locally only.

## Where Data is Sent

### AI Model Providers
Your code context and messages are sent to whichever AI model provider you choose:

- **Platform models** (default): Routed through `https://ava-supernova.com/api` to Qwen (Alibaba Cloud), MiniMax, or other providers based on your selected model. Data passes through our API for routing only — we do not store conversation content.
- **BYOK (Bring Your Own Key)**: Sent directly from your machine to the provider's API (e.g., Anthropic, DeepSeek, Mistral). No data passes through our servers.

### No Third-Party Analytics
We do not use Google Analytics, Mixpanel, Segment, or any third-party analytics service. We do not sell or share your data with anyone. The only data that leaves your machine (beyond AI provider requests) is opt-in feedback and platform usage metrics as described above.

## Data Storage

| Data | Location | Sync |
|------|----------|------|
| Conversations | Local (VS Code storage) | Never uploaded |
| Memory | Local (`~/.ava/memory/`) | Optional platform sync |
| Settings | Local (VS Code settings) | Optional platform sync |
| API keys | Local (VS Code secure storage) | Never uploaded |
| Usage metrics | Platform (if connected) | Automatic |
| Feedback ratings | Local (`~/.ava/feedback.json`) | Opt-in via Shared Learning |

## Your Rights

- **Delete memory**: Settings > Clear Memory (deletes all local memory)
- **Delete account**: Settings > Danger Zone > Delete Account (removes all platform data)
- **Disconnect**: Remove your platform key to use Ava in BYOK-only mode with zero platform communication
- **Inspect**: All code is open source at https://github.com/AugmentedValueAcceleration/ava-supernova

## Contact

For privacy questions or data deletion requests:
- Email: stewart@augmentedvalueacceleration.com
- GitHub: https://github.com/AugmentedValueAcceleration/ava-supernova/issues

## Changes

We will update this policy as features evolve. Material changes will be noted in release notes.

---

Ava | Supernova is built by Augmented Value Acceleration Ltd, United Kingdom.
