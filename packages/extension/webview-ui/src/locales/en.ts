/** Webview English strings — subset of the full locale used by UI components. */
export const enStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Ask anything about your code.',

  // Input Area
  'input.placeholder.code': 'What do you want to build?',
  'input.placeholder.plan': 'Describe what you want to plan...',
  'input.placeholder.chat': 'Ask a question or start a discussion...',
  'input.placeholder.disabled': 'Configure a provider to start...',
  'input.mode.code': 'Code',
  'input.mode.plan': 'Plan',
  'input.mode.chat': 'Chat',
  'input.send': 'Send (Enter)',
  'input.send_aria': 'Send message',
  'input.stop': 'Stop',
  'input.stop_aria': 'Stop Ava',
  'input.attach': 'Attach image',
  'input.attach_image': 'Attach image',
  'input.drop_image': 'Drop image here',
  'input.compressing': 'Compressing...',
  'input.compress_usage': 'Context usage \u2014 click to compress',
  'input.compress_click': 'Click to compress context',

  // Header
  'header.history': 'Chat History',
  'header.settings': 'Settings',
  'header.new_chat': 'New Chat',

  // Model Selector
  'model.no_providers': 'No providers configured.',
  'model.open_settings': 'Open Settings',
  'model.vision': 'vision',
  'model.vision_title': 'This model supports image/vision input',
  'model.switched': 'Switched to {model}',

  // Thinking Indicator
  'thinking.0': 'Ava is thinking...',
  'thinking.1': 'Analyzing your code...',
  'thinking.2': 'Considering approaches...',
  'thinking.3': 'Crafting a response...',

  // Suggestions
  'suggestion.explain': 'Explain this codebase',
  'suggestion.explain_prompt': 'Give me a high-level overview of this project structure and architecture.',
  'suggestion.bug': 'Find a bug',
  'suggestion.bug_prompt': 'Help me find and fix bugs in the current file.',
  'suggestion.test': 'Write tests',
  'suggestion.test_prompt': 'Write comprehensive tests for the main module.',
  'suggestion.refactor': 'Refactor code',
  'suggestion.refactor_prompt': 'Suggest refactoring improvements for the current file.',

  // Error Labels
  'error.auth': 'Authentication',
  'error.credits': 'Billing',
  'error.forbidden': 'Access Denied',
  'error.rate_limit': 'Rate Limited',
  'error.model_not_found': 'Model Error',
  'error.bad_request': 'Bad Request',
  'error.server_error': 'Server Error',
  'error.timeout': 'Timeout',
  'error.stream_stall': 'Stream Stalled',
  'error.network': 'Network Error',
  'error.setup': 'Setup Required',
  'error.busy': 'Busy',
  'error.iterations_exceeded': 'Iteration Limit',
  'error.context_truncated': 'Context Truncated',
  'error.provider_error': 'Provider Error',
  'error.unknown': 'Error',
  'error.continue': 'Continue',

  // Tool UI
  'tool.allow': 'Allow',
  'tool.always_allow': 'Always Allow',
  'tool.allow_all': 'Allow All',
  'tool.deny': 'Deny',
  'tool.allow_prompt': 'Allow {tool}?',
  'tool.arguments': 'Arguments',
  'tool.output': 'Output',
  'tool.error': 'Error',
  'tool.truncated': '... (truncated)',
  'tool.read': 'Read {file}',
  'tool.write': 'Write {file}',
  'tool.edit': 'Edit {file}',
  'tool.find_files': 'Find files: {pattern}',
  'tool.search': 'Search: {pattern}',
  'tool.run': 'Run: {command}',
  'tool.list_dir': 'List {path}',
  'tool.web_search': 'Search: {query}',
  'tool.ask_user': 'Question for user',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Chat History',
  'history.new_chat': '+ New Chat',
  'history.close': 'Close',
  'history.search': 'Search conversations...',
  'history.empty': 'No saved conversations yet.',
  'history.no_match': 'No matching conversations.',
  'history.delete_confirm': 'Delete?',
  'history.rename_hint': 'Double-click to rename',
  'history.pin': 'Pin',
  'history.unpin': 'Unpin',
  'history.export_md': 'Export as Markdown',
  'history.pinned': 'Pinned',
  'history.just_now': 'just now',
  'history.minutes_ago': '{n}m ago',
  'history.hours_ago': '{n}h ago',
  'history.days_ago': '{n}d ago',

  // Ask User Card
  'ask.question': 'Question',
  'ask.fallback': 'Ava has a question',
  'ask.placeholder': 'Type your response...',
  'ask.submit': 'Submit',
  'ask.skip': 'Skip',
  'ask.skipped': 'Skipped',

  // Plan Card
  'plan.unavailable': 'Plan data unavailable',
  'plan.prefix': 'Plan: {title}',
  'plan.approved': 'Approved',
  'plan.rejected': 'Rejected',
  'plan.goal': 'Goal',
  'plan.steps': 'Steps',
  'plan.verification': 'Verification',
  'plan.approaches': 'Approaches',
  'plan.approve': 'Approve',
  'plan.reject': 'Reject',

  // Todo Card
  'todo.unavailable': 'Task list unavailable',
  'todo.tasks': 'Tasks',
  'todo.done': '{done}/{total} done',

  // Status Bar
  'status.in': 'in',
  'status.out': 'out',

  // Plan Card extra
  'plan.pending': 'pending',

  // App-level
  'app.model_switched': 'Switched to {model}',
  'app.context_compressed': 'Context compressed: ~{original} \u2192 ~{compressed} tokens',
  'app.continue': 'Continue where you left off.',
};
