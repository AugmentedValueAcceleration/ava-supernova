/** Webview Arabic (العربية) strings — subset of the full locale used by UI components. */
export const arStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'اسأل أي شيء عن الكود الخاص بك.',
  'welcome.tagline': '24 أداة · 7 مزوّدين · 2 نموذج مجاني · 20 لغة',

  // Welcome — Setup
  'welcome.setup_title': 'ابدأ — أضف مفتاح API',
  'welcome.setup_desc': 'أضف مفتاح API لمزوّد لتفعيل Ava. نموذجا GLM-4.5 Flash و Codestral مجانيان تمامًا — لا حاجة لبطاقة ائتمان.',
  'welcome.setup_cta': 'فتح الإعدادات',
  'welcome.ready_with': 'جاهز مع',

  // Welcome — Sections
  'welcome.quick_start': 'بداية سريعة',
  'welcome.capabilities': 'ما يمكن لـ Ava فعله',
  'welcome.modes': 'الأوضاع',
  'welcome.footer': 'مفتوح المصدر · مفاتيحك، بياناتك · الخصوصية أولاً',

  // Welcome — Capabilities
  'welcome.cap.files': 'قراءة وكتابة الملفات',
  'welcome.cap.files_desc': 'إنشاء وتعديل وإدارة أي ملف في مشروعك',
  'welcome.cap.search': 'البحث والتنقل',
  'welcome.cap.search_desc': 'البحث عن الملفات والرموز والنصوص عبر قاعدة الكود',
  'welcome.cap.terminal': 'تشغيل الأوامر',
  'welcome.cap.terminal_desc': 'تنفيذ أوامر وسكربتات الشل مباشرة',
  'welcome.cap.web': 'الويب والـ APIs',
  'welcome.cap.web_desc': 'البحث في الويب، وإرسال طلبات HTTP، وتصفح الصفحات',
  'welcome.cap.security': 'تدقيق الأمان',
  'welcome.cap.security_desc': 'فحص الثغرات ومشكلات الأمان',
  'welcome.cap.memory': 'ذاكرة دائمة',
  'welcome.cap.memory_desc': 'تتذكر السياق عبر المحادثات',

  // Welcome — Modes
  'welcome.mode.code_desc': 'وكيل كامل مع جميع الأدوات',
  'welcome.mode.plan_desc': 'الهندسة والتخطيط',
  'welcome.mode.chat_desc': 'نقاش فقط',
  'welcome.mode.security_desc': 'فحص الأمان',

  // Input Area
  'input.placeholder.code': 'ماذا تريد أن تبني؟',
  'input.placeholder.plan': 'صِف ما تريد التخطيط له...',
  'input.placeholder.chat': 'اطرح سؤالاً أو ابدأ نقاشاً...',
  'input.placeholder.disabled': 'قم بإعداد مزوّد للبدء...',
  'input.placeholder.security': 'صِف ما تريد فحصه، أو اضغط Enter لتدقيق كامل...',
  'input.mode.code': 'كود',
  'input.mode.plan': 'خطة',
  'input.mode.chat': 'محادثة',
  'input.mode.security': 'أمان',
  'input.send': 'إرسال (Enter)',
  'input.send_aria': 'إرسال الرسالة',
  'input.stop': 'إيقاف',
  'input.stop_aria': 'إيقاف Ava',
  'input.attach': 'إرفاق صورة',
  'input.attach_image': 'إرفاق صورة',
  'input.drop_image': 'أسقط الصورة هنا',
  'input.compressing': 'جارٍ الضغط...',
  'input.compress_usage': 'استخدام السياق \u2014 انقر للضغط',
  'input.compress_click': 'انقر لضغط السياق',

  // Header
  'header.history': 'سجل المحادثات',
  'header.settings': 'الإعدادات',
  'header.new_chat': 'محادثة جديدة',

  // Model Selector
  'model.no_providers': 'لم يتم إعداد أي مزوّد.',
  'model.open_settings': 'فتح الإعدادات',
  'model.vision': 'vision',
  'model.vision_title': 'هذا النموذج يدعم إدخال الصور',
  'model.switched': 'تم التبديل إلى {model}',

  // Thinking Indicator
  'thinking.0': 'Ava تفكّر...',
  'thinking.1': 'جارٍ تحليل الكود...',
  'thinking.2': 'جارٍ دراسة الأساليب...',
  'thinking.3': 'جارٍ صياغة الرد...',

  // Suggestions
  'suggestion.explain': 'اشرح هذا المشروع',
  'suggestion.explain_prompt': 'أعطني نظرة عامة عن بنية هذا المشروع وهندسته.',
  'suggestion.bug': 'ابحث عن خطأ',
  'suggestion.bug_prompt': 'ساعدني في إيجاد وإصلاح الأخطاء في الملف الحالي.',
  'suggestion.test': 'اكتب اختبارات',
  'suggestion.test_prompt': 'اكتب اختبارات شاملة للوحدة الرئيسية.',
  'suggestion.refactor': 'أعد هيكلة الكود',
  'suggestion.refactor_prompt': 'اقترح تحسينات لإعادة هيكلة الملف الحالي.',

  // Error Labels
  'error.auth': 'المصادقة',
  'error.credits': 'الفوترة',
  'error.forbidden': 'الوصول مرفوض',
  'error.rate_limit': 'تجاوز الحد',
  'error.model_not_found': 'خطأ في النموذج',
  'error.bad_request': 'طلب غير صالح',
  'error.server_error': 'خطأ في الخادم',
  'error.timeout': 'انتهت المهلة',
  'error.stream_stall': 'توقف البث',
  'error.network': 'خطأ في الشبكة',
  'error.setup': 'يتطلب الإعداد',
  'error.busy': 'مشغول',
  'error.iterations_exceeded': 'حد التكرار',
  'error.context_truncated': 'تم اقتطاع السياق',
  'error.provider_error': 'خطأ في المزوّد',
  'error.unknown': 'خطأ',
  'error.continue': 'متابعة',

  // Tool UI
  'tool.allow': 'سماح',
  'tool.always_allow': 'السماح دائماً',
  'tool.allow_all': 'السماح للكل',
  'tool.deny': 'رفض',
  'tool.allow_prompt': 'السماح بـ {tool}؟',
  'tool.arguments': 'المعاملات',
  'tool.output': 'المخرجات',
  'tool.error': 'خطأ',
  'tool.truncated': '... (تم الاقتطاع)',
  'tool.read': 'قراءة {file}',
  'tool.write': 'كتابة {file}',
  'tool.edit': 'تعديل {file}',
  'tool.find_files': 'البحث عن ملفات: {pattern}',
  'tool.search': 'بحث: {pattern}',
  'tool.run': 'تشغيل: {command}',
  'tool.list_dir': 'عرض {path}',
  'tool.web_search': 'بحث: {query}',
  'tool.ask_user': 'سؤال للمستخدم',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'سجل المحادثات',
  'history.new_chat': '+ محادثة جديدة',
  'history.close': 'إغلاق',
  'history.search': 'البحث في المحادثات...',
  'history.empty': 'لا توجد محادثات محفوظة بعد.',
  'history.no_match': 'لا توجد محادثات مطابقة.',
  'history.delete_confirm': 'حذف؟',
  'history.rename_hint': 'انقر مرتين لإعادة التسمية',
  'history.pin': 'تثبيت',
  'history.unpin': 'إلغاء التثبيت',
  'history.export_md': 'تصدير كـ Markdown',
  'history.pinned': 'مثبّتة',
  'history.just_now': 'الآن',
  'history.minutes_ago': 'منذ {n} د',
  'history.hours_ago': 'منذ {n} س',
  'history.days_ago': 'منذ {n} ي',

  // Ask User Card
  'ask.question': 'سؤال',
  'ask.fallback': 'لدى Ava سؤال',
  'ask.placeholder': 'اكتب ردك...',
  'ask.submit': 'إرسال',
  'ask.skip': 'تخطي',
  'ask.skipped': 'تم التخطي',

  // Plan Card
  'plan.unavailable': 'بيانات الخطة غير متوفرة',
  'plan.prefix': 'خطة: {title}',
  'plan.approved': 'تمت الموافقة',
  'plan.rejected': 'تم الرفض',
  'plan.goal': 'الهدف',
  'plan.steps': 'الخطوات',
  'plan.verification': 'التحقق',
  'plan.approaches': 'الأساليب',
  'plan.approve': 'موافقة',
  'plan.reject': 'رفض',

  // Todo Card
  'todo.unavailable': 'قائمة المهام غير متوفرة',
  'todo.tasks': 'المهام',
  'todo.done': '{done}/{total} مكتمل',

  // Status Bar
  'status.in': 'وارد',
  'status.out': 'صادر',

  // Plan Card extra
  'plan.pending': 'معلّق',

  // App-level
  'app.model_switched': 'تم التبديل إلى {model}',
  'app.context_compressed': 'تم ضغط السياق: ~{original} \u2192 ~{compressed} رمز',
  'app.continue': 'تابع من حيث توقفت.',
};
