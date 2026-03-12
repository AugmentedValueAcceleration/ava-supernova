/** Dutch (Nederlands) strings — webview subset for UI components. */
export const nlStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Stel een vraag over je code.',
  'welcome.tagline': '24 tools \u00b7 7 providers \u00b7 2 gratis modellen \u00b7 20 talen',

  // Welcome — Setup
  'welcome.setup_title': 'Aan de slag \u2014 Voeg een API-sleutel toe',
  'welcome.setup_desc': 'Voeg een provider API-sleutel toe om Ava te ontgrendelen. GLM-4.5 Flash en Codestral zijn volledig gratis \u2014 geen creditcard nodig.',
  'welcome.setup_cta': 'Instellingen openen',
  'welcome.ready_with': 'Klaar met',

  // Welcome — Sections
  'welcome.quick_start': 'Snelstart',
  'welcome.capabilities': 'Wat Ava kan',
  'welcome.modes': 'Modi',
  'welcome.footer': 'Open source \u00b7 Jouw sleutels, jouw gegevens \u00b7 Privacy eerst',

  // Welcome — Capabilities
  'welcome.cap.files': 'Bestanden lezen & schrijven',
  'welcome.cap.files_desc': 'Maak, bewerk en beheer elk bestand in je project',
  'welcome.cap.search': 'Zoeken & navigeren',
  'welcome.cap.search_desc': 'Vind bestanden, symbolen en doorzoek je codebase',
  'welcome.cap.terminal': 'Opdrachten uitvoeren',
  'welcome.cap.terminal_desc': 'Voer shell-opdrachten en scripts direct uit',
  'welcome.cap.web': 'Web & APIs',
  'welcome.cap.web_desc': 'Zoek op het web, doe HTTP-verzoeken, blader door pagina\u2019s',
  'welcome.cap.security': 'Beveiligingsaudit',
  'welcome.cap.security_desc': 'Scan op kwetsbaarheden en beveiligingsproblemen',
  'welcome.cap.memory': 'Permanent geheugen',
  'welcome.cap.memory_desc': 'Onthoudt context over gesprekken heen',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Volledige agent met alle tools',
  'welcome.mode.plan_desc': 'Architectuur & planning',
  'welcome.mode.chat_desc': 'Alleen discussie',
  'welcome.mode.security_desc': 'Beveiligingsscan',

  // Input Area
  'input.placeholder.code': 'Wat wil je bouwen?',
  'input.placeholder.plan': 'Beschrijf wat je wilt plannen...',
  'input.placeholder.chat': 'Stel een vraag of begin een gesprek...',
  'input.placeholder.disabled': 'Configureer een provider om te beginnen...',
  'input.placeholder.security': 'Beschrijf wat gescand moet worden, of druk op Enter voor een volledige audit...',
  'input.mode.code': 'Code',
  'input.mode.plan': 'Plan',
  'input.mode.chat': 'Chat',
  'input.mode.security': 'Beveiliging',
  'input.send': 'Versturen (Enter)',
  'input.send_aria': 'Bericht versturen',
  'input.stop': 'Stoppen',
  'input.stop_aria': 'Ava stoppen',
  'input.attach': 'Afbeelding bijvoegen',
  'input.attach_image': 'Afbeelding bijvoegen',
  'input.drop_image': 'Sleep afbeelding hierheen',
  'input.compressing': 'Comprimeren...',
  'input.compress_usage': 'Contextgebruik \u2014 klik om te comprimeren',
  'input.compress_click': 'Klik om context te comprimeren',

  // Header
  'header.history': 'Chatgeschiedenis',
  'header.settings': 'Instellingen',
  'header.new_chat': 'Nieuw gesprek',

  // Model Selector
  'model.no_providers': 'Geen providers geconfigureerd.',
  'model.open_settings': 'Instellingen openen',
  'model.vision': 'vision',
  'model.vision_title': 'Dit model ondersteunt afbeelding-/visie-invoer',
  'model.switched': 'Overgeschakeld naar {model}',

  // Thinking Indicator
  'thinking.0': 'Ava denkt na...',
  'thinking.1': 'Je code analyseren...',
  'thinking.2': 'Benaderingen overwegen...',
  'thinking.3': 'Antwoord opstellen...',

  // Suggestions
  'suggestion.explain': 'Leg deze codebase uit',
  'suggestion.explain_prompt': 'Geef me een overzicht van de projectstructuur en architectuur.',
  'suggestion.bug': 'Zoek een bug',
  'suggestion.bug_prompt': 'Help me bugs te vinden en op te lossen in het huidige bestand.',
  'suggestion.test': 'Schrijf tests',
  'suggestion.test_prompt': 'Schrijf uitgebreide tests voor de hoofdmodule.',
  'suggestion.refactor': 'Refactor code',
  'suggestion.refactor_prompt': 'Stel verbeteringen voor om het huidige bestand te refactoren.',

  // Error Labels
  'error.auth': 'Authenticatie',
  'error.credits': 'Facturering',
  'error.forbidden': 'Toegang geweigerd',
  'error.rate_limit': 'Limiet bereikt',
  'error.model_not_found': 'Modelfout',
  'error.bad_request': 'Ongeldig verzoek',
  'error.server_error': 'Serverfout',
  'error.timeout': 'Time-out',
  'error.stream_stall': 'Stream vastgelopen',
  'error.network': 'Netwerkfout',
  'error.setup': 'Configuratie vereist',
  'error.busy': 'Bezig',
  'error.iterations_exceeded': 'Iteratielimiet',
  'error.context_truncated': 'Context afgekapt',
  'error.provider_error': 'Providerfout',
  'error.unknown': 'Fout',
  'error.continue': 'Doorgaan',

  // Tool UI
  'tool.allow': 'Toestaan',
  'tool.always_allow': 'Altijd toestaan',
  'tool.allow_all': 'Alles toestaan',
  'tool.deny': 'Weigeren',
  'tool.allow_prompt': '{tool} toestaan?',
  'tool.arguments': 'Argumenten',
  'tool.output': 'Uitvoer',
  'tool.error': 'Fout',
  'tool.truncated': '... (afgekapt)',
  'tool.read': 'Lezen {file}',
  'tool.write': 'Schrijven {file}',
  'tool.edit': 'Bewerken {file}',
  'tool.find_files': 'Bestanden zoeken: {pattern}',
  'tool.search': 'Zoeken: {pattern}',
  'tool.run': 'Uitvoeren: {command}',
  'tool.list_dir': 'Lijst {path}',
  'tool.web_search': 'Zoeken: {query}',
  'tool.ask_user': 'Vraag aan gebruiker',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Chatgeschiedenis',
  'history.new_chat': '+ Nieuw gesprek',
  'history.close': 'Sluiten',
  'history.search': 'Gesprekken zoeken...',
  'history.empty': 'Nog geen opgeslagen gesprekken.',
  'history.no_match': 'Geen overeenkomende gesprekken.',
  'history.delete_confirm': 'Verwijderen?',
  'history.rename_hint': 'Dubbelklik om te hernoemen',
  'history.pin': 'Vastmaken',
  'history.unpin': 'Losmaken',
  'history.export_md': 'Exporteren als Markdown',
  'history.pinned': 'Vastgemaakt',
  'history.just_now': 'zojuist',
  'history.minutes_ago': '{n} min geleden',
  'history.hours_ago': '{n} uur geleden',
  'history.days_ago': '{n} dgn geleden',

  // Ask User Card
  'ask.question': 'Vraag',
  'ask.fallback': 'Ava heeft een vraag',
  'ask.placeholder': 'Typ je antwoord...',
  'ask.submit': 'Versturen',
  'ask.skip': 'Overslaan',
  'ask.skipped': 'Overgeslagen',

  // Plan Card
  'plan.unavailable': 'Plangegevens niet beschikbaar',
  'plan.prefix': 'Plan: {title}',
  'plan.approved': 'Goedgekeurd',
  'plan.rejected': 'Afgewezen',
  'plan.goal': 'Doel',
  'plan.steps': 'Stappen',
  'plan.verification': 'Verificatie',
  'plan.approaches': 'Benaderingen',
  'plan.approve': 'Goedkeuren',
  'plan.reject': 'Afwijzen',

  // Todo Card
  'todo.unavailable': 'Takenlijst niet beschikbaar',
  'todo.tasks': 'Taken',
  'todo.done': '{done}/{total} voltooid',

  // Status Bar
  'status.in': 'in',
  'status.out': 'uit',

  // Plan Card extra
  'plan.pending': 'in afwachting',

  // App-level
  'app.model_switched': 'Overgeschakeld naar {model}',
  'app.context_compressed': 'Context gecomprimeerd: ~{original} \u2192 ~{compressed} tokens',
  'app.continue': 'Ga verder waar je gebleven was.',
};
