/** Webview German (Deutsch) strings \u2014 subset of the full locale used by UI components. */
export const deStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Stell jede Frage zu deinem Code.',
  'welcome.tagline': '45 Tools · 7 Anbieter · 2 kostenlose Modelle · 20 Sprachen',

  // Welcome — Setup
  'welcome.setup_title': 'Erste Schritte — API-Schlüssel hinzufügen',
  'welcome.setup_desc': 'Füge einen API-Schlüssel hinzu, um Ava freizuschalten. GLM-4.5 Flash und Codestral sind komplett kostenlos — keine Kreditkarte nötig.',
  'welcome.setup_cta': 'Einstellungen öffnen',
  'welcome.ready_with': 'Bereit mit',

  // Welcome — Sections
  'welcome.quick_start': 'Schnellstart',
  'welcome.capabilities': 'Was Ava kann',
  'welcome.modes': 'Modi',
  'welcome.footer': 'Open Source · Deine Schlüssel, deine Daten · Datenschutz zuerst',

  // Welcome — Capabilities
  'welcome.cap.files': 'Dateien lesen & schreiben',
  'welcome.cap.files_desc': 'Erstelle, bearbeite und verwalte beliebige Dateien in deinem Projekt',
  'welcome.cap.search': 'Suchen & Navigieren',
  'welcome.cap.search_desc': 'Finde Dateien, Symbole und durchsuche deine Codebasis',
  'welcome.cap.terminal': 'Befehle ausführen',
  'welcome.cap.terminal_desc': 'Führe Shell-Befehle und Skripte direkt aus',
  'welcome.cap.web': 'Web & APIs',
  'welcome.cap.web_desc': 'Web durchsuchen, HTTP-Anfragen senden, Seiten durchstöbern',
  'welcome.cap.security': 'Sicherheitsaudit',
  'welcome.cap.security_desc': 'Schwachstellen und Sicherheitsprobleme scannen',
  'welcome.cap.memory': 'Persistenter Speicher',
  'welcome.cap.memory_desc': 'Merkt sich Kontext über Gespräche hinweg',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Vollständiger Agent mit allen Tools',
  'welcome.mode.plan_desc': 'Architektur & Planung',
  'welcome.mode.chat_desc': 'Nur Diskussion',
  'welcome.mode.security_desc': 'Sicherheitsscan',
  'welcome.mode.teach': 'Lernen',
  'welcome.mode.teach_desc': 'Ava wird dein persönlicher Tutor',

  // Input Area
  'input.placeholder.code': 'Was m\u00f6chtest du bauen?',
  'input.placeholder.plan': 'Beschreibe, was du planen m\u00f6chtest...',
  'input.placeholder.chat': 'Stelle eine Frage oder starte eine Diskussion...',
  'input.placeholder.disabled': 'Konfiguriere einen Anbieter, um zu beginnen...',
  'input.placeholder.security': 'Beschreibe, was gescannt werden soll, oder dr\u00fccke Enter f\u00fcr ein vollst\u00e4ndiges Audit...',
  'input.placeholder.teach': 'Was möchtest du lernen?',
  'input.mode.code': 'Arbeit',
  'input.mode.plan': 'Plan',
  'input.mode.chat': 'Chat',
  'input.mode.teach': 'Lernen',
  'input.mode.brainstorm': 'Brainstorming',
  'input.placeholder.brainstorm': 'Was möchten Sie erkunden?',
  'input.mode.security': 'Sicherheit',
  'input.send': 'Senden (Enter)',
  'input.send_aria': 'Nachricht senden',
  'input.stop': 'Stopp',
  'input.stop_aria': 'Ava stoppen',
  'input.attach': 'Bild anh\u00e4ngen',
  'input.attach_image': 'Bild anh\u00e4ngen',
  'input.drop_image': 'Bild hier ablegen',
  'input.compressing': 'Komprimiere...',
  'input.compress_usage': 'Kontextnutzung \u2014 klicken zum Komprimieren',
  'input.compress_click': 'Klicken zum Komprimieren des Kontexts',

  // Header
  'header.history': 'Chatverlauf',
  'header.settings': 'Einstellungen',
  'header.new_chat': 'Neuer Chat',

  // Model Selector
  'model.no_providers': 'Keine Anbieter konfiguriert.',
  'model.open_settings': 'Einstellungen \u00f6ffnen',
  'model.vision': 'Vision',
  'model.vision_title': 'Dieses Modell unterst\u00fctzt Bild-/Vision-Eingabe',
  'model.switched': 'Gewechselt zu {model}',

  // Thinking Indicator
  'thinking.0': 'Ava denkt nach...',
  'thinking.1': 'Analysiere deinen Code...',
  'thinking.2': '\u00dcberpr\u00fcfe Ans\u00e4tze...',
  'thinking.3': 'Formuliere eine Antwort...',

  // Suggestions
  'suggestion.explain': 'Dieses Projekt erkl\u00e4ren',
  'suggestion.explain_prompt': 'Gib mir einen \u00dcberblick \u00fcber die Struktur und Architektur dieses Projekts.',
  'suggestion.bug': 'Einen Bug finden',
  'suggestion.bug_prompt': 'Hilf mir, Fehler in der aktuellen Datei zu finden und zu beheben.',
  'suggestion.test': 'Tests schreiben',
  'suggestion.test_prompt': 'Schreibe umfassende Tests f\u00fcr das Hauptmodul.',
  'suggestion.refactor': 'Code refaktorisieren',
  'suggestion.refactor_prompt': 'Schlage Verbesserungen zur Refaktorisierung der aktuellen Datei vor.',

  // Error Labels
  'error.auth': 'Authentifizierung',
  'error.credits': 'Abrechnung',
  'error.forbidden': 'Zugriff verweigert',
  'error.rate_limit': 'Ratenlimit',
  'error.model_not_found': 'Modellfehler',
  'error.bad_request': 'Ung\u00fcltige Anfrage',
  'error.server_error': 'Serverfehler',
  'error.timeout': 'Zeitlimit \u00fcberschritten',
  'error.stream_stall': 'Stream unterbrochen',
  'error.network': 'Netzwerkfehler',
  'error.setup': 'Einrichtung erforderlich',
  'error.busy': 'Besch\u00e4ftigt',
  'error.iterations_exceeded': 'Iterationslimit',
  'error.context_truncated': 'Kontext gek\u00fcrzt',
  'error.provider_error': 'Anbieterfehler',
  'error.unknown': 'Fehler',
  'error.continue': 'Fortfahren',

  // Tool UI
  'tool.allow': 'Erlauben',
  'tool.always_allow': 'Immer erlauben',
  'tool.allow_all': 'Alles erlauben',
  'tool.deny': 'Ablehnen',
  'tool.allow_prompt': '{tool} erlauben?',
  'tool.arguments': 'Argumente',
  'tool.output': 'Ausgabe',
  'tool.error': 'Fehler',
  'tool.truncated': '... (gek\u00fcrzt)',
  'tool.read': 'Lesen {file}',
  'tool.write': 'Schreiben {file}',
  'tool.edit': 'Bearbeiten {file}',
  'tool.find_files': 'Dateien suchen: {pattern}',
  'tool.search': 'Suchen: {pattern}',
  'tool.run': 'Ausf\u00fchren: {command}',
  'tool.list_dir': 'Auflisten {path}',
  'tool.web_search': 'Suchen: {query}',
  'tool.ask_user': 'Frage an den Benutzer',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Chatverlauf',
  'history.new_chat': '+ Neuer Chat',
  'history.close': 'Schlie\u00dfen',
  'history.search': 'Gespr\u00e4che durchsuchen...',
  'history.empty': 'Noch keine gespeicherten Gespr\u00e4che.',
  'history.no_match': 'Keine passenden Gespr\u00e4che.',
  'history.delete_confirm': 'L\u00f6schen?',
  'history.rename_hint': 'Doppelklick zum Umbenennen',
  'history.pin': 'Anheften',
  'history.unpin': 'Abheften',
  'history.export_md': 'Als Markdown exportieren',
  'history.pinned': 'Angeheftet',
  'history.just_now': 'gerade eben',
  'history.minutes_ago': 'vor {n}min',
  'history.hours_ago': 'vor {n}h',
  'history.days_ago': 'vor {n}T',

  // Ask User Card
  'ask.question': 'Frage',
  'ask.fallback': 'Ava hat eine Frage',
  'ask.placeholder': 'Gib deine Antwort ein...',
  'ask.submit': 'Absenden',
  'ask.skip': '\u00dcberspringen',
  'ask.skipped': '\u00dcbersprungen',

  // Plan Card
  'plan.unavailable': 'Plandaten nicht verf\u00fcgbar',
  'plan.prefix': 'Plan: {title}',
  'plan.approved': 'Genehmigt',
  'plan.rejected': 'Abgelehnt',
  'plan.goal': 'Ziel',
  'plan.steps': 'Schritte',
  'plan.verification': '\u00dcberpr\u00fcfung',
  'plan.approaches': 'Ans\u00e4tze',
  'plan.approve': 'Genehmigen',
  'plan.reject': 'Ablehnen',

  // Todo Card
  'todo.unavailable': 'Aufgabenliste nicht verf\u00fcgbar',
  'todo.tasks': 'Aufgaben',
  'todo.done': '{done}/{total} erledigt',

  // Status Bar
  'status.in': 'Eingang',
  'status.out': 'Ausgang',

  // Plan Card extra
  'plan.pending': 'ausstehend',

  // App-level
  'app.model_switched': 'Gewechselt zu {model}',
  'app.context_compressed': 'Kontext komprimiert: ~{original} \u2192 ~{compressed} Tokens',
  'app.continue': 'Mach dort weiter, wo du aufgeh\u00f6rt hast.',
};
