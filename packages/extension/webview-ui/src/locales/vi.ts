/** Webview Vietnamese (vi) strings */
export const viStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'Hỏi bất kỳ điều gì về mã nguồn của bạn.',
  'welcome.tagline': '24 công cụ · 7 nhà cung cấp · 2 mô hình miễn phí · 20 ngôn ngữ',

  // Welcome — Setup
  'welcome.setup_title': 'Bắt đầu — Thêm khóa API',
  'welcome.setup_desc': 'Thêm khóa API của nhà cung cấp để mở khóa Ava. GLM-4.5 Flash và Codestral hoàn toàn miễn phí — không cần thẻ tín dụng.',
  'welcome.setup_cta': 'Mở cài đặt',
  'welcome.ready_with': 'Sẵn sàng với',

  // Welcome — Sections
  'welcome.quick_start': 'Bắt đầu nhanh',
  'welcome.capabilities': 'Ava có thể làm gì',
  'welcome.modes': 'Chế độ',
  'welcome.footer': 'Mã nguồn mở · Khóa của bạn, dữ liệu của bạn · Quyền riêng tư là trên hết',

  // Welcome — Capabilities
  'welcome.cap.files': 'Đọc & ghi tệp',
  'welcome.cap.files_desc': 'Tạo, chỉnh sửa và quản lý bất kỳ tệp nào trong dự án',
  'welcome.cap.search': 'Tìm kiếm & điều hướng',
  'welcome.cap.search_desc': 'Tìm tệp, ký hiệu và grep trong toàn bộ codebase',
  'welcome.cap.terminal': 'Chạy lệnh',
  'welcome.cap.terminal_desc': 'Thực thi lệnh shell và script trực tiếp',
  'welcome.cap.web': 'Web & API',
  'welcome.cap.web_desc': 'Tìm kiếm web, gửi yêu cầu HTTP, duyệt trang',
  'welcome.cap.security': 'Kiểm tra bảo mật',
  'welcome.cap.security_desc': 'Quét lỗ hổng và vấn đề bảo mật',
  'welcome.cap.memory': 'Bộ nhớ bền vững',
  'welcome.cap.memory_desc': 'Ghi nhớ ngữ cảnh giữa các cuộc trò chuyện',

  // Welcome — Modes
  'welcome.mode.code_desc': 'Agent đầy đủ với tất cả công cụ',
  'welcome.mode.plan_desc': 'Kiến trúc & lập kế hoạch',
  'welcome.mode.chat_desc': 'Chỉ thảo luận',
  'welcome.mode.security_desc': 'Quét bảo mật',
  'welcome.mode.teach': 'Học',
  'welcome.mode.teach_desc': 'Ava trở thành gia sư riêng của bạn',

  // Input Area
  'input.placeholder.code': 'Bạn muốn xây dựng gì?',
  'input.placeholder.plan': 'Mô tả những gì bạn muốn lên kế hoạch...',
  'input.placeholder.chat': 'Đặt câu hỏi hoặc bắt đầu thảo luận...',
  'input.placeholder.disabled': 'Hãy cấu hình nhà cung cấp trước...',
  'input.placeholder.security': 'Mô tả nội dung cần quét, hoặc nhấn Enter để kiểm tra toàn bộ...',
  'input.placeholder.teach': 'Bạn muốn học gì?',
  'input.mode.code': 'Công việc',
  'input.mode.plan': 'Kế hoạch',
  'input.mode.chat': 'Trò chuyện',
  'input.mode.teach': 'Học',
  'input.mode.security': 'Bảo mật',
  'input.send': 'Gửi (Enter)',
  'input.send_aria': 'Gửi tin nhắn',
  'input.stop': 'Dừng',
  'input.stop_aria': 'Dừng Ava',
  'input.attach': 'Đính kèm hình ảnh',
  'input.attach_image': 'Đính kèm hình ảnh',
  'input.drop_image': 'Thả hình ảnh vào đây',
  'input.compressing': 'Đang nén...',
  'input.compress_usage': 'Mức sử dụng ngữ cảnh \u2014 nhấp để nén',
  'input.compress_click': 'Nhấp để nén ngữ cảnh',

  // Header
  'header.history': 'Lịch sử trò chuyện',
  'header.settings': 'Cài đặt',
  'header.new_chat': 'Cuộc trò chuyện mới',

  // Model Selector
  'model.no_providers': 'Chưa cấu hình nhà cung cấp nào.',
  'model.open_settings': 'Mở cài đặt',
  'model.vision': 'thị giác',
  'model.vision_title': 'Mô hình này hỗ trợ đầu vào hình ảnh/thị giác',
  'model.switched': 'Đã chuyển sang {model}',

  // Thinking Indicator
  'thinking.0': 'Ava đang suy nghĩ...',
  'thinking.1': 'Đang phân tích mã nguồn của bạn...',
  'thinking.2': 'Đang xem xét các phương pháp...',
  'thinking.3': 'Đang soạn câu trả lời...',

  // Suggestions
  'suggestion.explain': 'Giải thích codebase',
  'suggestion.explain_prompt': 'Cho tôi cái nhìn tổng quan về cấu trúc và kiến trúc dự án.',
  'suggestion.bug': 'Tìm lỗi',
  'suggestion.bug_prompt': 'Giúp tôi tìm và sửa lỗi trong tệp hiện tại.',
  'suggestion.test': 'Viết kiểm thử',
  'suggestion.test_prompt': 'Viết kiểm thử toàn diện cho module chính.',
  'suggestion.refactor': 'Tái cấu trúc mã',
  'suggestion.refactor_prompt': 'Đề xuất cải tiến tái cấu trúc cho tệp hiện tại.',

  // Error Labels
  'error.auth': 'Xác thực',
  'error.credits': 'Thanh toán',
  'error.forbidden': 'Từ chối truy cập',
  'error.rate_limit': 'Giới hạn yêu cầu',
  'error.model_not_found': 'Lỗi mô hình',
  'error.bad_request': 'Yêu cầu không hợp lệ',
  'error.server_error': 'Lỗi máy chủ',
  'error.timeout': 'Hết thời gian',
  'error.stream_stall': 'Luồng bị treo',
  'error.network': 'Lỗi mạng',
  'error.setup': 'Cần cài đặt',
  'error.busy': 'Đang bận',
  'error.iterations_exceeded': 'Vượt giới hạn lặp',
  'error.context_truncated': 'Ngữ cảnh bị cắt',
  'error.provider_error': 'Lỗi nhà cung cấp',
  'error.unknown': 'Lỗi',
  'error.continue': 'Tiếp tục',

  // Tool UI
  'tool.allow': 'Cho phép',
  'tool.always_allow': 'Luôn cho phép',
  'tool.allow_all': 'Cho phép tất cả',
  'tool.deny': 'Từ chối',
  'tool.allow_prompt': 'Cho phép {tool}?',
  'tool.arguments': 'Tham số',
  'tool.output': 'Đầu ra',
  'tool.error': 'Lỗi',
  'tool.truncated': '... (đã cắt ngắn)',
  'tool.read': 'Đọc {file}',
  'tool.write': 'Ghi {file}',
  'tool.edit': 'Sửa {file}',
  'tool.find_files': 'Tìm tệp: {pattern}',
  'tool.search': 'Tìm kiếm: {pattern}',
  'tool.run': 'Chạy: {command}',
  'tool.list_dir': 'Liệt kê {path}',
  'tool.web_search': 'Tìm kiếm: {query}',
  'tool.ask_user': 'Hỏi người dùng',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'Lịch sử trò chuyện',
  'history.new_chat': '+ Cuộc trò chuyện mới',
  'history.close': 'Đóng',
  'history.search': 'Tìm kiếm cuộc trò chuyện...',
  'history.empty': 'Chưa có cuộc trò chuyện nào được lưu.',
  'history.no_match': 'Không tìm thấy cuộc trò chuyện phù hợp.',
  'history.delete_confirm': 'Xóa?',
  'history.rename_hint': 'Nhấp đúp để đổi tên',
  'history.pin': 'Ghim',
  'history.unpin': 'Bỏ ghim',
  'history.export_md': 'Xuất dạng Markdown',
  'history.pinned': 'Đã ghim',
  'history.just_now': 'vừa xong',
  'history.minutes_ago': '{n} phút trước',
  'history.hours_ago': '{n} giờ trước',
  'history.days_ago': '{n} ngày trước',

  // Ask User Card
  'ask.question': 'Câu hỏi',
  'ask.fallback': 'Ava có một câu hỏi',
  'ask.placeholder': 'Nhập phản hồi của bạn...',
  'ask.submit': 'Gửi',
  'ask.skip': 'Bỏ qua',
  'ask.skipped': 'Đã bỏ qua',

  // Plan Card
  'plan.unavailable': 'Không có dữ liệu kế hoạch',
  'plan.prefix': 'Kế hoạch: {title}',
  'plan.approved': 'Đã duyệt',
  'plan.rejected': 'Đã từ chối',
  'plan.goal': 'Mục tiêu',
  'plan.steps': 'Các bước',
  'plan.verification': 'Xác minh',
  'plan.approaches': 'Phương pháp',
  'plan.approve': 'Duyệt',
  'plan.reject': 'Từ chối',

  // Todo Card
  'todo.unavailable': 'Danh sách tác vụ không khả dụng',
  'todo.tasks': 'Tác vụ',
  'todo.done': '{done}/{total} hoàn thành',

  // Status Bar
  'status.in': 'vào',
  'status.out': 'ra',

  // Plan Card extra
  'plan.pending': 'chờ xử lý',

  // App-level
  'app.model_switched': 'Đã chuyển sang {model}',
  'app.context_compressed': 'Ngữ cảnh đã nén: ~{original} \u2192 ~{compressed} tokens',
  'app.continue': 'Tiếp tục từ nơi bạn đã dừng lại.',
};
