export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-2 py-2 text-xs opacity-50">
      <span
        className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
        style={{
          borderColor: 'var(--vscode-textLink-foreground, #3794ff)',
          borderTopColor: 'transparent',
        }}
      />
      <span>Ava is thinking...</span>
    </div>
  );
}
