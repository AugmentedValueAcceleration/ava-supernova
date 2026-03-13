import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Greeting-to-language map covering all 20 supported languages.
 * Keys are lowercase. Values are [language name, native name].
 */
const GREETING_MAP: Record<string, [string, string]> = {
  // Chinese (Simplified)
  '你好': ['Chinese (Simplified)', '中文（简体）'],
  '您好': ['Chinese (Simplified)', '中文（简体）'],
  '早上好': ['Chinese (Simplified)', '中文（简体）'],
  '晚上好': ['Chinese (Simplified)', '中文（简体）'],
  '谢谢': ['Chinese (Simplified)', '中文（简体）'],
  // Chinese (Traditional)
  '早安': ['Chinese (Traditional)', '中文（繁體）'],
  // Japanese
  'こんにちは': ['Japanese', '日本語'],
  'おはよう': ['Japanese', '日本語'],
  'こんばんは': ['Japanese', '日本語'],
  'おはようございます': ['Japanese', '日本語'],
  'ありがとう': ['Japanese', '日本語'],
  'さようなら': ['Japanese', '日本語'],
  // Korean
  '안녕하세요': ['Korean', '한국어'],
  '안녕': ['Korean', '한국어'],
  '감사합니다': ['Korean', '한국어'],
  // Spanish
  'hola': ['Spanish', 'Español'],
  'buenos días': ['Spanish', 'Español'],
  'buenos dias': ['Spanish', 'Español'],
  'buenas tardes': ['Spanish', 'Español'],
  'buenas noches': ['Spanish', 'Español'],
  'gracias': ['Spanish', 'Español'],
  'adiós': ['Spanish', 'Español'],
  'adios': ['Spanish', 'Español'],
  'por favor': ['Spanish', 'Español'],
  // Portuguese
  'olá': ['Portuguese', 'Português'],
  'ola': ['Portuguese', 'Português'],
  'oi': ['Portuguese', 'Português'],
  'bom dia': ['Portuguese', 'Português'],
  'boa tarde': ['Portuguese', 'Português'],
  'boa noite': ['Portuguese', 'Português'],
  'obrigado': ['Portuguese', 'Português'],
  'obrigada': ['Portuguese', 'Português'],
  // French
  'bonjour': ['French', 'Français'],
  'bonsoir': ['French', 'Français'],
  'salut': ['French', 'Français'],
  'merci': ['French', 'Français'],
  'au revoir': ['French', 'Français'],
  's\'il vous plaît': ['French', 'Français'],
  // German
  'hallo': ['German', 'Deutsch'],
  'guten morgen': ['German', 'Deutsch'],
  'guten tag': ['German', 'Deutsch'],
  'guten abend': ['German', 'Deutsch'],
  'danke': ['German', 'Deutsch'],
  'auf wiedersehen': ['German', 'Deutsch'],
  'tschüss': ['German', 'Deutsch'],
  // Russian
  'привет': ['Russian', 'Русский'],
  'здравствуйте': ['Russian', 'Русский'],
  'добрый день': ['Russian', 'Русский'],
  'спасибо': ['Russian', 'Русский'],
  'до свидания': ['Russian', 'Русский'],
  // Arabic
  'مرحبا': ['Arabic', 'العربية'],
  'السلام عليكم': ['Arabic', 'العربية'],
  'أهلا': ['Arabic', 'العربية'],
  'شكرا': ['Arabic', 'العربية'],
  // Hindi / Nepali
  'नमस्ते': ['Hindi', 'हिन्दी'],
  'नमस्कार': ['Hindi', 'हिन्दी'],
  'namaste': ['Hindi', 'हिन्दी'],
  'namaskar': ['Hindi', 'हिन्दी'],
  'dhanyavaad': ['Hindi', 'हिन्दी'],
  'धन्यवाद': ['Hindi', 'हिन्दी'],
  'alvida': ['Hindi', 'हिन्दी'],
  'alavidā': ['Hindi', 'हिन्दी'],
  'alavida': ['Hindi', 'हिन्दी'],
  'अलविदा': ['Hindi', 'हिन्दी'],
  'फिर मिलेंगे': ['Hindi', 'हिन्दी'],
  // Vietnamese
  'xin chào': ['Vietnamese', 'Tiếng Việt'],
  'xin chao': ['Vietnamese', 'Tiếng Việt'],
  'chào': ['Vietnamese', 'Tiếng Việt'],
  'chao': ['Vietnamese', 'Tiếng Việt'],
  'cảm ơn': ['Vietnamese', 'Tiếng Việt'],
  // Thai
  'สวัสดี': ['Thai', 'ไทย'],
  'สวัสดีครับ': ['Thai', 'ไทย'],
  'สวัสดีค่ะ': ['Thai', 'ไทย'],
  'ขอบคุณ': ['Thai', 'ไทย'],
  // Turkish
  'merhaba': ['Turkish', 'Türkçe'],
  'selam': ['Turkish', 'Türkçe'],
  'günaydın': ['Turkish', 'Türkçe'],
  'gunaydin': ['Turkish', 'Türkçe'],
  'teşekkürler': ['Turkish', 'Türkçe'],
  'hoşça kal': ['Turkish', 'Türkçe'],
  // Italian
  'ciao': ['Italian', 'Italiano'],
  'buongiorno': ['Italian', 'Italiano'],
  'buonasera': ['Italian', 'Italiano'],
  'arrivederci': ['Italian', 'Italiano'],
  // Polish
  'cześć': ['Polish', 'Polski'],
  'czesc': ['Polish', 'Polski'],
  'dzień dobry': ['Polish', 'Polski'],
  'dzien dobry': ['Polish', 'Polski'],
  'dziękuję': ['Polish', 'Polski'],
  'do widzenia': ['Polish', 'Polski'],
  // Ukrainian
  'привіт': ['Ukrainian', 'Українська'],
  'добрий день': ['Ukrainian', 'Українська'],
  'дякую': ['Ukrainian', 'Українська'],
  'до побачення': ['Ukrainian', 'Українська'],
  // Dutch
  'hoi': ['Dutch', 'Nederlands'],
  'goedemorgen': ['Dutch', 'Nederlands'],
  'goedendag': ['Dutch', 'Nederlands'],
  'goedenavond': ['Dutch', 'Nederlands'],
  'dank je': ['Dutch', 'Nederlands'],
  'tot ziens': ['Dutch', 'Nederlands'],
  // Indonesian
  'halo': ['Indonesian', 'Bahasa Indonesia'],
  'selamat pagi': ['Indonesian', 'Bahasa Indonesia'],
  'selamat siang': ['Indonesian', 'Bahasa Indonesia'],
  'selamat malam': ['Indonesian', 'Bahasa Indonesia'],
  'terima kasih': ['Indonesian', 'Bahasa Indonesia'],
};

