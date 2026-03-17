/** Webview Korean (ko) strings */
export const koStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': '코드에 대해 무엇이든 물어보세요.',
  'welcome.tagline': '45개 도구 · 7개 공급자 · 2개 무료 모델 · 20개 언어',

  // Welcome — Setup
  'welcome.setup_title': '시작하기 — API 키 추가',
  'welcome.setup_desc': '공급자 API 키를 추가하여 Ava를 활성화하세요. GLM-4.5 Flash와 Codestral은 완전 무료입니다 — 신용카드 불필요.',
  'welcome.setup_cta': '설정 열기',
  'welcome.ready_with': '준비 완료:',

  // Welcome — Sections
  'welcome.quick_start': '빠른 시작',
  'welcome.capabilities': 'Ava가 할 수 있는 것',
  'welcome.modes': '모드',
  'welcome.footer': '오픈 소스 · 당신의 키, 당신의 데이터 · 개인정보 보호 최우선',

  // Welcome — Capabilities
  'welcome.cap.files': '파일 읽기 및 쓰기',
  'welcome.cap.files_desc': '프로젝트의 모든 파일을 생성, 편집, 관리',
  'welcome.cap.search': '검색 및 탐색',
  'welcome.cap.search_desc': '파일, 심볼 검색 및 코드베이스 전체 grep',
  'welcome.cap.terminal': '명령 실행',
  'welcome.cap.terminal_desc': '셸 명령과 스크립트를 직접 실행',
  'welcome.cap.web': '웹 & API',
  'welcome.cap.web_desc': '웹 검색, HTTP 요청, 페이지 탐색',
  'welcome.cap.security': '보안 감사',
  'welcome.cap.security_desc': '취약점 및 보안 문제 스캔',
  'welcome.cap.memory': '영구 메모리',
  'welcome.cap.memory_desc': '대화 간 컨텍스트를 기억',

  // Welcome — Modes
  'welcome.mode.code_desc': '모든 도구를 갖춘 전체 에이전트',
  'welcome.mode.plan_desc': '아키텍처 및 계획',
  'welcome.mode.chat_desc': '토론만',
  'welcome.mode.security_desc': '보안 스캔',
  'welcome.mode.teach': '학습',
  'welcome.mode.teach_desc': 'Ava가 개인 튜터가 됩니다',

  // Input Area
  'input.placeholder.code': '무엇을 만들고 싶으신가요?',
  'input.placeholder.plan': '계획하고 싶은 내용을 설명해 주세요...',
  'input.placeholder.chat': '질문하거나 토론을 시작하세요...',
  'input.placeholder.disabled': '먼저 공급자를 설정해 주세요...',
  'input.placeholder.security': '스캔할 내용을 설명하거나, Enter를 눌러 전체 감사를 실행하세요...',
  'input.placeholder.teach': '무엇을 배우고 싶으세요?',
  'input.mode.code': '작업',
  'input.mode.plan': '계획',
  'input.mode.chat': '채팅',
  'input.mode.teach': '학습',
  'input.mode.brainstorm': '브레인스토밍',
  'input.placeholder.brainstorm': '무엇을 탐구하고 싶으세요?',
  'input.mode.security': '보안',
  'input.send': '전송 (Enter)',
  'input.send_aria': '메시지 전송',
  'input.stop': '중지',
  'input.stop_aria': 'Ava 중지',
  'input.attach': '이미지 첨부',
  'input.attach_image': '이미지 첨부',
  'input.drop_image': '여기에 이미지를 놓으세요',
  'input.compressing': '압축 중...',
  'input.compress_usage': '컨텍스트 사용량 \u2014 클릭하여 압축',
  'input.compress_click': '클릭하여 컨텍스트 압축',

  // Header
  'header.history': '대화 기록',
  'header.settings': '설정',
  'header.new_chat': '새 대화',

  // Model Selector
  'model.no_providers': '설정된 공급자가 없습니다.',
  'model.open_settings': '설정 열기',
  'model.vision': '비전',
  'model.vision_title': '이 모델은 이미지/비전 입력을 지원합니다',
  'model.switched': '{model}(으)로 전환되었습니다',

  // Thinking Indicator
  'thinking.0': 'Ava가 생각하고 있습니다...',
  'thinking.1': '코드를 분석하고 있습니다...',
  'thinking.2': '접근 방식을 검토하고 있습니다...',
  'thinking.3': '응답을 작성하고 있습니다...',

  // Suggestions
  'suggestion.explain': '코드베이스 설명',
  'suggestion.explain_prompt': '이 프로젝트의 구조와 아키텍처를 개괄적으로 설명해 주세요.',
  'suggestion.bug': '버그 찾기',
  'suggestion.bug_prompt': '현재 파일에서 버그를 찾아 수정해 주세요.',
  'suggestion.test': '테스트 작성',
  'suggestion.test_prompt': '메인 모듈에 대한 포괄적인 테스트를 작성해 주세요.',
  'suggestion.refactor': '코드 리팩터링',
  'suggestion.refactor_prompt': '현재 파일의 리팩터링 개선 사항을 제안해 주세요.',

  // Error Labels
  'error.auth': '인증',
  'error.credits': '결제',
  'error.forbidden': '접근 거부',
  'error.rate_limit': '요청 제한',
  'error.model_not_found': '모델 오류',
  'error.bad_request': '잘못된 요청',
  'error.server_error': '서버 오류',
  'error.timeout': '시간 초과',
  'error.stream_stall': '스트림 중단',
  'error.network': '네트워크 오류',
  'error.setup': '설정 필요',
  'error.busy': '처리 중',
  'error.iterations_exceeded': '반복 제한',
  'error.context_truncated': '컨텍스트 잘림',
  'error.provider_error': '공급자 오류',
  'error.unknown': '오류',
  'error.continue': '계속',

  // Tool UI
  'tool.allow': '허용',
  'tool.always_allow': '항상 허용',
  'tool.allow_all': '모두 허용',
  'tool.deny': '거부',
  'tool.allow_prompt': '{tool}을(를) 허용하시겠습니까?',
  'tool.arguments': '인수',
  'tool.output': '출력',
  'tool.error': '오류',
  'tool.truncated': '... (잘림)',
  'tool.read': '{file} 읽기',
  'tool.write': '{file} 쓰기',
  'tool.edit': '{file} 편집',
  'tool.find_files': '파일 찾기: {pattern}',
  'tool.search': '검색: {pattern}',
  'tool.run': '실행: {command}',
  'tool.list_dir': '{path} 목록',
  'tool.web_search': '검색: {query}',
  'tool.ask_user': '사용자에게 질문',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': '대화 기록',
  'history.new_chat': '+ 새 대화',
  'history.close': '닫기',
  'history.search': '대화 검색...',
  'history.empty': '저장된 대화가 없습니다.',
  'history.no_match': '일치하는 대화가 없습니다.',
  'history.delete_confirm': '삭제하시겠습니까?',
  'history.rename_hint': '더블클릭하여 이름 변경',
  'history.pin': '고정',
  'history.unpin': '고정 해제',
  'history.export_md': 'Markdown으로 내보내기',
  'history.pinned': '고정됨',
  'history.just_now': '방금 전',
  'history.minutes_ago': '{n}분 전',
  'history.hours_ago': '{n}시간 전',
  'history.days_ago': '{n}일 전',

  // Ask User Card
  'ask.question': '질문',
  'ask.fallback': 'Ava가 질문이 있습니다',
  'ask.placeholder': '응답을 입력하세요...',
  'ask.submit': '제출',
  'ask.skip': '건너뛰기',
  'ask.skipped': '건너뜀',

  // Plan Card
  'plan.unavailable': '계획 데이터를 사용할 수 없습니다',
  'plan.prefix': '계획: {title}',
  'plan.approved': '승인됨',
  'plan.rejected': '거부됨',
  'plan.goal': '목표',
  'plan.steps': '단계',
  'plan.verification': '검증',
  'plan.approaches': '접근 방식',
  'plan.approve': '승인',
  'plan.reject': '거부',

  // Todo Card
  'todo.unavailable': '작업 목록을 사용할 수 없습니다',
  'todo.tasks': '작업',
  'todo.done': '{done}/{total} 완료',

  // Status Bar
  'status.in': '입력',
  'status.out': '출력',

  // Plan Card extra
  'plan.pending': '대기 중',

  // App-level
  'app.model_switched': '{model}(으)로 전환되었습니다',
  'app.context_compressed': '컨텍스트 압축 완료: ~{original} \u2192 ~{compressed} tokens',
  'app.continue': '중단된 곳에서 계속합니다.',
};
