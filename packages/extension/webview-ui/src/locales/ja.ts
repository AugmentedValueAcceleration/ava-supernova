/** Webview Japanese (ja) strings */
export const jaStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'コードについて何でも聞いてください。',

  // Input Area
  'input.placeholder.code': '何を作りたいですか？',
  'input.placeholder.plan': '計画したい内容を記述してください...',
  'input.placeholder.chat': '質問をするか、議論を始めましょう...',
  'input.placeholder.disabled': 'まずプロバイダーを設定してください...',
  'input.placeholder.security': 'スキャン対象を記述するか、Enter を押してフルオーディットを実行...',
  'input.mode.code': 'コード',
  'input.mode.plan': '計画',
  'input.mode.chat': 'チャット',
  'input.mode.security': 'セキュリティ',
  'input.send': '送信 (Enter)',
  'input.send_aria': 'メッセージを送信',
  'input.stop': '停止',
  'input.stop_aria': 'Ava を停止',
  'input.attach': '画像を添付',
  'input.attach_image': '画像を添付',
  'input.drop_image': 'ここに画像をドロップ',
  'input.compressing': '圧縮中...',
  'input.compress_usage': 'コンテキスト使用量 \u2014 クリックで圧縮',
  'input.compress_click': 'クリックしてコンテキストを圧縮',

  // Header
  'header.history': 'チャット履歴',
  'header.settings': '設定',
  'header.new_chat': '新しいチャット',

  // Model Selector
  'model.no_providers': 'プロバイダーが設定されていません。',
  'model.open_settings': '設定を開く',
  'model.vision': 'ビジョン',
  'model.vision_title': 'このモデルは画像/ビジョン入力に対応しています',
  'model.switched': '{model} に切り替えました',

  // Thinking Indicator
  'thinking.0': 'Ava が考えています...',
  'thinking.1': 'コードを分析しています...',
  'thinking.2': 'アプローチを検討しています...',
  'thinking.3': '回答を作成しています...',

  // Suggestions
  'suggestion.explain': 'コードベースを解説',
  'suggestion.explain_prompt': 'このプロジェクトの構成とアーキテクチャの概要を教えてください。',
  'suggestion.bug': 'バグを探す',
  'suggestion.bug_prompt': '現在のファイルのバグを見つけて修正してください。',
  'suggestion.test': 'テストを書く',
  'suggestion.test_prompt': 'メインモジュールの包括的なテストを書いてください。',
  'suggestion.refactor': 'コードをリファクタリング',
  'suggestion.refactor_prompt': '現在のファイルのリファクタリング改善案を提案してください。',

  // Error Labels
  'error.auth': '認証',
  'error.credits': '課金',
  'error.forbidden': 'アクセス拒否',
  'error.rate_limit': 'レート制限',
  'error.model_not_found': 'モデルエラー',
  'error.bad_request': '不正なリクエスト',
  'error.server_error': 'サーバーエラー',
  'error.timeout': 'タイムアウト',
  'error.stream_stall': 'ストリーム停止',
  'error.network': 'ネットワークエラー',
  'error.setup': 'セットアップが必要',
  'error.busy': '処理中',
  'error.iterations_exceeded': 'イテレーション上限',
  'error.context_truncated': 'コンテキスト切り詰め',
  'error.provider_error': 'プロバイダーエラー',
  'error.unknown': 'エラー',
  'error.continue': '続行',

  // Tool UI
  'tool.allow': '許可',
  'tool.always_allow': '常に許可',
  'tool.allow_all': 'すべて許可',
  'tool.deny': '拒否',
  'tool.allow_prompt': '{tool} を許可しますか？',
  'tool.arguments': '引数',
  'tool.output': '出力',
  'tool.error': 'エラー',
  'tool.truncated': '...（省略）',
  'tool.read': '{file} を読み取り',
  'tool.write': '{file} に書き込み',
  'tool.edit': '{file} を編集',
  'tool.find_files': 'ファイル検索：{pattern}',
  'tool.search': '検索：{pattern}',
  'tool.run': '実行：{command}',
  'tool.list_dir': '{path} を一覧表示',
  'tool.web_search': '検索：{query}',
  'tool.ask_user': 'ユーザーへの質問',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'チャット履歴',
  'history.new_chat': '+ 新しいチャット',
  'history.close': '閉じる',
  'history.search': '会話を検索...',
  'history.empty': '保存された会話はまだありません。',
  'history.no_match': '一致する会話が見つかりません。',
  'history.delete_confirm': '削除しますか？',
  'history.rename_hint': 'ダブルクリックで名前を変更',
  'history.pin': 'ピン留め',
  'history.unpin': 'ピン留め解除',
  'history.export_md': 'Markdown として書き出し',
  'history.pinned': 'ピン留め',
  'history.just_now': 'たった今',
  'history.minutes_ago': '{n}分前',
  'history.hours_ago': '{n}時間前',
  'history.days_ago': '{n}日前',

  // Ask User Card
  'ask.question': '質問',
  'ask.fallback': 'Ava から質問があります',
  'ask.placeholder': '回答を入力してください...',
  'ask.submit': '送信',
  'ask.skip': 'スキップ',
  'ask.skipped': 'スキップしました',

  // Plan Card
  'plan.unavailable': 'プランデータがありません',
  'plan.prefix': 'プラン：{title}',
  'plan.approved': '承認済み',
  'plan.rejected': '却下済み',
  'plan.goal': '目標',
  'plan.steps': 'ステップ',
  'plan.verification': '検証',
  'plan.approaches': 'アプローチ',
  'plan.approve': '承認',
  'plan.reject': '却下',

  // Todo Card
  'todo.unavailable': 'タスクリストがありません',
  'todo.tasks': 'タスク',
  'todo.done': '{done}/{total} 完了',

  // Status Bar
  'status.in': '入力',
  'status.out': '出力',

  // Plan Card extra
  'plan.pending': '保留中',

  // App-level
  'app.model_switched': '{model} に切り替えました',
  'app.context_compressed': 'コンテキストを圧縮しました：~{original} \u2192 ~{compressed} tokens',
  'app.continue': '中断したところから続けます。',
};
