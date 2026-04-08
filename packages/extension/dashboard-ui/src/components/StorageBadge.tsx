export function StorageBadge() {
  const connected = !!localStorage.getItem('ava-platform-key');
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${
      connected
        ? 'border-blue-500/20 bg-blue-500/10 text-blue-400'
        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-blue-400' : 'bg-emerald-400'}`} />
      {connected ? 'Cloud' : 'Local'}
    </span>
  );
}
