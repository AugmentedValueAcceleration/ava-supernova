/* ── AVA Platform Design Tokens ─────────────────────────────────────────────
 * Matches the IDE's polished dark theme. Single source of truth for all pages.
 * ────────────────────────────────────────────────────────────────────────── */

export const theme = {
  /* ── Backgrounds ─────────────────────────────────────────────────────── */
  pageBg: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)',
  pageBgFlat: '#110c1a',
  cardBg: 'rgba(26, 16, 40, 0.6)',
  surfaceBg: '#0a0714',
  inputBg: 'rgba(49, 34, 68, 0.5)',
  hoverBg: 'rgba(168, 85, 247, 0.05)',

  /* ── Borders ─────────────────────────────────────────────────────────── */
  border: 'rgba(168, 85, 247, 0.12)',
  borderSubtle: 'rgba(168, 85, 247, 0.06)',

  /* ── Accent ──────────────────────────────────────────────────────────── */
  accent: '#a855f7',
  accentHover: '#9333ea',
  accentBg: 'rgba(168, 85, 247, 0.1)',
  accentBgStrong: 'rgba(168, 85, 247, 0.2)',

  /* ── Text ────────────────────────────────────────────────────────────── */
  text: '#cdd6f4',
  textSecondary: '#a6adc8',
  textMuted: '#6c7086',

  /* ── Semantic colours ────────────────────────────────────────────────── */
  green: '#a6e3a1',
  greenBg: 'rgba(166, 227, 161, 0.12)',
  blue: '#89b4fa',
  blueBg: 'rgba(137, 180, 250, 0.12)',
  yellow: '#f9e2af',
  yellowBg: 'rgba(249, 226, 175, 0.12)',
  red: '#f38ba8',
  redBg: 'rgba(243, 139, 168, 0.12)',
  orange: '#fab387',
  orangeBg: 'rgba(250, 179, 135, 0.12)',
  teal: '#94e2d5',
  tealBg: 'rgba(148, 226, 213, 0.12)',

  /* ── Radii ───────────────────────────────────────────────────────────── */
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,

  /* ── Spacing ─────────────────────────────────────────────────────────── */
  pagePadding: '32px 40px',
  cardPadding: '24px',
  sectionGap: 32,
} as const;

/* ── Re-usable style objects ───────────────────────────────────────────── */

export const pageStyle: React.CSSProperties = {
  padding: theme.pagePadding,
  overflowY: 'auto',
  height: '100%',
  background: theme.pageBg,
  minHeight: '100vh',
};

export const cardStyle: React.CSSProperties = {
  background: theme.cardBg,
  border: 'none',
  borderRadius: theme.radiusLg,
  padding: theme.cardPadding,
};

export const statCardStyle: React.CSSProperties = {
  background: theme.cardBg,
  border: 'none',
  borderRadius: theme.radiusLg,
  padding: '28px 24px',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: theme.inputBg,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm,
  color: theme.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

export const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: theme.textMuted,
  margin: 0,
};

export const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: theme.accent,
  color: '#fff',
  border: 'none',
  borderRadius: theme.radiusSm,
  fontSize: 14,
  fontWeight: 400,
  cursor: 'pointer',
  transition: 'background 0.2s',
};

export const ghostBtnStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: theme.inputBg,
  color: theme.textSecondary,
  border: 'none',
  borderRadius: theme.radiusSm,
  fontSize: 14,
  fontWeight: 400,
  cursor: 'pointer',
  transition: 'background 0.2s',
};

export const tableCellStyle: React.CSSProperties = {
  padding: '14px 16px',
};

export const tableHeaderStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontWeight: 400,
  color: theme.textMuted,
  fontSize: 11,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

export const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: theme.textSecondary,
  display: 'block',
  marginBottom: 6,
};

export const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

export const modalContentStyle: React.CSSProperties = {
  background: theme.cardBg,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusLg,
  padding: 32,
  maxHeight: '85vh',
  overflowY: 'auto',
};

export const chipStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block',
  background: bg,
  color,
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 9999,
  padding: '3px 10px',
});

export const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '80px 40px',
};
