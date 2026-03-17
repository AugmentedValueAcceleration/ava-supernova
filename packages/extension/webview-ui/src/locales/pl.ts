/** Polish (Polski) strings — webview subset for UI components. */
export const plStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Zapytaj o cokolwiek dotyczącego Twojego kodu.',
  'welcome.tagline': '45 narzędzi · 7 dostawców · 2 darmowe modele · 20 języków',

  // Welcome — Setup
  'welcome.setup_title': 'Rozpocznij — Dodaj klucz API',
  'welcome.setup_desc': 'Dodaj klucz API dostawcy, aby odblokować Avę. GLM-4.5 Flash i Codestral są całkowicie darmowe — karta kredytowa nie jest wymagana.',
  'welcome.setup_cta': 'Otwórz ustawienia',
  'welcome.ready_with': 'Gotowe z',

  // Welcome — Sections
  'welcome.quick_start': 'Szybki start',
  'welcome.capabilities': 'Co potrafi Ava',
  'welcome.modes': 'Tryby',
  'welcome.footer': 'Open source · Twoje klucze, Twoje dane · Prywatność przede wszystkim',

  // Welcome — Capabilities
  'welcome.cap.files': 'Odczyt i zapis plików',
  'welcome.cap.files_desc': 'Twórz, edytuj i zarządzaj dowolnymi plikami w swoim projekcie',
  'welcome.cap.search': 'Wyszukiwanie i nawigacja',
  'welcome.cap.search_desc': 'Znajdź pliki, symbole i przeszukuj bazę kodu',
  'welcome.cap.terminal': 'Uruchamianie poleceń',
  'welcome.cap.terminal_desc': 'Wykonuj polecenia powłoki i skrypty bezpośrednio',
  'welcome.cap.web': 'Web i API',
  'welcome.cap.web_desc': 'Szukaj w sieci, wykonuj zapytania HTTP, przeglądaj strony',
  'welcome.cap.security': 'Audyt bezpieczeństwa',
  'welcome.cap.security_desc': 'Skanuj podatności i problemy bezpieczeństwa',
  'welcome.cap.memory': 'Trwała pamięć',
  'welcome.cap.memory_desc': 'Zapamiętuje kontekst między rozmowami',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Pełny agent ze wszystkimi narzędziami',
  'welcome.mode.plan_desc': 'Architektura i planowanie',
  'welcome.mode.chat_desc': 'Tylko dyskusja',
  'welcome.mode.security_desc': 'Skanowanie bezpieczeństwa',
  'welcome.mode.teach': 'Nauka',
  'welcome.mode.teach_desc': 'Ava staje się Twoim osobistym korepetytorem',

  // Input Area
  'input.placeholder.code': 'Co chcesz zbudować?',
  'input.placeholder.plan': 'Opisz, co chcesz zaplanować...',
  'input.placeholder.chat': 'Zadaj pytanie lub rozpocznij dyskusję...',
  'input.placeholder.disabled': 'Skonfiguruj dostawcę, aby rozpocząć...',
  'input.placeholder.security': 'Opisz, co przeskanować, lub naciśnij Enter, aby przeprowadzić pełny audyt...',
  'input.placeholder.teach': 'Czego chcesz się nauczyć?',
  'input.mode.code': 'Praca',
  'input.mode.plan': 'Plan',
  'input.mode.chat': 'Czat',
  'input.mode.teach': 'Nauka',
  'input.mode.brainstorm': 'Burza mózgów',
  'input.placeholder.brainstorm': 'Co chcesz zbadać?',
  'input.mode.security': 'Bezpieczeństwo',
  'input.send': 'Wyślij (Enter)',
  'input.send_aria': 'Wyślij wiadomość',
  'input.stop': 'Zatrzymaj',
  'input.stop_aria': 'Zatrzymaj Avę',
  'input.attach': 'Dołącz obraz',
  'input.attach_image': 'Dołącz obraz',
  'input.drop_image': 'Upuść obraz tutaj',
  'input.compressing': 'Kompresowanie...',
  'input.compress_usage': 'Wykorzystanie kontekstu \u2014 kliknij, aby skompresować',
  'input.compress_click': 'Kliknij, aby skompresować kontekst',

  // Header
  'header.history': 'Historia czatu',
  'header.settings': 'Ustawienia',
  'header.new_chat': 'Nowy czat',

  // Model Selector
  'model.no_providers': 'Brak skonfigurowanych dostawców.',
  'model.open_settings': 'Otwórz ustawienia',
  'model.vision': 'wizja',
  'model.vision_title': 'Ten model obsługuje obrazy/dane wizualne',
  'model.switched': 'Przełączono na {model}',

  // Thinking Indicator
  'thinking.0': 'Ava myśli...',
  'thinking.1': 'Analizuję Twój kod...',
  'thinking.2': 'Rozważam podejścia...',
  'thinking.3': 'Przygotowuję odpowiedź...',

  // Suggestions
  'suggestion.explain': 'Wyjaśnij ten projekt',
  'suggestion.explain_prompt': 'Przedstaw ogólny przegląd struktury i architektury tego projektu.',
  'suggestion.bug': 'Znajdź błąd',
  'suggestion.bug_prompt': 'Pomóż mi znaleźć i naprawić błędy w bieżącym pliku.',
  'suggestion.test': 'Napisz testy',
  'suggestion.test_prompt': 'Napisz kompleksowe testy dla głównego modułu.',
  'suggestion.refactor': 'Refaktoryzuj kod',
  'suggestion.refactor_prompt': 'Zaproponuj ulepszenia refaktoryzacji dla bieżącego pliku.',

  // Error Labels
  'error.auth': 'Uwierzytelnianie',
  'error.credits': 'Rozliczenia',
  'error.forbidden': 'Brak dostępu',
  'error.rate_limit': 'Limit zapytań',
  'error.model_not_found': 'Błąd modelu',
  'error.bad_request': 'Błędne zapytanie',
  'error.server_error': 'Błąd serwera',
  'error.timeout': 'Przekroczenie czasu',
  'error.stream_stall': 'Strumień utknął',
  'error.network': 'Błąd sieci',
  'error.setup': 'Wymagana konfiguracja',
  'error.busy': 'Zajęta',
  'error.iterations_exceeded': 'Limit iteracji',
  'error.context_truncated': 'Kontekst obcięty',
  'error.provider_error': 'Błąd dostawcy',
  'error.unknown': 'Błąd',
  'error.continue': 'Kontynuuj',

  // Tool UI
  'tool.allow': 'Zezwól',
  'tool.always_allow': 'Zawsze zezwalaj',
  'tool.allow_all': 'Zezwól na wszystko',
  'tool.deny': 'Odmów',
  'tool.allow_prompt': 'Zezwolić na {tool}?',
  'tool.arguments': 'Argumenty',
  'tool.output': 'Wynik',
  'tool.error': 'Błąd',
  'tool.truncated': '... (obcięto)',
  'tool.read': 'Odczyt {file}',
  'tool.write': 'Zapis {file}',
  'tool.edit': 'Edycja {file}',
  'tool.find_files': 'Szukaj plików: {pattern}',
  'tool.search': 'Szukaj: {pattern}',
  'tool.run': 'Uruchom: {command}',
  'tool.list_dir': 'Lista {path}',
  'tool.web_search': 'Szukaj: {query}',
  'tool.ask_user': 'Pytanie do użytkownika',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Historia czatu',
  'history.new_chat': '+ Nowy czat',
  'history.close': 'Zamknij',
  'history.search': 'Szukaj rozmów...',
  'history.empty': 'Brak zapisanych rozmów.',
  'history.no_match': 'Brak pasujących rozmów.',
  'history.delete_confirm': 'Usunąć?',
  'history.rename_hint': 'Kliknij dwukrotnie, aby zmienić nazwę',
  'history.pin': 'Przypnij',
  'history.unpin': 'Odepnij',
  'history.export_md': 'Eksportuj jako Markdown',
  'history.pinned': 'Przypięte',
  'history.just_now': 'przed chwilą',
  'history.minutes_ago': '{n} min temu',
  'history.hours_ago': '{n} godz. temu',
  'history.days_ago': '{n} dn. temu',

  // Ask User Card
  'ask.question': 'Pytanie',
  'ask.fallback': 'Ava ma pytanie',
  'ask.placeholder': 'Wpisz swoją odpowiedź...',
  'ask.submit': 'Wyślij',
  'ask.skip': 'Pomiń',
  'ask.skipped': 'Pominięto',

  // Plan Card
  'plan.unavailable': 'Dane planu niedostępne',
  'plan.prefix': 'Plan: {title}',
  'plan.approved': 'Zatwierdzony',
  'plan.rejected': 'Odrzucony',
  'plan.goal': 'Cel',
  'plan.steps': 'Kroki',
  'plan.verification': 'Weryfikacja',
  'plan.approaches': 'Podejścia',
  'plan.approve': 'Zatwierdź',
  'plan.reject': 'Odrzuć',

  // Todo Card
  'todo.unavailable': 'Lista zadań niedostępna',
  'todo.tasks': 'Zadania',
  'todo.done': '{done}/{total} ukończono',

  // Status Bar
  'status.in': 'wej.',
  'status.out': 'wyj.',

  // Plan Card extra
  'plan.pending': 'oczekujący',

  // App-level
  'app.model_switched': 'Przełączono na {model}',
  'app.context_compressed': 'Kontekst skompresowany: ~{original} \u2192 ~{compressed} tokenów',
  'app.continue': 'Kontynuuj od miejsca, w którym skończyłeś.',
};
