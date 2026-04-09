type DataMode = 'local' | 'cloud' | 'both';

function getDataMode(): DataMode {
  return (localStorage.getItem('ava-data-mode') as DataMode) || 'local';
}

const STYLES: Record<DataMode, { border: string; bg: string; text: string; dot: string; label: string }> = {
  local: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Local' },
  cloud: { border: 'border-blue-500/20', bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400', label: 'Cloud' },
  both:  { border: 'border-purple-500/20', bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400', label: 'Both' },
};

export function StorageBadge() {
  const mode = getDataMode();
  const s = STYLES[mode];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${s.border} ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
