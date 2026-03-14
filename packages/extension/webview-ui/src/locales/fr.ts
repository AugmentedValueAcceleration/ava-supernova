/** Webview French (Fran\u00e7ais) strings \u2014 subset of the full locale used by UI components. */
export const frStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Posez n\u2019importe quelle question sur votre code.',
  'welcome.tagline': '24 outils \u00b7 7 fournisseurs \u00b7 2 mod\u00e8les gratuits \u00b7 20 langues',

  // Welcome — Setup
  'welcome.setup_title': 'D\u00e9marrer \u2014 Ajouter une cl\u00e9 API',
  'welcome.setup_desc': 'Ajoutez une cl\u00e9 API de fournisseur pour d\u00e9bloquer Ava. GLM-4.5 Flash et Codestral sont enti\u00e8rement gratuits \u2014 aucune carte de cr\u00e9dit requise.',
  'welcome.setup_cta': 'Ouvrir les param\u00e8tres',
  'welcome.ready_with': 'Pr\u00eat avec',

  // Welcome — Sections
  'welcome.quick_start': 'D\u00e9marrage rapide',
  'welcome.capabilities': 'Ce qu\u2019Ava peut faire',
  'welcome.modes': 'Modes',
  'welcome.footer': 'Open source \u00b7 Vos cl\u00e9s, vos donn\u00e9es \u00b7 Confidentialit\u00e9 d\u2019abord',

  // Welcome — Capabilities
  'welcome.cap.files': 'Lire et \u00e9crire des fichiers',
  'welcome.cap.files_desc': 'Cr\u00e9ez, modifiez et g\u00e9rez n\u2019importe quel fichier de votre projet',
  'welcome.cap.search': 'Rechercher et naviguer',
  'welcome.cap.search_desc': 'Trouvez des fichiers, des symboles et recherchez dans votre code',
  'welcome.cap.terminal': 'Ex\u00e9cuter des commandes',
  'welcome.cap.terminal_desc': 'Ex\u00e9cutez des commandes shell et des scripts directement',
  'welcome.cap.web': 'Web et APIs',
  'welcome.cap.web_desc': 'Recherchez sur le web, effectuez des requ\u00eates HTTP, parcourez des pages',
  'welcome.cap.security': 'Audit de s\u00e9curit\u00e9',
  'welcome.cap.security_desc': 'D\u00e9tectez les vuln\u00e9rabilit\u00e9s et les probl\u00e8mes de s\u00e9curit\u00e9',
  'welcome.cap.memory': 'M\u00e9moire persistante',
  'welcome.cap.memory_desc': 'Retient le contexte entre les conversations',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Agent complet avec tous les outils',
  'welcome.mode.plan_desc': 'Architecture et planification',
  'welcome.mode.chat_desc': 'Discussion uniquement',
  'welcome.mode.security_desc': 'Analyse de s\u00e9curit\u00e9',

  // Input Area
  'input.placeholder.code': 'Que voulez-vous construire ?',
  'input.placeholder.plan': 'D\u00e9crivez ce que vous voulez planifier...',
  'input.placeholder.chat': 'Posez une question ou lancez une discussion...',
  'input.placeholder.disabled': 'Configurez un fournisseur pour commencer...',
  'input.placeholder.security': 'D\u00e9crivez ce qu\u2019il faut analyser, ou appuyez sur Entr\u00e9e pour un audit complet...',
  'input.mode.code': 'Travail',
  'input.mode.plan': 'Plan',
  'input.mode.chat': 'Chat',
  'input.mode.security': 'S\u00e9curit\u00e9',
  'input.send': 'Envoyer (Entr\u00e9e)',
  'input.send_aria': 'Envoyer le message',
  'input.stop': 'Arr\u00eater',
  'input.stop_aria': 'Arr\u00eater Ava',
  'input.attach': 'Joindre une image',
  'input.attach_image': 'Joindre une image',
  'input.drop_image': 'D\u00e9posez l\u2019image ici',
  'input.compressing': 'Compression...',
  'input.compress_usage': 'Utilisation du contexte \u2014 cliquez pour comprimer',
  'input.compress_click': 'Cliquez pour comprimer le contexte',

  // Header
  'header.history': 'Historique des chats',
  'header.settings': 'Param\u00e8tres',
  'header.new_chat': 'Nouveau chat',

  // Model Selector
  'model.no_providers': 'Aucun fournisseur configur\u00e9.',
  'model.open_settings': 'Ouvrir les param\u00e8tres',
  'model.vision': 'vision',
  'model.vision_title': 'Ce mod\u00e8le prend en charge l\u2019entr\u00e9e image/vision',
  'model.switched': 'Basculé sur {model}',

  // Thinking Indicator
  'thinking.0': 'Ava r\u00e9fl\u00e9chit...',
  'thinking.1': 'Analyse de votre code...',
  'thinking.2': '\u00c9valuation des approches...',
  'thinking.3': 'R\u00e9daction d\u2019une r\u00e9ponse...',

  // Suggestions
  'suggestion.explain': 'Expliquer ce projet',
  'suggestion.explain_prompt': 'Donnez-moi une vue d\u2019ensemble de la structure et de l\u2019architecture de ce projet.',
  'suggestion.bug': 'Trouver un bug',
  'suggestion.bug_prompt': 'Aidez-moi \u00e0 trouver et corriger les bugs dans le fichier actuel.',
  'suggestion.test': '\u00c9crire des tests',
  'suggestion.test_prompt': '\u00c9crivez des tests complets pour le module principal.',
  'suggestion.refactor': 'Refactoriser le code',
  'suggestion.refactor_prompt': 'Sugg\u00e9rez des am\u00e9liorations de refactorisation pour le fichier actuel.',

  // Error Labels
  'error.auth': 'Authentification',
  'error.credits': 'Facturation',
  'error.forbidden': 'Acc\u00e8s refus\u00e9',
  'error.rate_limit': 'Limite de d\u00e9bit',
  'error.model_not_found': 'Erreur de mod\u00e8le',
  'error.bad_request': 'Requ\u00eate invalide',
  'error.server_error': 'Erreur serveur',
  'error.timeout': 'D\u00e9lai d\u00e9pass\u00e9',
  'error.stream_stall': 'Flux interrompu',
  'error.network': 'Erreur r\u00e9seau',
  'error.setup': 'Configuration requise',
  'error.busy': 'Occup\u00e9',
  'error.iterations_exceeded': 'Limite d\u2019it\u00e9rations',
  'error.context_truncated': 'Contexte tronqu\u00e9',
  'error.provider_error': 'Erreur fournisseur',
  'error.unknown': 'Erreur',
  'error.continue': 'Continuer',

  // Tool UI
  'tool.allow': 'Autoriser',
  'tool.always_allow': 'Toujours autoriser',
  'tool.allow_all': 'Tout autoriser',
  'tool.deny': 'Refuser',
  'tool.allow_prompt': 'Autoriser {tool} ?',
  'tool.arguments': 'Arguments',
  'tool.output': 'Sortie',
  'tool.error': 'Erreur',
  'tool.truncated': '... (tronqu\u00e9)',
  'tool.read': 'Lire {file}',
  'tool.write': '\u00c9crire {file}',
  'tool.edit': 'Modifier {file}',
  'tool.find_files': 'Rechercher des fichiers : {pattern}',
  'tool.search': 'Rechercher : {pattern}',
  'tool.run': 'Ex\u00e9cuter : {command}',
  'tool.list_dir': 'Lister {path}',
  'tool.web_search': 'Rechercher : {query}',
  'tool.ask_user': 'Question pour l\u2019utilisateur',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Historique des chats',
  'history.new_chat': '+ Nouveau chat',
  'history.close': 'Fermer',
  'history.search': 'Rechercher des conversations...',
  'history.empty': 'Aucune conversation enregistr\u00e9e.',
  'history.no_match': 'Aucune conversation correspondante.',
  'history.delete_confirm': 'Supprimer ?',
  'history.rename_hint': 'Double-clic pour renommer',
  'history.pin': '\u00c9pingler',
  'history.unpin': 'D\u00e9s\u00e9pingler',
  'history.export_md': 'Exporter en Markdown',
  'history.pinned': '\u00c9pingl\u00e9es',
  'history.just_now': '\u00e0 l\u2019instant',
  'history.minutes_ago': 'il y a {n}min',
  'history.hours_ago': 'il y a {n}h',
  'history.days_ago': 'il y a {n}j',

  // Ask User Card
  'ask.question': 'Question',
  'ask.fallback': 'Ava a une question',
  'ask.placeholder': 'Tapez votre r\u00e9ponse...',
  'ask.submit': 'Envoyer',
  'ask.skip': 'Passer',
  'ask.skipped': 'Pass\u00e9e',

  // Plan Card
  'plan.unavailable': 'Donn\u00e9es du plan indisponibles',
  'plan.prefix': 'Plan : {title}',
  'plan.approved': 'Approuv\u00e9',
  'plan.rejected': 'Rejet\u00e9',
  'plan.goal': 'Objectif',
  'plan.steps': '\u00c9tapes',
  'plan.verification': 'V\u00e9rification',
  'plan.approaches': 'Approches',
  'plan.approve': 'Approuver',
  'plan.reject': 'Rejeter',

  // Todo Card
  'todo.unavailable': 'Liste de t\u00e2ches indisponible',
  'todo.tasks': 'T\u00e2ches',
  'todo.done': '{done}/{total} termin\u00e9es',

  // Status Bar
  'status.in': 'entr\u00e9e',
  'status.out': 'sortie',

  // Plan Card extra
  'plan.pending': 'en attente',

  // App-level
  'app.model_switched': 'Basculé sur {model}',
  'app.context_compressed': 'Contexte comprim\u00e9 : ~{original} \u2192 ~{compressed} tokens',
  'app.continue': 'Reprenez l\u00e0 o\u00f9 vous en \u00e9tiez.',
};
