export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2 text-xs opacity-50">
      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
      <span className="ml-1">Thinking</span>
    </div>
  );
}
