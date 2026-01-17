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
      return { prefix: '[+]', text: log.slice(3), color: 'text-[var(--green)]' };
    }
    if (log.startsWith('[!]')) {
      return { prefix: '[!]', text: log.slice(3), color: 'text-[var(--red)]' };
    }
    if (log.startsWith('[*]')) {
      return { prefix: '[*]', text: log.slice(3), color: 'text-[var(--cyan)]' };
    }
    if (log.startsWith('    -')) {
      return { prefix: '   └─', text: log.slice(5), color: 'text-[var(--foreground-muted)]' };
    }
    return { prefix: '>', text: log, color: 'text-[var(--foreground)]' };
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--background-tertiary)] rounded-t-lg border border-b-0 border-[var(--cyan)]/30">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="ml-4 text-xs text-[var(--foreground-muted)] font-mono">
          decompiler@ghidra:~$ analysis.log
        </span>
        {isActive && (
          <motion.span
            className="ml-auto text-xs text-[var(--cyan)]"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            ● LIVE
          </motion.span>
        )}
      </div>

      {/* Terminal body */}
      <div
        ref={containerRef}
        className="relative bg-[#0d0e17] border border-[var(--cyan)]/30 rounded-b-lg p-4 h-64 overflow-y-auto font-mono text-sm scanlines"
      >
        {/* Scanline overlay effect */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-[var(--cyan)]/[0.02] to-transparent" />

        {/* Log entries */}
        <AnimatePresence mode="popLayout">
          {logs.map((log, index) => {
            const { prefix, text, color } = formatLog(log);
            return (
              <motion.div
                key={`${index}-${log}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex gap-2 py-0.5"
              >
                <span className={color}>{prefix}</span>
                <span className="text-[var(--foreground)]/90">{text}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Blinking cursor */}
        {isActive && (
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-[var(--cyan)]">{'>'}</span>
            <motion.span
              className="w-2 h-4 bg-[var(--cyan)]"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[var(--background-tertiary)] rounded-b-lg border border-t-0 border-[var(--cyan)]/30 -mt-[1px]">
        <span className="text-[10px] text-[var(--foreground-muted)] font-mono">
          {logs.length} entries
        </span>
        <span className="text-[10px] text-[var(--foreground-muted)] font-mono">
          UTF-8 | LF
        </span>
      </div>
    </div>
  );
}
