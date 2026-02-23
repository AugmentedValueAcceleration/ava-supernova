/** Webview Simplified Chinese (zh-CN) strings */
export const zhCNStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': '关于你的代码，随便问。',

  // Input Area
  'input.placeholder.code': '你想构建什么？',
  'input.placeholder.plan': '描述你想要规划的内容...',
  'input.placeholder.chat': '提一个问题或开始讨论...',
  'input.placeholder.disabled': '请先配置服务商...',
  'input.mode.code': '编码',
  'input.mode.plan': '规划',
  'input.mode.chat': '聊天',
  'input.send': '发送 (Enter)',
  'input.send_aria': '发送消息',
  'input.stop': '停止',
  'input.stop_aria': '停止 Ava',
  'input.attach': '附加图片',
  'input.attach_image': '附加图片',
  'input.drop_image': '将图片拖放到此处',
  'input.compressing': '压缩中...',
  'input.compress_usage': '上下文用量 \u2014 点击压缩',
  'input.compress_click': '点击压缩上下文',

  // Header
  'header.history': '聊天记录',
  'header.settings': '设置',
  'header.new_chat': '新对话',

  // Model Selector
  'model.no_providers': '未配置服务商。',
  'model.open_settings': '打开设置',
  'model.vision': '视觉',
  'model.vision_title': '该模型支持图片/视觉输入',
  'model.switched': '已切换至 {model}',

  // Thinking Indicator
  'thinking.0': 'Ava 正在思考...',
  'thinking.1': '正在分析你的代码...',
  'thinking.2': '正在考虑方案...',
  'thinking.3': '正在组织回复...',

  // Suggestions
  'suggestion.explain': '解释这个代码库',
  'suggestion.explain_prompt': '请给我一个关于项目结构和架构的概览。',
  'suggestion.bug': '查找 Bug',
  'suggestion.bug_prompt': '帮我查找并修复当前文件中的 Bug。',
  'suggestion.test': '编写测试',
  'suggestion.test_prompt': '为主模块编写全面的测试。',
  'suggestion.refactor': '重构代码',
  'suggestion.refactor_prompt': '为当前文件提供重构改进建议。',

  // Error Labels
  'error.auth': '身份验证',
  'error.credits': '计费',
  'error.forbidden': '拒绝访问',
  'error.rate_limit': '请求过于频繁',
  'error.model_not_found': '模型错误',
  'error.bad_request': '请求错误',
  'error.server_error': '服务器错误',
  'error.timeout': '超时',
  'error.stream_stall': '流式响应停滞',
  'error.network': '网络错误',
  'error.setup': '需要配置',
  'error.busy': '忙碌中',
  'error.iterations_exceeded': '迭代次数限制',
  'error.context_truncated': '上下文已截断',
  'error.provider_error': '服务商错误',
  'error.unknown': '错误',
  'error.continue': '继续',

  // Tool UI
  'tool.allow': '允许',
  'tool.always_allow': '始终允许',
  'tool.allow_all': '全部允许',
  'tool.deny': '拒绝',
  'tool.allow_prompt': '允许 {tool}？',
  'tool.arguments': '参数',
  'tool.output': '输出',
  'tool.error': '错误',
  'tool.truncated': '...（已截断）',
  'tool.read': '读取 {file}',
  'tool.write': '写入 {file}',
  'tool.edit': '编辑 {file}',
  'tool.find_files': '查找文件：{pattern}',
  'tool.search': '搜索：{pattern}',
  'tool.run': '运行：{command}',
  'tool.list_dir': '列出 {path}',
  'tool.web_search': '搜索：{query}',
  'tool.ask_user': '向用户提问',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': '聊天记录',
  'history.new_chat': '+ 新对话',
  'history.close': '关闭',
  'history.search': '搜索对话...',
  'history.empty': '暂无已保存的对话。',
  'history.no_match': '未找到匹配的对话。',
  'history.delete_confirm': '确认删除？',
  'history.rename_hint': '双击重命名',
  'history.pin': '置顶',
  'history.unpin': '取消置顶',
  'history.export_md': '导出为 Markdown',
  'history.pinned': '已置顶',
  'history.just_now': '刚刚',
  'history.minutes_ago': '{n}分钟前',
  'history.hours_ago': '{n}小时前',
  'history.days_ago': '{n}天前',

  // Ask User Card
  'ask.question': '问题',
  'ask.fallback': 'Ava 有一个问题',
  'ask.placeholder': '输入你的回复...',
  'ask.submit': '提交',
  'ask.skip': '跳过',
  'ask.skipped': '已跳过',

  // Plan Card
  'plan.unavailable': '计划数据不可用',
  'plan.prefix': '计划：{title}',
  'plan.approved': '已批准',
  'plan.rejected': '已拒绝',
  'plan.goal': '目标',
  'plan.steps': '步骤',
  'plan.verification': '验证',
  'plan.approaches': '方案',
  'plan.approve': '批准',
  'plan.reject': '拒绝',

  // Todo Card
  'todo.unavailable': '任务列表不可用',
  'todo.tasks': '任务',
  'todo.done': '{done}/{total} 已完成',

  // Status Bar
  'status.in': '输入',
  'status.out': '输出',

  // Plan Card extra
  'plan.pending': '待处理',

  // App-level
  'app.model_switched': '已切换至 {model}',
  'app.context_compressed': '上下文已压缩：~{original} \u2192 ~{compressed} tokens',
  'app.continue': '从上次中断处继续。',
};
