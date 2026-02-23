/** Webview Portuguese (Portugu\u00eas) strings \u2014 subset of the full locale used by UI components. */
export const ptStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Pergunte qualquer coisa sobre o seu c\u00f3digo.',

  // Input Area
  'input.placeholder.code': 'O que voc\u00ea quer construir?',
  'input.placeholder.plan': 'Descreva o que voc\u00ea quer planejar...',
  'input.placeholder.chat': 'Fa\u00e7a uma pergunta ou inicie uma conversa...',
  'input.placeholder.disabled': 'Configure um provedor para come\u00e7ar...',
  'input.mode.code': 'C\u00f3digo',
  'input.mode.plan': 'Plano',
  'input.mode.chat': 'Chat',
  'input.send': 'Enviar (Enter)',
  'input.send_aria': 'Enviar mensagem',
  'input.stop': 'Parar',
  'input.stop_aria': 'Parar Ava',
  'input.attach': 'Anexar imagem',
  'input.attach_image': 'Anexar imagem',
  'input.drop_image': 'Solte a imagem aqui',
  'input.compressing': 'Comprimindo...',
  'input.compress_usage': 'Uso de contexto \u2014 clique para comprimir',
  'input.compress_click': 'Clique para comprimir o contexto',

  // Header
  'header.history': 'Hist\u00f3rico de chats',
  'header.settings': 'Configura\u00e7\u00f5es',
  'header.new_chat': 'Novo chat',

  // Model Selector
  'model.no_providers': 'Nenhum provedor configurado.',
  'model.open_settings': 'Abrir configura\u00e7\u00f5es',
  'model.vision': 'vis\u00e3o',
  'model.vision_title': 'Este modelo suporta entrada de imagem/vis\u00e3o',
  'model.switched': 'Alterado para {model}',

  // Thinking Indicator
  'thinking.0': 'Ava est\u00e1 pensando...',
  'thinking.1': 'Analisando seu c\u00f3digo...',
  'thinking.2': 'Considerando abordagens...',
  'thinking.3': 'Elaborando uma resposta...',

  // Suggestions
  'suggestion.explain': 'Explicar este projeto',
  'suggestion.explain_prompt': 'Me d\u00ea uma vis\u00e3o geral da estrutura e arquitetura deste projeto.',
  'suggestion.bug': 'Encontrar um bug',
  'suggestion.bug_prompt': 'Me ajude a encontrar e corrigir bugs no arquivo atual.',
  'suggestion.test': 'Escrever testes',
  'suggestion.test_prompt': 'Escreva testes abrangentes para o m\u00f3dulo principal.',
  'suggestion.refactor': 'Refatorar c\u00f3digo',
  'suggestion.refactor_prompt': 'Sugira melhorias de refatora\u00e7\u00e3o para o arquivo atual.',

  // Error Labels
  'error.auth': 'Autentica\u00e7\u00e3o',
  'error.credits': 'Faturamento',
  'error.forbidden': 'Acesso negado',
  'error.rate_limit': 'Limite de requisi\u00e7\u00f5es',
  'error.model_not_found': 'Erro de modelo',
  'error.bad_request': 'Requisi\u00e7\u00e3o inv\u00e1lida',
  'error.server_error': 'Erro do servidor',
  'error.timeout': 'Tempo esgotado',
  'error.stream_stall': 'Transmiss\u00e3o interrompida',
  'error.network': 'Erro de rede',
  'error.setup': 'Configura\u00e7\u00e3o necess\u00e1ria',
  'error.busy': 'Ocupado',
  'error.iterations_exceeded': 'Limite de itera\u00e7\u00f5es',
  'error.context_truncated': 'Contexto truncado',
  'error.provider_error': 'Erro do provedor',
  'error.unknown': 'Erro',
  'error.continue': 'Continuar',

  // Tool UI
  'tool.allow': 'Permitir',
  'tool.always_allow': 'Permitir sempre',
  'tool.allow_all': 'Permitir tudo',
  'tool.deny': 'Negar',
  'tool.allow_prompt': 'Permitir {tool}?',
  'tool.arguments': 'Argumentos',
  'tool.output': 'Sa\u00edda',
  'tool.error': 'Erro',
  'tool.truncated': '... (truncado)',
  'tool.read': 'Ler {file}',
  'tool.write': 'Escrever {file}',
  'tool.edit': 'Editar {file}',
  'tool.find_files': 'Buscar arquivos: {pattern}',
  'tool.search': 'Pesquisar: {pattern}',
  'tool.run': 'Executar: {command}',
  'tool.list_dir': 'Listar {path}',
  'tool.web_search': 'Pesquisar: {query}',
  'tool.ask_user': 'Pergunta para o usu\u00e1rio',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Hist\u00f3rico de chats',
  'history.new_chat': '+ Novo chat',
  'history.close': 'Fechar',
  'history.search': 'Pesquisar conversas...',
  'history.empty': 'Nenhuma conversa salva ainda.',
  'history.no_match': 'Nenhuma conversa encontrada.',
  'history.delete_confirm': 'Excluir?',
  'history.rename_hint': 'Clique duplo para renomear',
  'history.pin': 'Fixar',
  'history.unpin': 'Desafixar',
  'history.export_md': 'Exportar como Markdown',
  'history.pinned': 'Fixadas',
  'history.just_now': 'agora mesmo',
  'history.minutes_ago': '{n}min atr\u00e1s',
  'history.hours_ago': '{n}h atr\u00e1s',
  'history.days_ago': '{n}d atr\u00e1s',

  // Ask User Card
  'ask.question': 'Pergunta',
  'ask.fallback': 'Ava tem uma pergunta',
  'ask.placeholder': 'Digite sua resposta...',
  'ask.submit': 'Enviar',
  'ask.skip': 'Pular',
  'ask.skipped': 'Pulada',

  // Plan Card
  'plan.unavailable': 'Dados do plano indispon\u00edveis',
  'plan.prefix': 'Plano: {title}',
  'plan.approved': 'Aprovado',
  'plan.rejected': 'Rejeitado',
  'plan.goal': 'Objetivo',
  'plan.steps': 'Passos',
  'plan.verification': 'Verifica\u00e7\u00e3o',
  'plan.approaches': 'Abordagens',
  'plan.approve': 'Aprovar',
  'plan.reject': 'Rejeitar',

  // Todo Card
  'todo.unavailable': 'Lista de tarefas indispon\u00edvel',
  'todo.tasks': 'Tarefas',
  'todo.done': '{done}/{total} conclu\u00eddas',

  // Status Bar
  'status.in': 'entrada',
  'status.out': 'sa\u00edda',

  // Plan Card extra
  'plan.pending': 'pendente',

  // App-level
  'app.model_switched': 'Alterado para {model}',
  'app.context_compressed': 'Contexto comprimido: ~{original} \u2192 ~{compressed} tokens',
  'app.continue': 'Continue de onde parou.',
};
