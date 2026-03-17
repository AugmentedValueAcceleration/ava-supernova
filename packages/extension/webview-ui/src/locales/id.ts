/** Indonesian (Bahasa Indonesia) strings — webview subset for UI components. */
export const idStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Tanyakan apa saja tentang kode Anda.',
  'welcome.tagline': '45 alat · 7 provider · 2 model gratis · 20 bahasa',

  // Welcome — Setup
  'welcome.setup_title': 'Mulai — Tambahkan Kunci API',
  'welcome.setup_desc': 'Tambahkan kunci API provider untuk membuka Ava. GLM-4.5 Flash dan Codestral sepenuhnya gratis — tanpa kartu kredit.',
  'welcome.setup_cta': 'Buka Pengaturan',
  'welcome.ready_with': 'Siap dengan',

  // Welcome — Sections
  'welcome.quick_start': 'Mulai Cepat',
  'welcome.capabilities': 'Yang Bisa Dilakukan Ava',
  'welcome.modes': 'Mode',
  'welcome.footer': 'Open source · Kunci Anda, data Anda · Privasi utama',

  // Welcome — Capabilities
  'welcome.cap.files': 'Baca & Tulis File',
  'welcome.cap.files_desc': 'Buat, edit, dan kelola file apa pun di proyek Anda',
  'welcome.cap.search': 'Cari & Navigasi',
  'welcome.cap.search_desc': 'Temukan file, simbol, dan grep di seluruh codebase',
  'welcome.cap.terminal': 'Jalankan Perintah',
  'welcome.cap.terminal_desc': 'Jalankan perintah shell dan skrip secara langsung',
  'welcome.cap.web': 'Web & API',
  'welcome.cap.web_desc': 'Cari di web, buat permintaan HTTP, jelajahi halaman',
  'welcome.cap.security': 'Audit Keamanan',
  'welcome.cap.security_desc': 'Pindai kerentanan dan masalah keamanan',
  'welcome.cap.memory': 'Memori Persisten',
  'welcome.cap.memory_desc': 'Mengingat konteks antar percakapan',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Agen lengkap dengan semua alat',
  'welcome.mode.plan_desc': 'Arsitektur & perencanaan',
  'welcome.mode.chat_desc': 'Hanya diskusi',
  'welcome.mode.security_desc': 'Pemindaian keamanan',
  'welcome.mode.teach': 'Belajar',
  'welcome.mode.teach_desc': 'Ava menjadi tutor pribadi Anda',

  // Input Area
  'input.placeholder.code': 'Apa yang ingin Anda buat?',
  'input.placeholder.plan': 'Jelaskan apa yang ingin Anda rencanakan...',
  'input.placeholder.chat': 'Ajukan pertanyaan atau mulai diskusi...',
  'input.placeholder.disabled': 'Konfigurasikan provider untuk memulai...',
  'input.placeholder.security': 'Jelaskan apa yang ingin dipindai, atau tekan Enter untuk audit penuh...',
  'input.placeholder.teach': 'Apa yang ingin kamu pelajari?',
  'input.mode.code': 'Kerja',
  'input.mode.plan': 'Rencana',
  'input.mode.chat': 'Obrolan',
  'input.mode.teach': 'Belajar',
  'input.mode.brainstorm': 'Brainstorming',
  'input.placeholder.brainstorm': 'Apa yang ingin Anda jelajahi?',
  'input.mode.security': 'Keamanan',
  'input.send': 'Kirim (Enter)',
  'input.send_aria': 'Kirim pesan',
  'input.stop': 'Hentikan',
  'input.stop_aria': 'Hentikan Ava',
  'input.attach': 'Lampirkan gambar',
  'input.attach_image': 'Lampirkan gambar',
  'input.drop_image': 'Letakkan gambar di sini',
  'input.compressing': 'Mengompresi...',
  'input.compress_usage': 'Penggunaan konteks \u2014 klik untuk mengompresi',
  'input.compress_click': 'Klik untuk mengompresi konteks',

  // Header
  'header.history': 'Riwayat Obrolan',
  'header.settings': 'Pengaturan',
  'header.new_chat': 'Obrolan Baru',

  // Model Selector
  'model.no_providers': 'Belum ada provider yang dikonfigurasi.',
  'model.open_settings': 'Buka Pengaturan',
  'model.vision': 'vision',
  'model.vision_title': 'Model ini mendukung input gambar/vision',
  'model.switched': 'Beralih ke {model}',

  // Thinking Indicator
  'thinking.0': 'Ava sedang berpikir...',
  'thinking.1': 'Menganalisis kode Anda...',
  'thinking.2': 'Mempertimbangkan pendekatan...',
  'thinking.3': 'Menyusun respons...',

  // Suggestions
  'suggestion.explain': 'Jelaskan codebase ini',
  'suggestion.explain_prompt': 'Berikan gambaran umum tentang struktur dan arsitektur proyek ini.',
  'suggestion.bug': 'Cari bug',
  'suggestion.bug_prompt': 'Bantu saya menemukan dan memperbaiki bug di file saat ini.',
  'suggestion.test': 'Tulis tes',
  'suggestion.test_prompt': 'Tulis tes komprehensif untuk modul utama.',
  'suggestion.refactor': 'Refaktor kode',
  'suggestion.refactor_prompt': 'Sarankan perbaikan refaktor untuk file saat ini.',

  // Error Labels
  'error.auth': 'Autentikasi',
  'error.credits': 'Penagihan',
  'error.forbidden': 'Akses Ditolak',
  'error.rate_limit': 'Batas Laju',
  'error.model_not_found': 'Error Model',
  'error.bad_request': 'Permintaan Tidak Valid',
  'error.server_error': 'Error Server',
  'error.timeout': 'Waktu Habis',
  'error.stream_stall': 'Stream Terhenti',
  'error.network': 'Error Jaringan',
  'error.setup': 'Konfigurasi Diperlukan',
  'error.busy': 'Sibuk',
  'error.iterations_exceeded': 'Batas Iterasi',
  'error.context_truncated': 'Konteks Terpotong',
  'error.provider_error': 'Error Provider',
  'error.unknown': 'Error',
  'error.continue': 'Lanjutkan',

  // Tool UI
  'tool.allow': 'Izinkan',
  'tool.always_allow': 'Selalu Izinkan',
  'tool.allow_all': 'Izinkan Semua',
  'tool.deny': 'Tolak',
  'tool.allow_prompt': 'Izinkan {tool}?',
  'tool.arguments': 'Argumen',
  'tool.output': 'Output',
  'tool.error': 'Error',
  'tool.truncated': '... (terpotong)',
  'tool.read': 'Baca {file}',
  'tool.write': 'Tulis {file}',
  'tool.edit': 'Edit {file}',
  'tool.find_files': 'Cari file: {pattern}',
  'tool.search': 'Cari: {pattern}',
  'tool.run': 'Jalankan: {command}',
  'tool.list_dir': 'Daftar {path}',
  'tool.web_search': 'Cari: {query}',
  'tool.ask_user': 'Pertanyaan untuk pengguna',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Riwayat Obrolan',
  'history.new_chat': '+ Obrolan Baru',
  'history.close': 'Tutup',
  'history.search': 'Cari percakapan...',
  'history.empty': 'Belum ada percakapan tersimpan.',
  'history.no_match': 'Tidak ada percakapan yang cocok.',
  'history.delete_confirm': 'Hapus?',
  'history.rename_hint': 'Klik dua kali untuk mengganti nama',
  'history.pin': 'Sematkan',
  'history.unpin': 'Lepas sematan',
  'history.export_md': 'Ekspor sebagai Markdown',
  'history.pinned': 'Disematkan',
  'history.just_now': 'baru saja',
  'history.minutes_ago': '{n} menit lalu',
  'history.hours_ago': '{n} jam lalu',
  'history.days_ago': '{n} hari lalu',

  // Ask User Card
  'ask.question': 'Pertanyaan',
  'ask.fallback': 'Ava punya pertanyaan',
  'ask.placeholder': 'Ketik jawaban Anda...',
  'ask.submit': 'Kirim',
  'ask.skip': 'Lewati',
  'ask.skipped': 'Dilewati',

  // Plan Card
  'plan.unavailable': 'Data rencana tidak tersedia',
  'plan.prefix': 'Rencana: {title}',
  'plan.approved': 'Disetujui',
  'plan.rejected': 'Ditolak',
  'plan.goal': 'Tujuan',
  'plan.steps': 'Langkah',
  'plan.verification': 'Verifikasi',
  'plan.approaches': 'Pendekatan',
  'plan.approve': 'Setujui',
  'plan.reject': 'Tolak',

  // Todo Card
  'todo.unavailable': 'Daftar tugas tidak tersedia',
  'todo.tasks': 'Tugas',
  'todo.done': '{done}/{total} selesai',

  // Status Bar
  'status.in': 'masuk',
  'status.out': 'keluar',

  // Plan Card extra
  'plan.pending': 'tertunda',

  // App-level
  'app.model_switched': 'Beralih ke {model}',
  'app.context_compressed': 'Konteks dikompresi: ~{original} \u2192 ~{compressed} token',
  'app.continue': 'Lanjutkan dari posisi terakhir.',
};
