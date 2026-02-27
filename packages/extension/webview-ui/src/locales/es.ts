/** Webview Spanish (Espa\u00f1ol) strings \u2014 subset of the full locale used by UI components. */
export const esStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Pregunta lo que quieras sobre tu c\u00f3digo.',

  // Input Area
  'input.placeholder.code': '\u00bfQu\u00e9 quieres construir?',
  'input.placeholder.plan': 'Describe lo que quieres planificar...',
  'input.placeholder.chat': 'Haz una pregunta o inicia una conversaci\u00f3n...',
  'input.placeholder.disabled': 'Configura un proveedor para comenzar...',
  'input.placeholder.security': 'Describe qu\u00e9 escanear, o simplemente presiona Enter para una auditor\u00eda completa...',
  'input.mode.code': 'C\u00f3digo',
  'input.mode.plan': 'Plan',
  'input.mode.chat': 'Chat',
  'input.mode.security': 'Seguridad',
  'input.send': 'Enviar (Enter)',
  'input.send_aria': 'Enviar mensaje',
  'input.stop': 'Detener',
  'input.stop_aria': 'Detener a Ava',
  'input.attach': 'Adjuntar imagen',
  'input.attach_image': 'Adjuntar imagen',
  'input.drop_image': 'Suelta la imagen aqu\u00ed',
  'input.compressing': 'Comprimiendo...',
  'input.compress_usage': 'Uso de contexto \u2014 clic para comprimir',
  'input.compress_click': 'Clic para comprimir el contexto',

  // Header
  'header.history': 'Historial de chats',
  'header.settings': 'Configuraci\u00f3n',
  'header.new_chat': 'Nuevo chat',

  // Model Selector
  'model.no_providers': 'No hay proveedores configurados.',
  'model.open_settings': 'Abrir configuraci\u00f3n',
  'model.vision': 'visi\u00f3n',
  'model.vision_title': 'Este modelo soporta entrada de imagen/visi\u00f3n',
  'model.switched': 'Cambiado a {model}',

  // Thinking Indicator
  'thinking.0': 'Ava est\u00e1 pensando...',
  'thinking.1': 'Analizando tu c\u00f3digo...',
  'thinking.2': 'Evaluando enfoques...',
  'thinking.3': 'Elaborando una respuesta...',

  // Suggestions
  'suggestion.explain': 'Explicar este proyecto',
  'suggestion.explain_prompt': 'Dame una visi\u00f3n general de la estructura y arquitectura de este proyecto.',
  'suggestion.bug': 'Buscar un bug',
  'suggestion.bug_prompt': 'Ay\u00fadame a encontrar y corregir errores en el archivo actual.',
  'suggestion.test': 'Escribir tests',
  'suggestion.test_prompt': 'Escribe tests completos para el m\u00f3dulo principal.',
  'suggestion.refactor': 'Refactorizar c\u00f3digo',
  'suggestion.refactor_prompt': 'Sugiere mejoras de refactorizaci\u00f3n para el archivo actual.',

  // Error Labels
  'error.auth': 'Autenticaci\u00f3n',
  'error.credits': 'Facturaci\u00f3n',
  'error.forbidden': 'Acceso denegado',
  'error.rate_limit': 'L\u00edmite de tasa',
  'error.model_not_found': 'Error de modelo',
  'error.bad_request': 'Solicitud inv\u00e1lida',
  'error.server_error': 'Error del servidor',
  'error.timeout': 'Tiempo agotado',
  'error.stream_stall': 'Transmisi\u00f3n detenida',
  'error.network': 'Error de red',
  'error.setup': 'Configuraci\u00f3n requerida',
  'error.busy': 'Ocupado',
  'error.iterations_exceeded': 'L\u00edmite de iteraciones',
  'error.context_truncated': 'Contexto truncado',
  'error.provider_error': 'Error del proveedor',
  'error.unknown': 'Error',
  'error.continue': 'Continuar',

  // Tool UI
  'tool.allow': 'Permitir',
  'tool.always_allow': 'Permitir siempre',
  'tool.allow_all': 'Permitir todo',
  'tool.deny': 'Denegar',
  'tool.allow_prompt': '\u00bfPermitir {tool}?',
  'tool.arguments': 'Argumentos',
  'tool.output': 'Salida',
  'tool.error': 'Error',
  'tool.truncated': '... (truncado)',
  'tool.read': 'Leer {file}',
  'tool.write': 'Escribir {file}',
  'tool.edit': 'Editar {file}',
  'tool.find_files': 'Buscar archivos: {pattern}',
  'tool.search': 'Buscar: {pattern}',
  'tool.run': 'Ejecutar: {command}',
  'tool.list_dir': 'Listar {path}',
  'tool.web_search': 'Buscar: {query}',
  'tool.ask_user': 'Pregunta para el usuario',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Historial de chats',
  'history.new_chat': '+ Nuevo chat',
  'history.close': 'Cerrar',
  'history.search': 'Buscar conversaciones...',
  'history.empty': 'A\u00fan no hay conversaciones guardadas.',
  'history.no_match': 'No hay conversaciones que coincidan.',
  'history.delete_confirm': '\u00bfEliminar?',
  'history.rename_hint': 'Doble clic para renombrar',
  'history.pin': 'Fijar',
  'history.unpin': 'Desfijar',
  'history.export_md': 'Exportar como Markdown',
  'history.pinned': 'Fijadas',
  'history.just_now': 'ahora mismo',
  'history.minutes_ago': 'hace {n}m',
  'history.hours_ago': 'hace {n}h',
  'history.days_ago': 'hace {n}d',

  // Ask User Card
  'ask.question': 'Pregunta',
  'ask.fallback': 'Ava tiene una pregunta',
  'ask.placeholder': 'Escribe tu respuesta...',
  'ask.submit': 'Enviar',
  'ask.skip': 'Omitir',
  'ask.skipped': 'Omitida',

  // Plan Card
  'plan.unavailable': 'Datos del plan no disponibles',
  'plan.prefix': 'Plan: {title}',
  'plan.approved': 'Aprobado',
  'plan.rejected': 'Rechazado',
  'plan.goal': 'Objetivo',
  'plan.steps': 'Pasos',
  'plan.verification': 'Verificaci\u00f3n',
  'plan.approaches': 'Enfoques',
  'plan.approve': 'Aprobar',
  'plan.reject': 'Rechazar',

  // Todo Card
  'todo.unavailable': 'Lista de tareas no disponible',
  'todo.tasks': 'Tareas',
  'todo.done': '{done}/{total} completadas',

  // Status Bar
  'status.in': 'entrada',
  'status.out': 'salida',

  // Plan Card extra
  'plan.pending': 'pendiente',

  // App-level
  'app.model_switched': 'Cambiado a {model}',
  'app.context_compressed': 'Contexto comprimido: ~{original} \u2192 ~{compressed} tokens',
  'app.continue': 'Contin\u00faa donde lo dejaste.',
};