/**
 * Unicode script detection for non-Latin text.
 */
function detectScript(text: string): [string, string] | null {
  const cleaned = text.replace(/[\s\d\p{P}]/gu, '');
  if (!cleaned) return null;

  // CJK characters
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(cleaned)) return ['Chinese', '中文'];
  // Japanese (Hiragana/Katakana)
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(cleaned)) return ['Japanese', '日本語'];
  // Korean (Hangul)
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(cleaned)) return ['Korean', '한국어'];
  // Devanagari (Hindi/Nepali)
  if (/[\u0900-\u097f]/.test(cleaned)) return ['Hindi', 'हिन्दी'];
  // Arabic
  if (/[\u0600-\u06ff\u0750-\u077f]/.test(cleaned)) return ['Arabic', 'العربية'];
  // Thai
  if (/[\u0e00-\u0e7f]/.test(cleaned)) return ['Thai', 'ไทย'];
  // Cyrillic — check for Ukrainian-specific letters first
  if (/[\u0400-\u04ff]/.test(cleaned)) {
    if (/[іїєґ]/i.test(cleaned)) return ['Ukrainian', 'Українська'];
    return ['Russian', 'Русский'];
  }

  return null;
}

export class DetectLanguageTool implements Tool {
  readonly name = 'detect_language';
  readonly description = 'Detect the language of user input text to respond in the correct language';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'detect_language',
    description:
      'Detect the language of the user\'s message. Use this tool BEFORE responding whenever the user writes ' +
      'in a non-English language or uses a greeting/word from another language. Returns the detected language ' +
      'name so you know which language to respond in. You MUST respond entirely in the detected language.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The user\'s message text to detect the language of',
        },
      },
      required: ['text'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const text = String(args.text ?? '').trim();
    if (!text) {
      return { success: false, output: 'No text provided' };
    }

    const lower = text.toLowerCase();

    // 1. Check greeting map (exact match or starts-with)
    for (const [greeting, [english, native]] of Object.entries(GREETING_MAP)) {
      const g = greeting.toLowerCase();
      if (lower === g || lower.startsWith(g + ' ') || lower.startsWith(g + ',') || lower.startsWith(g + '!')) {
        return {
          success: true,
          output: JSON.stringify({
            detected: true,
            language: english,
            nativeName: native,
            method: 'greeting_match',
            matchedPhrase: greeting,
            instruction: `Respond ENTIRELY in ${native} (${english}). Do NOT use English at all except for code, file paths, and technical identifiers.`,
          }, null, 2),
        };
      }
    }

    // 2. Unicode script detection
    const scriptResult = detectScript(text);
    if (scriptResult) {
      return {
        success: true,
        output: JSON.stringify({
          detected: true,
          language: scriptResult[0],
          nativeName: scriptResult[1],
          method: 'script_detection',
          instruction: `Respond ENTIRELY in ${scriptResult[1]} (${scriptResult[0]}). Do NOT use English at all except for code, file paths, and technical identifiers.`,
        }, null, 2),
      };
    }

    // 3. No match — likely English or unrecognised
    return {
      success: true,
      output: JSON.stringify({
        detected: false,
        language: 'English',
        nativeName: 'English',
        method: 'default',
        instruction: 'No non-English language detected. Respond in English.',
      }, null, 2),
    };
  }
}
