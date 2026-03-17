/** Webview Thai (ไทย) strings — subset of the full locale used by UI components. */
export const thStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'ถามอะไรก็ได้เกี่ยวกับโค้ดของคุณ',
  'welcome.tagline': '45 เครื่องมือ · 7 ผู้ให้บริการ · 2 โมเดลฟรี · 20 ภาษา',

  // Welcome — Setup
  'welcome.setup_title': 'เริ่มต้น — เพิ่มคีย์ API',
  'welcome.setup_desc': 'เพิ่มคีย์ API ของผู้ให้บริการเพื่อปลดล็อก Ava GLM-4.5 Flash และ Codestral ฟรีทั้งหมด — ไม่ต้องใช้บัตรเครดิต',
  'welcome.setup_cta': 'เปิดการตั้งค่า',
  'welcome.ready_with': 'พร้อมใช้งานกับ',

  // Welcome — Sections
  'welcome.quick_start': 'เริ่มต้นอย่างรวดเร็ว',
  'welcome.capabilities': 'สิ่งที่ Ava ทำได้',
  'welcome.modes': 'โหมด',
  'welcome.footer': 'โอเพนซอร์ส · คีย์ของคุณ ข้อมูลของคุณ · ความเป็นส่วนตัวมาก่อน',

  // Welcome — Capabilities
  'welcome.cap.files': 'อ่านและเขียนไฟล์',
  'welcome.cap.files_desc': 'สร้าง แก้ไข และจัดการไฟล์ใดก็ได้ในโปรเจกต์ของคุณ',
  'welcome.cap.search': 'ค้นหาและนำทาง',
  'welcome.cap.search_desc': 'ค้นหาไฟล์ สัญลักษณ์ และ grep ทั่วทั้งโค้ดเบส',
  'welcome.cap.terminal': 'รันคำสั่ง',
  'welcome.cap.terminal_desc': 'รันคำสั่ง shell และสคริปต์โดยตรง',
  'welcome.cap.web': 'เว็บและ API',
  'welcome.cap.web_desc': 'ค้นหาเว็บ ส่งคำขอ HTTP เรียกดูหน้าเว็บ',
  'welcome.cap.security': 'ตรวจสอบความปลอดภัย',
  'welcome.cap.security_desc': 'สแกนหาช่องโหว่และปัญหาด้านความปลอดภัย',
  'welcome.cap.memory': 'หน่วยความจำถาวร',
  'welcome.cap.memory_desc': 'จดจำบริบทข้ามบทสนทนา',

  // Welcome — Modes
  'welcome.mode.code_desc': 'เอเจนต์เต็มรูปแบบพร้อมเครื่องมือทั้งหมด',
  'welcome.mode.plan_desc': 'สถาปัตยกรรมและการวางแผน',
  'welcome.mode.chat_desc': 'สนทนาเท่านั้น',
  'welcome.mode.security_desc': 'สแกนความปลอดภัย',
  'welcome.mode.teach': 'เรียนรู้',
  'welcome.mode.teach_desc': 'Ava กลายเป็นติวเตอร์ส่วนตัวของคุณ',

  // Input Area
  'input.placeholder.code': 'คุณต้องการสร้างอะไร?',
  'input.placeholder.plan': 'อธิบายสิ่งที่คุณต้องการวางแผน...',
  'input.placeholder.chat': 'ถามคำถามหรือเริ่มพูดคุย...',
  'input.placeholder.disabled': 'ตั้งค่าผู้ให้บริการเพื่อเริ่มต้น...',
  'input.placeholder.security': 'อธิบายสิ่งที่ต้องการสแกน หรือกด Enter เพื่อตรวจสอบทั้งหมด...',
  'input.placeholder.teach': 'คุณอยากเรียนรู้อะไร?',
  'input.mode.code': 'งาน',
  'input.mode.plan': 'แผน',
  'input.mode.chat': 'แชท',
  'input.mode.teach': 'เรียนรู้',
  'input.mode.brainstorm': 'ระดมสมอง',
  'input.placeholder.brainstorm': 'คุณต้องการสำรวจอะไร?',
  'input.mode.security': 'ความปลอดภัย',
  'input.send': 'ส่ง (Enter)',
  'input.send_aria': 'ส่งข้อความ',
  'input.stop': 'หยุด',
  'input.stop_aria': 'หยุด Ava',
  'input.attach': 'แนบรูปภาพ',
  'input.attach_image': 'แนบรูปภาพ',
  'input.drop_image': 'วางรูปภาพที่นี่',
  'input.compressing': 'กำลังบีบอัด...',
  'input.compress_usage': 'การใช้บริบท \u2014 คลิกเพื่อบีบอัด',
  'input.compress_click': 'คลิกเพื่อบีบอัดบริบท',

  // Header
  'header.history': 'ประวัติแชท',
  'header.settings': 'การตั้งค่า',
  'header.new_chat': 'แชทใหม่',

  // Model Selector
  'model.no_providers': 'ไม่มีผู้ให้บริการที่ตั้งค่าไว้',
  'model.open_settings': 'เปิดการตั้งค่า',
  'model.vision': 'vision',
  'model.vision_title': 'โมเดลนี้รองรับการป้อนข้อมูลรูปภาพ',
  'model.switched': 'เปลี่ยนเป็น {model} แล้ว',

  // Thinking Indicator
  'thinking.0': 'Ava กำลังคิด...',
  'thinking.1': 'กำลังวิเคราะห์โค้ดของคุณ...',
  'thinking.2': 'กำลังพิจารณาแนวทาง...',
  'thinking.3': 'กำลังเรียบเรียงคำตอบ...',

  // Suggestions
  'suggestion.explain': 'อธิบายโค้ดเบสนี้',
  'suggestion.explain_prompt': 'ให้ภาพรวมระดับสูงของโครงสร้างและสถาปัตยกรรมของโปรเจกต์นี้',
  'suggestion.bug': 'หาบั๊ก',
  'suggestion.bug_prompt': 'ช่วยหาและแก้ไขบั๊กในไฟล์ปัจจุบัน',
  'suggestion.test': 'เขียนเทสต์',
  'suggestion.test_prompt': 'เขียนเทสต์ที่ครอบคลุมสำหรับโมดูลหลัก',
  'suggestion.refactor': 'รีแฟกเตอร์โค้ด',
  'suggestion.refactor_prompt': 'แนะนำการปรับปรุงรีแฟกเตอร์สำหรับไฟล์ปัจจุบัน',

  // Error Labels
  'error.auth': 'การยืนยันตัวตน',
  'error.credits': 'การเรียกเก็บเงิน',
  'error.forbidden': 'การเข้าถึงถูกปฏิเสธ',
  'error.rate_limit': 'จำกัดอัตรา',
  'error.model_not_found': 'ข้อผิดพลาดโมเดล',
  'error.bad_request': 'คำขอไม่ถูกต้อง',
  'error.server_error': 'ข้อผิดพลาดเซิร์ฟเวอร์',
  'error.timeout': 'หมดเวลา',
  'error.stream_stall': 'สตรีมหยุด',
  'error.network': 'ข้อผิดพลาดเครือข่าย',
  'error.setup': 'ต้องตั้งค่าก่อน',
  'error.busy': 'กำลังทำงาน',
  'error.iterations_exceeded': 'ถึงขีดจำกัดรอบ',
  'error.context_truncated': 'บริบทถูกตัด',
  'error.provider_error': 'ข้อผิดพลาดผู้ให้บริการ',
  'error.unknown': 'ข้อผิดพลาด',
  'error.continue': 'ดำเนินการต่อ',

  // Tool UI
  'tool.allow': 'อนุญาต',
  'tool.always_allow': 'อนุญาตเสมอ',
  'tool.allow_all': 'อนุญาตทั้งหมด',
  'tool.deny': 'ปฏิเสธ',
  'tool.allow_prompt': 'อนุญาต {tool}?',
  'tool.arguments': 'อาร์กิวเมนต์',
  'tool.output': 'ผลลัพธ์',
  'tool.error': 'ข้อผิดพลาด',
  'tool.truncated': '... (ถูกตัด)',
  'tool.read': 'อ่าน {file}',
  'tool.write': 'เขียน {file}',
  'tool.edit': 'แก้ไข {file}',
  'tool.find_files': 'ค้นหาไฟล์: {pattern}',
  'tool.search': 'ค้นหา: {pattern}',
  'tool.run': 'รัน: {command}',
  'tool.list_dir': 'แสดงรายการ {path}',
  'tool.web_search': 'ค้นหา: {query}',
  'tool.ask_user': 'คำถามสำหรับผู้ใช้',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'ประวัติแชท',
  'history.new_chat': '+ แชทใหม่',
  'history.close': 'ปิด',
  'history.search': 'ค้นหาบทสนทนา...',
  'history.empty': 'ยังไม่มีบทสนทนาที่บันทึกไว้',
  'history.no_match': 'ไม่พบบทสนทนาที่ตรงกัน',
  'history.delete_confirm': 'ลบ?',
  'history.rename_hint': 'ดับเบิลคลิกเพื่อเปลี่ยนชื่อ',
  'history.pin': 'ปักหมุด',
  'history.unpin': 'เลิกปักหมุด',
  'history.export_md': 'ส่งออกเป็น Markdown',
  'history.pinned': 'ปักหมุดแล้ว',
  'history.just_now': 'เมื่อกี้',
  'history.minutes_ago': '{n} นาทีที่แล้ว',
  'history.hours_ago': '{n} ชั่วโมงที่แล้ว',
  'history.days_ago': '{n} วันที่แล้ว',

  // Ask User Card
  'ask.question': 'คำถาม',
  'ask.fallback': 'Ava มีคำถาม',
  'ask.placeholder': 'พิมพ์คำตอบของคุณ...',
  'ask.submit': 'ส่ง',
  'ask.skip': 'ข้าม',
  'ask.skipped': 'ข้ามแล้ว',

  // Plan Card
  'plan.unavailable': 'ไม่มีข้อมูลแผน',
  'plan.prefix': 'แผน: {title}',
  'plan.approved': 'อนุมัติแล้ว',
  'plan.rejected': 'ปฏิเสธแล้ว',
  'plan.goal': 'เป้าหมาย',
  'plan.steps': 'ขั้นตอน',
  'plan.verification': 'การตรวจสอบ',
  'plan.approaches': 'แนวทาง',
  'plan.approve': 'อนุมัติ',
  'plan.reject': 'ปฏิเสธ',

  // Todo Card
  'todo.unavailable': 'รายการงานไม่พร้อมใช้',
  'todo.tasks': 'งาน',
  'todo.done': '{done}/{total} เสร็จ',

  // Status Bar
  'status.in': 'เข้า',
  'status.out': 'ออก',

  // Plan Card extra
  'plan.pending': 'รอดำเนินการ',

  // App-level
  'app.model_switched': 'เปลี่ยนเป็น {model} แล้ว',
  'app.context_compressed': 'บีบอัดบริบทแล้ว: ~{original} \u2192 ~{compressed} โทเค็น',
  'app.continue': 'ดำเนินการต่อจากที่ค้างไว้',
};
