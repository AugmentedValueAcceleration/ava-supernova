/** Webview Hindi (हिन्दी) strings — subset of the full locale used by UI components. */
export const hiStrings: Record<string, string> = {
  // Welcome / Branding
  'welcome.title': 'Ava | Supernova',
  'welcome.subtitle': 'अपने कोड के बारे में कुछ भी पूछें।',
  'welcome.tagline': '45 टूल · 7 प्रोवाइडर · 2 मुफ़्त मॉडल · 20 भाषाएँ',

  // Welcome — Setup
  'welcome.setup_title': 'शुरू करें — API कुंजी जोड़ें',
  'welcome.setup_desc': '30 लाख मुफ़्त Qwen टोकन के लिए साइन अप करें, या किसी भी प्रोवाइडर की अपनी API कुंजी जोड़ें।',
  'welcome.setup_cta': 'सेटिंग्स खोलें',
  'welcome.ready_with': 'तैयार है',

  // Welcome — Sections
  'welcome.quick_start': 'त्वरित शुरुआत',
  'welcome.capabilities': 'Ava क्या कर सकती है',
  'welcome.modes': 'मोड',
  'welcome.footer': 'ओपन सोर्स · आपकी कुंजियाँ, आपका डेटा · गोपनीयता पहले',

  // Welcome — Capabilities
  'welcome.cap.files': 'फ़ाइलें पढ़ें और लिखें',
  'welcome.cap.files_desc': 'अपने प्रोजेक्ट में कोई भी फ़ाइल बनाएँ, संपादित करें और प्रबंधित करें',
  'welcome.cap.search': 'खोजें और नेविगेट करें',
  'welcome.cap.search_desc': 'फ़ाइलें, सिंबल खोजें और अपने कोडबेस में grep करें',
  'welcome.cap.terminal': 'कमांड चलाएँ',
  'welcome.cap.terminal_desc': 'शेल कमांड और स्क्रिप्ट सीधे चलाएँ',
  'welcome.cap.web': 'वेब और APIs',
  'welcome.cap.web_desc': 'वेब पर खोजें, HTTP अनुरोध करें, पेज ब्राउज़ करें',
  'welcome.cap.security': 'सुरक्षा ऑडिट',
  'welcome.cap.security_desc': 'कमज़ोरियों और सुरक्षा समस्याओं को स्कैन करें',
  'welcome.cap.memory': 'स्थायी मेमोरी',
  'welcome.cap.memory_desc': 'बातचीत के बीच संदर्भ याद रखती है',

  // Welcome — Modes
  'welcome.mode.code_desc': 'सभी टूल के साथ पूर्ण एजेंट',
  'welcome.mode.plan_desc': 'आर्किटेक्चर और प्लानिंग',
  'welcome.mode.chat_desc': 'केवल चर्चा',
  'welcome.mode.security_desc': 'सुरक्षा स्कैनिंग',
  'welcome.mode.teach': 'सीखें',
  'welcome.mode.teach_desc': 'Ava आपकी निजी शिक्षक बन जाती है',

  // Input Area
  'input.placeholder.code': 'आप क्या बनाना चाहते हैं?',
  'input.placeholder.plan': 'बताएँ कि आप क्या प्लान करना चाहते हैं...',
  'input.placeholder.chat': 'कोई सवाल पूछें या चर्चा शुरू करें...',
  'input.placeholder.disabled': 'शुरू करने के लिए एक प्रोवाइडर कॉन्फ़िगर करें...',
  'input.placeholder.security': 'बताएँ कि क्या स्कैन करना है, या पूर्ण ऑडिट के लिए Enter दबाएँ...',
  'input.placeholder.teach': 'आप क्या सीखना चाहते हैं?',
  'input.mode.code': 'कार्य',
  'input.mode.plan': 'प्लान',
  'input.mode.chat': 'चैट',
  'input.mode.teach': 'सीखें',
  'input.mode.brainstorm': 'विचार-मंथन',
  'input.placeholder.brainstorm': 'आप क्या खोजना चाहते हैं?',
  'input.mode.security': 'सुरक्षा',
  'input.send': 'भेजें (Enter)',
  'input.send_aria': 'संदेश भेजें',
  'input.stop': 'रोकें',
  'input.stop_aria': 'Ava को रोकें',
  'input.attach': 'छवि संलग्न करें',
  'input.attach_image': 'छवि संलग्न करें',
  'input.drop_image': 'छवि यहाँ छोड़ें',
  'input.compressing': 'संपीड़ित हो रहा है...',
  'input.compress_usage': 'कॉन्टेक्स्ट उपयोग \u2014 संपीड़ित करने के लिए क्लिक करें',
  'input.compress_click': 'कॉन्टेक्स्ट संपीड़ित करने के लिए क्लिक करें',

  // Header
  'header.history': 'चैट इतिहास',
  'header.settings': 'सेटिंग्स',
  'header.new_chat': 'नई चैट',

  // Model Selector
  'model.no_providers': 'कोई प्रोवाइडर कॉन्फ़िगर नहीं है।',
  'model.open_settings': 'सेटिंग्स खोलें',
  'model.vision': 'vision',
  'model.vision_title': 'यह मॉडल छवि/vision इनपुट सपोर्ट करता है',
  'model.switched': '{model} पर स्विच किया गया',

  // Thinking Indicator
  'thinking.0': 'Ava सोच रही है...',
  'thinking.1': 'आपका कोड विश्लेषण कर रही है...',
  'thinking.2': 'तरीकों पर विचार कर रही है...',
  'thinking.3': 'जवाब तैयार कर रही है...',

  // Suggestions
  'suggestion.explain': 'इस कोडबेस को समझाएँ',
  'suggestion.explain_prompt': 'इस प्रोजेक्ट की संरचना और आर्किटेक्चर का सामान्य अवलोकन दें।',
  'suggestion.bug': 'बग खोजें',
  'suggestion.bug_prompt': 'मौजूदा फ़ाइल में बग खोजने और ठीक करने में मदद करें।',
  'suggestion.test': 'टेस्ट लिखें',
  'suggestion.test_prompt': 'मुख्य मॉड्यूल के लिए व्यापक टेस्ट लिखें।',
  'suggestion.refactor': 'कोड रीफ़ैक्टर करें',
  'suggestion.refactor_prompt': 'मौजूदा फ़ाइल के लिए रीफ़ैक्टरिंग सुधार सुझाएँ।',

  // Error Labels
  'error.auth': 'प्रमाणीकरण',
  'error.credits': 'बिलिंग',
  'error.forbidden': 'पहुँच अस्वीकृत',
  'error.rate_limit': 'दर सीमित',
  'error.model_not_found': 'मॉडल त्रुटि',
  'error.bad_request': 'गलत अनुरोध',
  'error.server_error': 'सर्वर त्रुटि',
  'error.timeout': 'समय समाप्त',
  'error.stream_stall': 'स्ट्रीम रुकी',
  'error.network': 'नेटवर्क त्रुटि',
  'error.setup': 'सेटअप आवश्यक',
  'error.busy': 'व्यस्त',
  'error.iterations_exceeded': 'पुनरावृत्ति सीमा',
  'error.context_truncated': 'कॉन्टेक्स्ट काटा गया',
  'error.provider_error': 'प्रोवाइडर त्रुटि',
  'error.unknown': 'त्रुटि',
  'error.continue': 'जारी रखें',

  // Tool UI
  'tool.allow': 'अनुमति दें',
  'tool.always_allow': 'हमेशा अनुमति दें',
  'tool.allow_all': 'सभी को अनुमति दें',
  'tool.deny': 'अस्वीकार करें',
  'tool.allow_prompt': '{tool} को अनुमति दें?',
  'tool.arguments': 'आर्गुमेंट',
  'tool.output': 'आउटपुट',
  'tool.error': 'त्रुटि',
  'tool.truncated': '... (काटा गया)',
  'tool.read': '{file} पढ़ें',
  'tool.write': '{file} लिखें',
  'tool.edit': '{file} संपादित करें',
  'tool.find_files': 'फ़ाइलें खोजें: {pattern}',
  'tool.search': 'खोज: {pattern}',
  'tool.run': 'चलाएँ: {command}',
  'tool.list_dir': '{path} की सूची',
  'tool.web_search': 'खोज: {query}',
  'tool.ask_user': 'उपयोगकर्ता से सवाल',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',

  // History Panel
  'history.title': 'चैट इतिहास',
  'history.new_chat': '+ नई चैट',
  'history.close': 'बंद करें',
  'history.search': 'बातचीत खोजें...',
  'history.empty': 'अभी तक कोई सहेजी गई बातचीत नहीं।',
  'history.no_match': 'कोई मिलती-जुलती बातचीत नहीं।',
  'history.delete_confirm': 'हटाएँ?',
  'history.rename_hint': 'नाम बदलने के लिए डबल-क्लिक करें',
  'history.pin': 'पिन करें',
  'history.unpin': 'अनपिन करें',
  'history.export_md': 'Markdown के रूप में निर्यात करें',
  'history.pinned': 'पिन की गई',
  'history.just_now': 'अभी',
  'history.minutes_ago': '{n} मि. पहले',
  'history.hours_ago': '{n} घं. पहले',
  'history.days_ago': '{n} दिन पहले',

  // Ask User Card
  'ask.question': 'सवाल',
  'ask.fallback': 'Ava का एक सवाल है',
  'ask.placeholder': 'अपना जवाब लिखें...',
  'ask.submit': 'सबमिट करें',
  'ask.skip': 'छोड़ें',
  'ask.skipped': 'छोड़ दिया गया',

  // Plan Card
  'plan.unavailable': 'प्लान डेटा अनुपलब्ध',
  'plan.prefix': 'प्लान: {title}',
  'plan.approved': 'स्वीकृत',
  'plan.rejected': 'अस्वीकृत',
  'plan.goal': 'लक्ष्य',
  'plan.steps': 'चरण',
  'plan.verification': 'सत्यापन',
  'plan.approaches': 'दृष्टिकोण',
  'plan.approve': 'स्वीकृत करें',
  'plan.reject': 'अस्वीकार करें',

  // Todo Card
  'todo.unavailable': 'कार्य सूची अनुपलब्ध',
  'todo.tasks': 'कार्य',
  'todo.done': '{done}/{total} पूर्ण',

  // Status Bar
  'status.in': 'इन',
  'status.out': 'आउट',

  // Plan Card extra
  'plan.pending': 'लंबित',

  // App-level
  'app.model_switched': '{model} पर स्विच किया गया',
  'app.context_compressed': 'कॉन्टेक्स्ट संपीड़ित: ~{original} \u2192 ~{compressed} टोकन',
  'app.continue': 'जहाँ छोड़ा था वहाँ से जारी रखें।',
};
