/** Webview Turkish (Türkçe) strings — subset of the full locale used by UI components. */
export const trStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Kodunuz hakkında her şeyi sorun.',
  'welcome.tagline': '45 araç · 7 sağlayıcı · 2 ücretsiz model · 20 dil',

  // Welcome — Setup
  'welcome.setup_title': 'Başlayın — API Anahtarı Ekleyin',
  'welcome.setup_desc': '3 milyon ücretsiz Qwen tokeni için kaydolun veya herhangi bir sağlayıcıdan kendi API anahtarınızı ekleyin.',
  'welcome.setup_cta': 'Ayarları Aç',
  'welcome.ready_with': 'Hazır:',

  // Welcome — Sections
  'welcome.quick_start': 'Hızlı Başlangıç',
  'welcome.capabilities': 'Ava Neler Yapabilir',
  'welcome.modes': 'Modlar',
  'welcome.footer': 'Açık kaynak · Anahtarlarınız, verileriniz · Gizlilik öncelikli',

  // Welcome — Capabilities
  'welcome.cap.files': 'Dosya Okuma ve Yazma',
  'welcome.cap.files_desc': 'Projenizdeki herhangi bir dosyayı oluşturun, düzenleyin ve yönetin',
  'welcome.cap.search': 'Arama ve Gezinme',
  'welcome.cap.search_desc': 'Dosyaları, sembolleri bulun ve kod tabanınızda grep yapın',
  'welcome.cap.terminal': 'Komut Çalıştırma',
  'welcome.cap.terminal_desc': 'Shell komutlarını ve betikleri doğrudan çalıştırın',
  'welcome.cap.web': 'Web ve API\'ler',
  'welcome.cap.web_desc': 'Web\'de arama yapın, HTTP istekleri gönderin, sayfaları gezin',
  'welcome.cap.security': 'Güvenlik Denetimi',
  'welcome.cap.security_desc': 'Güvenlik açıklarını ve sorunlarını tarayın',
  'welcome.cap.memory': 'Kalıcı Bellek',
  'welcome.cap.memory_desc': 'Sohbetler arasında bağlamı hatırlar',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Tüm araçlara sahip tam ajan',
  'welcome.mode.plan_desc': 'Mimari ve planlama',
  'welcome.mode.chat_desc': 'Yalnızca tartışma',
  'welcome.mode.security_desc': 'Güvenlik taraması',
  'welcome.mode.teach': 'Öğren',
  'welcome.mode.teach_desc': 'Ava kişisel öğretmeniniz olur',

  // Input Area
  'input.placeholder.code': 'Ne oluşturmak istiyorsunuz?',
  'input.placeholder.plan': 'Planlamak istediğinizi açıklayın...',
  'input.placeholder.chat': 'Bir soru sorun veya sohbet başlatın...',
  'input.placeholder.disabled': 'Başlamak için bir sağlayıcı yapılandırın...',
  'input.placeholder.security': 'Neyin taranacağını açıklayın veya tam denetim için Enter tuşuna basın...',
  'input.placeholder.teach': 'Ne öğrenmek istiyorsun?',
  'input.mode.code': 'Çalışma',
  'input.mode.plan': 'Plan',
  'input.mode.chat': 'Sohbet',
  'input.mode.teach': 'Öğren',
  'input.mode.brainstorm': 'Beyin Fırtınası',
  'input.placeholder.brainstorm': 'Ne keşfetmek istiyorsunuz?',
  'input.mode.security': 'Güvenlik',
  'input.send': 'Gönder (Enter)',
  'input.send_aria': 'Mesaj gönder',
  'input.stop': 'Durdur',
  'input.stop_aria': "Ava'yı durdur",
  'input.attach': 'Görsel ekle',
  'input.attach_image': 'Görsel ekle',
  'input.drop_image': 'Görseli buraya bırakın',
  'input.compressing': 'Sıkıştırılıyor...',
  'input.compress_usage': 'Bağlam kullanımı \u2014 sıkıştırmak için tıklayın',
  'input.compress_click': 'Bağlamı sıkıştırmak için tıklayın',

  // Header
  'header.history': 'Sohbet Geçmişi',
  'header.settings': 'Ayarlar',
  'header.new_chat': 'Yeni Sohbet',

  // Model Selector
  'model.no_providers': 'Yapılandırılmış sağlayıcı yok.',
  'model.open_settings': 'Ayarları Aç',
  'model.vision': 'vision',
  'model.vision_title': 'Bu model görsel girişini destekliyor',
  'model.switched': '{model} modeline geçildi',

  // Thinking Indicator
  'thinking.0': 'Ava düşünüyor...',
  'thinking.1': 'Kodunuz analiz ediliyor...',
  'thinking.2': 'Yaklaşımlar değerlendiriliyor...',
  'thinking.3': 'Yanıt hazırlanıyor...',

  // Suggestions
  'suggestion.explain': 'Bu kod tabanını açıkla',
  'suggestion.explain_prompt': 'Bu projenin yapısı ve mimarisi hakkında genel bir bakış ver.',
  'suggestion.bug': 'Hata bul',
  'suggestion.bug_prompt': 'Mevcut dosyadaki hataları bulmama ve düzeltmeme yardım et.',
  'suggestion.test': 'Test yaz',
  'suggestion.test_prompt': 'Ana modül için kapsamlı testler yaz.',
  'suggestion.refactor': 'Kodu yeniden düzenle',
  'suggestion.refactor_prompt': 'Mevcut dosya için yeniden düzenleme iyileştirmeleri öner.',

  // Error Labels
  'error.auth': 'Kimlik Doğrulama',
  'error.credits': 'Faturalandırma',
  'error.forbidden': 'Erişim Reddedildi',
  'error.rate_limit': 'Hız Sınırı',
  'error.model_not_found': 'Model Hatası',
  'error.bad_request': 'Geçersiz İstek',
  'error.server_error': 'Sunucu Hatası',
  'error.timeout': 'Zaman Aşımı',
  'error.stream_stall': 'Akış Durdu',
  'error.network': 'Ağ Hatası',
  'error.setup': 'Kurulum Gerekli',
  'error.busy': 'Meşgul',
  'error.iterations_exceeded': 'Yineleme Sınırı',
  'error.context_truncated': 'Bağlam Kırpıldı',
  'error.provider_error': 'Sağlayıcı Hatası',
  'error.unknown': 'Hata',
  'error.continue': 'Devam Et',

  // Tool UI
  'tool.allow': 'İzin Ver',
  'tool.always_allow': 'Her Zaman İzin Ver',
  'tool.allow_all': 'Tümüne İzin Ver',
  'tool.deny': 'Reddet',
  'tool.allow_prompt': '{tool} izni verilsin mi?',
  'tool.arguments': 'Argümanlar',
  'tool.output': 'Çıktı',
  'tool.error': 'Hata',
  'tool.truncated': '... (kırpıldı)',
  'tool.read': '{file} oku',
  'tool.write': '{file} yaz',
  'tool.edit': '{file} düzenle',
  'tool.find_files': 'Dosya bul: {pattern}',
  'tool.search': 'Ara: {pattern}',
  'tool.run': 'Çalıştır: {command}',
  'tool.list_dir': '{path} listele',
  'tool.web_search': 'Ara: {query}',
  'tool.ask_user': 'Kullanıcıya soru',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Sohbet Geçmişi',
  'history.new_chat': '+ Yeni Sohbet',
  'history.close': 'Kapat',
  'history.search': 'Sohbetlerde ara...',
  'history.empty': 'Henüz kayıtlı sohbet yok.',
  'history.no_match': 'Eşleşen sohbet bulunamadı.',
  'history.delete_confirm': 'Silinsin mi?',
  'history.rename_hint': 'Yeniden adlandırmak için çift tıklayın',
  'history.pin': 'Sabitle',
  'history.unpin': 'Sabitlemeyi Kaldır',
  'history.export_md': 'Markdown olarak dışa aktar',
  'history.pinned': 'Sabitlenmiş',
  'history.just_now': 'az önce',
  'history.minutes_ago': '{n} dk önce',
  'history.hours_ago': '{n} sa önce',
  'history.days_ago': '{n} gün önce',

  // Ask User Card
  'ask.question': 'Soru',
  'ask.fallback': "Ava'nın bir sorusu var",
  'ask.placeholder': 'Yanıtınızı yazın...',
  'ask.submit': 'Gönder',
  'ask.skip': 'Atla',
  'ask.skipped': 'Atlandı',

  // Plan Card
  'plan.unavailable': 'Plan verileri mevcut değil',
  'plan.prefix': 'Plan: {title}',
  'plan.approved': 'Onaylandı',
  'plan.rejected': 'Reddedildi',
  'plan.goal': 'Hedef',
  'plan.steps': 'Adımlar',
  'plan.verification': 'Doğrulama',
  'plan.approaches': 'Yaklaşımlar',
  'plan.approve': 'Onayla',
  'plan.reject': 'Reddet',

  // Todo Card
  'todo.unavailable': 'Görev listesi mevcut değil',
  'todo.tasks': 'Görevler',
  'todo.done': '{done}/{total} tamamlandı',

  // Status Bar
  'status.in': 'gelen',
  'status.out': 'giden',

  // Plan Card extra
  'plan.pending': 'beklemede',

  // App-level
  'app.model_switched': '{model} modeline geçildi',
  'app.context_compressed': 'Bağlam sıkıştırıldı: ~{original} \u2192 ~{compressed} token',
  'app.continue': 'Kaldığınız yerden devam edin.',
};
