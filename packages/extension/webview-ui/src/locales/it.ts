/** Webview Italian (Italiano) strings \u2014 subset of the full locale used by UI components. */
export const itStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Chiedi qualsiasi cosa sul tuo codice.',
  'welcome.tagline': '45 strumenti \u00b7 7 provider \u00b7 2 modelli gratuiti \u00b7 20 lingue',

  // Welcome — Setup
  'welcome.setup_title': 'Inizia \u2014 Aggiungi una chiave API',
  'welcome.setup_desc': 'Registrati per 3M di token Qwen gratuiti, oppure aggiungi la tua chiave API da qualsiasi provider.',
  'welcome.setup_cta': 'Apri impostazioni',
  'welcome.ready_with': 'Pronto con',

  // Welcome — Sections
  'welcome.quick_start': 'Avvio rapido',
  'welcome.capabilities': 'Cosa pu\u00f2 fare Ava',
  'welcome.modes': 'Modalit\u00e0',
  'welcome.footer': 'Open source \u00b7 Le tue chiavi, i tuoi dati \u00b7 Privacy prima di tutto',

  // Welcome — Capabilities
  'welcome.cap.files': 'Leggi e scrivi file',
  'welcome.cap.files_desc': 'Crea, modifica e gestisci qualsiasi file nel tuo progetto',
  'welcome.cap.search': 'Cerca e naviga',
  'welcome.cap.search_desc': 'Trova file, simboli e cerca nel tuo codice',
  'welcome.cap.terminal': 'Esegui comandi',
  'welcome.cap.terminal_desc': 'Esegui comandi shell e script direttamente',
  'welcome.cap.web': 'Web e API',
  'welcome.cap.web_desc': 'Cerca sul web, effettua richieste HTTP, naviga pagine',
  'welcome.cap.security': 'Audit di sicurezza',
  'welcome.cap.security_desc': 'Scansiona vulnerabilit\u00e0 e problemi di sicurezza',
  'welcome.cap.memory': 'Memoria persistente',
  'welcome.cap.memory_desc': 'Ricorda il contesto tra le conversazioni',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Agente completo con tutti gli strumenti',
  'welcome.mode.plan_desc': 'Architettura e pianificazione',
  'welcome.mode.chat_desc': 'Solo discussione',
  'welcome.mode.security_desc': 'Scansione di sicurezza',
  'welcome.mode.teach': 'Imparare',
  'welcome.mode.teach_desc': 'Ava diventa il tuo tutor personale',

  // Input Area
  'input.placeholder.code': 'Cosa vuoi costruire?',
  'input.placeholder.plan': 'Descrivi cosa vuoi pianificare...',
  'input.placeholder.chat': 'Fai una domanda o avvia una discussione...',
  'input.placeholder.disabled': 'Configura un provider per iniziare...',
  'input.placeholder.security': 'Descrivi cosa analizzare, oppure premi Invio per un audit completo...',
  'input.placeholder.teach': 'Cosa vuoi imparare?',
  'input.mode.code': 'Lavoro',
  'input.mode.plan': 'Piano',
  'input.mode.chat': 'Chat',
  'input.mode.teach': 'Imparare',
  'input.mode.brainstorm': 'Brainstorming',
  'input.placeholder.brainstorm': 'Cosa vuoi esplorare?',
  'input.mode.security': 'Sicurezza',
  'input.send': 'Invia (Invio)',
  'input.send_aria': 'Invia messaggio',
  'input.stop': 'Ferma',
  'input.stop_aria': 'Ferma Ava',
  'input.attach': 'Allega immagine',
  'input.attach_image': 'Allega immagine',
  'input.drop_image': 'Trascina l\u2019immagine qui',
  'input.compressing': 'Compressione...',
  'input.compress_usage': 'Utilizzo del contesto \u2014 clicca per comprimere',
  'input.compress_click': 'Clicca per comprimere il contesto',

  // Header
  'header.history': 'Cronologia chat',
  'header.settings': 'Impostazioni',
  'header.new_chat': 'Nuova chat',

  // Model Selector
  'model.no_providers': 'Nessun provider configurato.',
  'model.open_settings': 'Apri impostazioni',
  'model.vision': 'visione',
  'model.vision_title': 'Questo modello supporta input immagine/visione',
  'model.switched': 'Passato a {model}',

  // Thinking Indicator
  'thinking.0': 'Ava sta pensando...',
  'thinking.1': 'Analisi del tuo codice...',
  'thinking.2': 'Valutazione degli approcci...',
  'thinking.3': 'Preparazione della risposta...',

  // Suggestions
  'suggestion.explain': 'Spiega questo progetto',
  'suggestion.explain_prompt': 'Dammi una panoramica della struttura e dell\u2019architettura di questo progetto.',
  'suggestion.bug': 'Trova un bug',
  'suggestion.bug_prompt': 'Aiutami a trovare e correggere i bug nel file corrente.',
  'suggestion.test': 'Scrivi test',
  'suggestion.test_prompt': 'Scrivi test completi per il modulo principale.',
  'suggestion.refactor': 'Refactoring del codice',
  'suggestion.refactor_prompt': 'Suggerisci miglioramenti di refactoring per il file corrente.',

  // Error Labels
  'error.auth': 'Autenticazione',
  'error.credits': 'Fatturazione',
  'error.forbidden': 'Accesso negato',
  'error.rate_limit': 'Limite di frequenza',
  'error.model_not_found': 'Errore modello',
  'error.bad_request': 'Richiesta non valida',
  'error.server_error': 'Errore del server',
  'error.timeout': 'Tempo scaduto',
  'error.stream_stall': 'Flusso interrotto',
  'error.network': 'Errore di rete',
  'error.setup': 'Configurazione necessaria',
  'error.busy': 'Occupato',
  'error.iterations_exceeded': 'Limite iterazioni',
  'error.context_truncated': 'Contesto troncato',
  'error.provider_error': 'Errore del provider',
  'error.unknown': 'Errore',
  'error.continue': 'Continua',

  // Tool UI
  'tool.allow': 'Consenti',
  'tool.always_allow': 'Consenti sempre',
  'tool.allow_all': 'Consenti tutto',
  'tool.deny': 'Nega',
  'tool.allow_prompt': 'Consentire {tool}?',
  'tool.arguments': 'Argomenti',
  'tool.output': 'Output',
  'tool.error': 'Errore',
  'tool.truncated': '... (troncato)',
  'tool.read': 'Leggi {file}',
  'tool.write': 'Scrivi {file}',
  'tool.edit': 'Modifica {file}',
  'tool.find_files': 'Cerca file: {pattern}',
  'tool.search': 'Cerca: {pattern}',
  'tool.run': 'Esegui: {command}',
  'tool.list_dir': 'Elenca {path}',
  'tool.web_search': 'Cerca: {query}',
  'tool.ask_user': 'Domanda per l\u2019utente',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Cronologia chat',
  'history.new_chat': '+ Nuova chat',
  'history.close': 'Chiudi',
  'history.search': 'Cerca conversazioni...',
  'history.empty': 'Nessuna conversazione salvata.',
  'history.no_match': 'Nessuna conversazione corrispondente.',
  'history.delete_confirm': 'Eliminare?',
  'history.rename_hint': 'Doppio clic per rinominare',
  'history.pin': 'Fissa',
  'history.unpin': 'Sblocca',
  'history.export_md': 'Esporta come Markdown',
  'history.pinned': 'Fissate',
  'history.just_now': 'proprio ora',
  'history.minutes_ago': '{n}min fa',
  'history.hours_ago': '{n}h fa',
  'history.days_ago': '{n}g fa',

  // Ask User Card
  'ask.question': 'Domanda',
  'ask.fallback': 'Ava ha una domanda',
  'ask.placeholder': 'Scrivi la tua risposta...',
  'ask.submit': 'Invia',
  'ask.skip': 'Salta',
  'ask.skipped': 'Saltata',

  // Plan Card
  'plan.unavailable': 'Dati del piano non disponibili',
  'plan.prefix': 'Piano: {title}',
  'plan.approved': 'Approvato',
  'plan.rejected': 'Rifiutato',
  'plan.goal': 'Obiettivo',
  'plan.steps': 'Passaggi',
  'plan.verification': 'Verifica',
  'plan.approaches': 'Approcci',
  'plan.approve': 'Approva',
  'plan.reject': 'Rifiuta',

  // Todo Card
  'todo.unavailable': 'Lista attivit\u00e0 non disponibile',
  'todo.tasks': 'Attivit\u00e0',
  'todo.done': '{done}/{total} completate',

  // Status Bar
  'status.in': 'ingresso',
  'status.out': 'uscita',

  // Plan Card extra
  'plan.pending': 'in attesa',

  // App-level
  'app.model_switched': 'Passato a {model}',
  'app.context_compressed': 'Contesto compresso: ~{original} \u2192 ~{compressed} token',
  'app.continue': 'Riprendi da dove avevi lasciato.',
};
