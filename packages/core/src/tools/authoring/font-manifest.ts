/**
 * The fonts PDFs are written with (Documents 1.0, his call 15 Nov 2026).
 *
 * pdfkit's built-in fonts only cover Western European letters: tested, PDFs
 * were garbled in 11 of Ava's 20 languages (Arabic, Hindi, Chinese, Japanese,
 * Korean, Thai, Russian, Ukrainian, Polish, Turkish, Vietnamese). Google's
 * Noto fonts (SIL Open Font Licence) cover all of them.
 *
 * Every file is pinned — a fixed commit or tag, its size and SHA-256 — so the
 * build (scripts/fetch-fonts.mjs) and the in-app download get exactly these
 * bytes or nothing. `bundled` ships inside the extension and the IDE (~23 MB);
 * the bold Chinese/Japanese/Korean pack (~20 MB) is a download the person
 * chooses in Settings.
 */

export interface FontFile {
  file: string;
  url: string;
  size: number;
  sha256: string;
  bundled: boolean;
}

const NOTO = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/412a7edb2c8c535d1066157e5b17e661fd5591fe/fonts';
const CJK = 'https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004';

export const FONT_FILES: FontFile[] = [
  { file: 'NotoSans-Regular.ttf', url: `${NOTO}/NotoSans/hinted/ttf/NotoSans-Regular.ttf`, size: 621572, sha256: '478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823', bundled: true },
  { file: 'NotoSans-Bold.ttf', url: `${NOTO}/NotoSans/hinted/ttf/NotoSans-Bold.ttf`, size: 631484, sha256: '1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913', bundled: true },
  { file: 'NotoSans-Italic.ttf', url: `${NOTO}/NotoSans/hinted/ttf/NotoSans-Italic.ttf`, size: 639124, sha256: '467e3f89eeca4108bb8710a2b9e0cf2281ac56d5b0609211a83776d0505eecb5', bundled: true },
  { file: 'NotoSans-BoldItalic.ttf', url: `${NOTO}/NotoSans/hinted/ttf/NotoSans-BoldItalic.ttf`, size: 646092, sha256: '1b602a9d6353be42c91df097a4857b69fa2696f26703d7a33b54a15d87c2622c', bundled: true },
  { file: 'NotoSansArabic-Regular.ttf', url: `${NOTO}/NotoSansArabic/hinted/ttf/NotoSansArabic-Regular.ttf`, size: 234892, sha256: 'bdff3e5659d67e67def05b33f749683b9376ae819d65d3dd62ac4640b3aaef48', bundled: true },
  { file: 'NotoSansArabic-Bold.ttf', url: `${NOTO}/NotoSansArabic/hinted/ttf/NotoSansArabic-Bold.ttf`, size: 261460, sha256: '4e5462d2e8be880317b9f49b5b2da109ddb6a3563d91cc604b67f3535832a555', bundled: true },
  { file: 'NotoSansDevanagari-Regular.ttf', url: `${NOTO}/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf`, size: 243520, sha256: '4e3c66638958c3e2ab5d37f47a8deb89fffeb7be9985c665a519bbc7ba762313', bundled: true },
  { file: 'NotoSansDevanagari-Bold.ttf', url: `${NOTO}/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Bold.ttf`, size: 250176, sha256: '6a09c8d797cfc803d32cdc731e809424d74cbaff59f503de34ade421a08e5bc2', bundled: true },
  { file: 'NotoSansThai-Regular.ttf', url: `${NOTO}/NotoSansThai/hinted/ttf/NotoSansThai-Regular.ttf`, size: 37780, sha256: '61cf814eec46b294d6ea4401ac295d0cecd5207bd2331dcc5a15e7301d30ee44', bundled: true },
  { file: 'NotoSansThai-Bold.ttf', url: `${NOTO}/NotoSansThai/hinted/ttf/NotoSansThai-Bold.ttf`, size: 37824, sha256: '2ac6c6e8a478e23b15f76e4894af1fa2210f8f350e4e6e54aad530bec03efbfb', bundled: true },
  { file: 'NotoSansCJK-Regular.ttc', url: `${CJK}/Sans/OTC/NotoSansCJK-Regular.ttc`, size: 19484784, sha256: 'b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a', bundled: true },
  { file: 'OFL.txt', url: `${CJK}/LICENSE`, size: 4301, sha256: '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2', bundled: true },
  // The optional pack: real bold in Chinese, Japanese and Korean PDFs.
  { file: 'NotoSansCJK-Bold.ttc', url: `${CJK}/Sans/OTC/NotoSansCJK-Bold.ttc`, size: 20050760, sha256: 'faa5f3656a78b2e2d450d27fe8382c778bc2b6bb5ea29c986664a6a435056ceb', bundled: false },
];

export const BUNDLED_FONTS = FONT_FILES.filter((f) => f.bundled);
export const OPTIONAL_FONTS = FONT_FILES.filter((f) => !f.bundled);
