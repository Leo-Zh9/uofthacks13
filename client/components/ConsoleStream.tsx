'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConsoleStreamProps {
  logs: string[];
  isActive?: boolean;
}

export default function ConsoleStream({ logs, isActive = true }: ConsoleStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const formatLog = (log: string) => {
    // Color code different log types
    if (log.startsWith('[+]')) {
      return { prefix: '[+]', text: log.slice(3), color: 'text-green-400' };
    }
    if (log.startsWith('[!]')) {
      return { prefix: '[!]', text: log.slice(3), color: 'text-red-400' };
    }
    if (log.startsWith('[*]')) {
      return { prefix: '[*]', text: log.slice(3), color: 'text-[var(--primary)]' };
    }
    if (log.startsWith('    -')) {
      return { prefix: '   └─', text: log.slice(5), color: 'text-[var(--foreground-muted)]' };
    }
    return { prefix: '>', text: log, color: 'text-[var(--foreground)]' };
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Terminal Window */}
      <div className="bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--background-tertiary)] border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <span className="text-xs text-[var(--foreground-muted)] font-mono">
              analysis.log
            </span>
          </div>
          
          {isActive && (
            <motion.div
              className="flex items-center gap-2"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50" />
              <span className="text-xs font-medium text-[var(--foreground-muted)] font-mono">
                Live
              </span>
            </motion.div>
          )}
        </div>

        {/* Terminal Body */}
        <div
          ref={containerRef}
          className="relative bg-[var(--background-secondary)] p-4 h-64 overflow-y-auto font-mono text-sm"
        >
          {/* Log entries */}
          <AnimatePresence mode="popLayout">
            {logs.map((log, index) => {
              const { prefix, text, color } = formatLog(log);
              return (
                <motion.div
                  key={`${index}-${log}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex gap-2 py-1 hover:bg-[var(--background-tertiary)] px-1 -mx-1 rounded"
                >
                  <span className={`${color} flex-shrink-0`}>{prefix}</span>
                  <span className="text-[var(--foreground)] flex-1">{text}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Blinking cursor */}
          {isActive && (
            <motion.div 
              className="flex items-center gap-2 py-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span className="text-[var(--foreground-muted)]">{'>'}</span>
              <motion.span
                className="w-2 h-4 bg-[var(--primary)]"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </motion.div>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--background-tertiary)] border-t border-[var(--border)]">
          <span className="text-xs text-[var(--foreground-muted)] font-mono">
            {logs.length} entries
          </span>
          <span className="text-xs text-[var(--foreground-muted)] font-mono">
            {isActive ? 'Streaming' : 'Complete'}
          </span>
        </div>
      </div>
    </div>
  );
}
