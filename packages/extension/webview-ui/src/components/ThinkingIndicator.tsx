import { useState, useEffect } from 'react';

const MESSAGES = [
  'Ava is thinking...',
  'Analyzing your code...',
  'Considering approaches...',
  'Crafting a response...',
];

export function ThinkingIndicator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-2 py-2 text-xs opacity-50" role="status" aria-label="Ava is thinking">
      <span
        className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
        style={{
          borderColor: 'var(--vscode-textLink-foreground, #3794ff)',
          borderTopColor: 'transparent',
        }}
      />
      <span>{MESSAGES[index]}</span>
    </div>
  );
}
