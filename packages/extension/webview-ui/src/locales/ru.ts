/** Webview Russian (Русский) strings — subset of the full locale used by UI components. */
export const ruStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Задайте любой вопрос о вашем коде.',
  'welcome.tagline': '45 инструментов · 7 провайдеров · 2 бесплатные модели · 20 языков',

  // Welcome — Setup
  'welcome.setup_title': 'Начать — Добавить API-ключ',
  'welcome.setup_desc': 'Добавьте API-ключ провайдера, чтобы разблокировать Ava. GLM-4.5 Flash и Codestral полностью бесплатны — банковская карта не нужна.',
  'welcome.setup_cta': 'Открыть настройки',
  'welcome.ready_with': 'Готов к работе с',

  // Welcome — Sections
  'welcome.quick_start': 'Быстрый старт',
  'welcome.capabilities': 'Что умеет Ava',
  'welcome.modes': 'Режимы',
  'welcome.footer': 'Открытый исходный код · Ваши ключи, ваши данные · Конфиденциальность прежде всего',

  // Welcome — Capabilities
  'welcome.cap.files': 'Чтение и запись файлов',
  'welcome.cap.files_desc': 'Создавайте, редактируйте и управляйте любыми файлами в проекте',
  'welcome.cap.search': 'Поиск и навигация',
  'welcome.cap.search_desc': 'Находите файлы, символы и ищите по всей кодовой базе',
  'welcome.cap.terminal': 'Запуск команд',
  'welcome.cap.terminal_desc': 'Выполняйте команды оболочки и скрипты напрямую',
  'welcome.cap.web': 'Веб и API',
  'welcome.cap.web_desc': 'Поиск в интернете, HTTP-запросы, просмотр страниц',
  'welcome.cap.security': 'Аудит безопасности',
  'welcome.cap.security_desc': 'Сканирование уязвимостей и проблем безопасности',
  'welcome.cap.memory': 'Постоянная память',
  'welcome.cap.memory_desc': 'Запоминает контекст между разговорами',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Полный агент со всеми инструментами',
  'welcome.mode.plan_desc': 'Архитектура и планирование',
  'welcome.mode.chat_desc': 'Только обсуждение',
  'welcome.mode.security_desc': 'Сканирование безопасности',
  'welcome.mode.teach': 'Учёба',
  'welcome.mode.teach_desc': 'Ava становится вашим личным репетитором',

  // Input Area
  'input.placeholder.code': 'Что вы хотите создать?',
  'input.placeholder.plan': 'Опишите, что вы хотите спланировать...',
  'input.placeholder.chat': 'Задайте вопрос или начните обсуждение...',
  'input.placeholder.disabled': 'Настройте провайдера для начала работы...',
  'input.placeholder.security': 'Опишите, что нужно проверить, или нажмите Enter для полного аудита...',
  'input.placeholder.teach': 'Что вы хотите изучить?',
  'input.mode.code': 'Работа',
  'input.mode.plan': 'План',
  'input.mode.chat': 'Чат',
  'input.mode.teach': 'Учёба',
  'input.mode.brainstorm': 'Мозговой штурм',
  'input.placeholder.brainstorm': 'Что вы хотите исследовать?',
  'input.mode.security': 'Безопасность',
  'input.send': 'Отправить (Enter)',
  'input.send_aria': 'Отправить сообщение',
  'input.stop': 'Стоп',
  'input.stop_aria': 'Остановить Ava',
  'input.attach': 'Прикрепить изображение',
  'input.attach_image': 'Прикрепить изображение',
  'input.drop_image': 'Перетащите изображение сюда',
  'input.compressing': 'Сжатие...',
  'input.compress_usage': 'Использование контекста \u2014 нажмите для сжатия',
  'input.compress_click': 'Нажмите для сжатия контекста',

  // Header
  'header.history': 'История чатов',
  'header.settings': 'Настройки',
  'header.new_chat': 'Новый чат',

  // Model Selector
  'model.no_providers': 'Провайдеры не настроены.',
  'model.open_settings': 'Открыть настройки',
  'model.vision': 'vision',
  'model.vision_title': 'Эта модель поддерживает ввод изображений',
  'model.switched': 'Переключено на {model}',

  // Thinking Indicator
  'thinking.0': 'Ava думает...',
  'thinking.1': 'Анализирую ваш код...',
  'thinking.2': 'Рассматриваю подходы...',
  'thinking.3': 'Формирую ответ...',

  // Suggestions
  'suggestion.explain': 'Объясни эту кодовую базу',
  'suggestion.explain_prompt': 'Дай обзор структуры и архитектуры этого проекта.',
  'suggestion.bug': 'Найди баг',
  'suggestion.bug_prompt': 'Помоги найти и исправить баги в текущем файле.',
  'suggestion.test': 'Написать тесты',
  'suggestion.test_prompt': 'Напиши полные тесты для основного модуля.',
  'suggestion.refactor': 'Рефакторинг кода',
  'suggestion.refactor_prompt': 'Предложи улучшения рефакторинга для текущего файла.',

  // Error Labels
  'error.auth': 'Аутентификация',
  'error.credits': 'Оплата',
  'error.forbidden': 'Доступ запрещён',
  'error.rate_limit': 'Лимит запросов',
  'error.model_not_found': 'Ошибка модели',
  'error.bad_request': 'Неверный запрос',
  'error.server_error': 'Ошибка сервера',
  'error.timeout': 'Тайм-аут',
  'error.stream_stall': 'Поток завис',
  'error.network': 'Ошибка сети',
  'error.setup': 'Требуется настройка',
  'error.busy': 'Занят',
  'error.iterations_exceeded': 'Лимит итераций',
  'error.context_truncated': 'Контекст обрезан',
  'error.provider_error': 'Ошибка провайдера',
  'error.unknown': 'Ошибка',
  'error.continue': 'Продолжить',

  // Tool UI
  'tool.allow': 'Разрешить',
  'tool.always_allow': 'Всегда разрешать',
  'tool.allow_all': 'Разрешить все',
  'tool.deny': 'Запретить',
  'tool.allow_prompt': 'Разрешить {tool}?',
  'tool.arguments': 'Аргументы',
  'tool.output': 'Вывод',
  'tool.error': 'Ошибка',
  'tool.truncated': '... (обрезано)',
  'tool.read': 'Чтение {file}',
  'tool.write': 'Запись {file}',
  'tool.edit': 'Редактирование {file}',
  'tool.find_files': 'Поиск файлов: {pattern}',
  'tool.search': 'Поиск: {pattern}',
  'tool.run': 'Запуск: {command}',
  'tool.list_dir': 'Содержимое {path}',
  'tool.web_search': 'Поиск: {query}',
  'tool.ask_user': 'Вопрос пользователю',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'История чатов',
  'history.new_chat': '+ Новый чат',
  'history.close': 'Закрыть',
  'history.search': 'Поиск по чатам...',
  'history.empty': 'Сохранённых чатов пока нет.',
  'history.no_match': 'Совпадений не найдено.',
  'history.delete_confirm': 'Удалить?',
  'history.rename_hint': 'Двойной клик для переименования',
  'history.pin': 'Закрепить',
  'history.unpin': 'Открепить',
  'history.export_md': 'Экспорт в Markdown',
  'history.pinned': 'Закреплённые',
  'history.just_now': 'только что',
  'history.minutes_ago': '{n} мин. назад',
  'history.hours_ago': '{n} ч. назад',
  'history.days_ago': '{n} дн. назад',

  // Ask User Card
  'ask.question': 'Вопрос',
  'ask.fallback': 'У Ava есть вопрос',
  'ask.placeholder': 'Введите ваш ответ...',
  'ask.submit': 'Отправить',
  'ask.skip': 'Пропустить',
  'ask.skipped': 'Пропущено',

  // Plan Card
  'plan.unavailable': 'Данные плана недоступны',
  'plan.prefix': 'План: {title}',
  'plan.approved': 'Одобрено',
  'plan.rejected': 'Отклонено',
  'plan.goal': 'Цель',
  'plan.steps': 'Шаги',
  'plan.verification': 'Проверка',
  'plan.approaches': 'Подходы',
  'plan.approve': 'Одобрить',
  'plan.reject': 'Отклонить',

  // Todo Card
  'todo.unavailable': 'Список задач недоступен',
  'todo.tasks': 'Задачи',
  'todo.done': '{done}/{total} выполнено',

  // Status Bar
  'status.in': 'вход',
  'status.out': 'выход',

  // Plan Card extra
  'plan.pending': 'ожидание',

  // App-level
  'app.model_switched': 'Переключено на {model}',
  'app.context_compressed': 'Контекст сжат: ~{original} \u2192 ~{compressed} токенов',
  'app.continue': 'Продолжить с того места, где остановились.',
};
