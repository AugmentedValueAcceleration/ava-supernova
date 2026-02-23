/** Ukrainian (Українська) strings — webview subset for UI components. */
export const ukStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Запитайте будь-що про ваш код.',

  // Input Area
  'input.placeholder.code': 'Що ви хочете створити?',
  'input.placeholder.plan': 'Опишіть, що ви хочете спланувати...',
  'input.placeholder.chat': 'Задайте питання або почніть обговорення...',
  'input.placeholder.disabled': 'Налаштуйте провайдера, щоб почати...',
  'input.mode.code': 'Код',
  'input.mode.plan': 'План',
  'input.mode.chat': 'Чат',
  'input.send': 'Надіслати (Enter)',
  'input.send_aria': 'Надіслати повідомлення',
  'input.stop': 'Зупинити',
  'input.stop_aria': 'Зупинити Avu',
  'input.attach': 'Прикріпити зображення',
  'input.attach_image': 'Прикріпити зображення',
  'input.drop_image': 'Перетягніть зображення сюди',
  'input.compressing': 'Стиснення...',
  'input.compress_usage': 'Використання контексту \u2014 натисніть, щоб стиснути',
  'input.compress_click': 'Натисніть, щоб стиснути контекст',

  // Header
  'header.history': 'Історія чату',
  'header.settings': 'Налаштування',
  'header.new_chat': 'Новий чат',

  // Model Selector
  'model.no_providers': 'Немає налаштованих провайдерів.',
  'model.open_settings': 'Відкрити налаштування',
  'model.vision': 'зір',
  'model.vision_title': 'Ця модель підтримує введення зображень',
  'model.switched': 'Переключено на {model}',

  // Thinking Indicator
  'thinking.0': 'Ava думає...',
  'thinking.1': 'Аналізую ваш код...',
  'thinking.2': 'Розглядаю підходи...',
  'thinking.3': 'Формую відповідь...',

  // Suggestions
  'suggestion.explain': 'Поясни цей проєкт',
  'suggestion.explain_prompt': 'Дай загальний огляд структури та архітектури цього проєкту.',
  'suggestion.bug': 'Знайди помилку',
  'suggestion.bug_prompt': 'Допоможи мені знайти та виправити помилки в поточному файлі.',
  'suggestion.test': 'Напиши тести',
  'suggestion.test_prompt': 'Напиши комплексні тести для головного модуля.',
  'suggestion.refactor': 'Рефакторинг коду',
  'suggestion.refactor_prompt': 'Запропонуй покращення рефакторингу для поточного файлу.',

  // Error Labels
  'error.auth': 'Автентифікація',
  'error.credits': 'Білінг',
  'error.forbidden': 'Доступ заборонено',
  'error.rate_limit': 'Ліміт запитів',
  'error.model_not_found': 'Помилка моделі',
  'error.bad_request': 'Некоректний запит',
  'error.server_error': 'Помилка сервера',
  'error.timeout': 'Тайм-аут',
  'error.stream_stall': 'Потік зупинився',
  'error.network': 'Помилка мережі',
  'error.setup': 'Потрібне налаштування',
  'error.busy': 'Зайнята',
  'error.iterations_exceeded': 'Ліміт ітерацій',
  'error.context_truncated': 'Контекст обрізано',
  'error.provider_error': 'Помилка провайдера',
  'error.unknown': 'Помилка',
  'error.continue': 'Продовжити',

  // Tool UI
  'tool.allow': 'Дозволити',
  'tool.always_allow': 'Завжди дозволяти',
  'tool.allow_all': 'Дозволити все',
  'tool.deny': 'Відхилити',
  'tool.allow_prompt': 'Дозволити {tool}?',
  'tool.arguments': 'Аргументи',
  'tool.output': 'Результат',
  'tool.error': 'Помилка',
  'tool.truncated': '... (обрізано)',
  'tool.read': 'Читання {file}',
  'tool.write': 'Запис {file}',
  'tool.edit': 'Редагування {file}',
  'tool.find_files': 'Пошук файлів: {pattern}',
  'tool.search': 'Пошук: {pattern}',
  'tool.run': 'Виконати: {command}',
  'tool.list_dir': 'Список {path}',
  'tool.web_search': 'Пошук: {query}',
  'tool.ask_user': 'Питання до користувача',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Історія чату',
  'history.new_chat': '+ Новий чат',
  'history.close': 'Закрити',
  'history.search': 'Пошук розмов...',
  'history.empty': 'Збережених розмов ще немає.',
  'history.no_match': 'Немає відповідних розмов.',
  'history.delete_confirm': 'Видалити?',
  'history.rename_hint': 'Двічі клацніть, щоб перейменувати',
  'history.pin': 'Закріпити',
  'history.unpin': 'Відкріпити',
  'history.export_md': 'Експортувати як Markdown',
  'history.pinned': 'Закріплені',
  'history.just_now': 'щойно',
  'history.minutes_ago': '{n} хв тому',
  'history.hours_ago': '{n} год тому',
  'history.days_ago': '{n} дн тому',

  // Ask User Card
  'ask.question': 'Питання',
  'ask.fallback': 'Ava має питання',
  'ask.placeholder': 'Введіть вашу відповідь...',
  'ask.submit': 'Надіслати',
  'ask.skip': 'Пропустити',
  'ask.skipped': 'Пропущено',

  // Plan Card
  'plan.unavailable': 'Дані плану недоступні',
  'plan.prefix': 'План: {title}',
  'plan.approved': 'Затверджено',
  'plan.rejected': 'Відхилено',
  'plan.goal': 'Мета',
  'plan.steps': 'Кроки',
  'plan.verification': 'Перевірка',
  'plan.approaches': 'Підходи',
  'plan.approve': 'Затвердити',
  'plan.reject': 'Відхилити',

  // Todo Card
  'todo.unavailable': 'Список завдань недоступний',
  'todo.tasks': 'Завдання',
  'todo.done': '{done}/{total} виконано',

  // Status Bar
  'status.in': 'вхід',
  'status.out': 'вихід',

  // Plan Card extra
  'plan.pending': 'очікує',

  // App-level
  'app.model_switched': 'Переключено на {model}',
  'app.context_compressed': 'Контекст стиснуто: ~{original} \u2192 ~{compressed} токенів',
  'app.continue': 'Продовжити з того місця, де зупинились.',
};
