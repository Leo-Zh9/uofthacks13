'use client';

import { motion } from 'framer-motion';

export type Stage = 'pending' | 'uploading' | 'disassembling' | 'analyzing' | 'ai_refactoring' | 'completed' | 'failed';

interface ProgressStepperProps {
  currentStage: Stage;
  progress: number;
}

const stages: { key: Stage; label: string; icon: string; description: string }[] = [
  { key: 'uploading', label: 'UPLOAD', icon: '↑', description: 'Uploading binary' },
  { key: 'disassembling', label: 'GHIDRA', icon: '⚙', description: 'Disassembling' },
  { key: 'analyzing', label: 'ANALYZE', icon: '◎', description: 'Analyzing' },
  { key: 'ai_refactoring', label: 'LLM4D + GPT', icon: '🧠', description: 'AI Pipeline' },
  { key: 'completed', label: 'DONE', icon: '✓', description: 'Complete' },
];

export default function ProgressStepper({ currentStage, progress }: ProgressStepperProps) {
  const currentIndex = stages.findIndex(s => s.key === currentStage);
  const isFailed = currentStage === 'failed';

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Pipeline description */}
      <div className="text-center mb-6">
        <p className="text-xs text-[var(--foreground-muted)]">
          Two-Stage AI Pipeline: <span className="text-[var(--cyan)]">LLM4Decompile</span> (correctness) → <span className="text-[var(--magenta)]">GPT-4o</span> (readability)
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center justify-between mb-8">
        {stages.map((stage, index) => {
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex || currentStage === 'completed';

          return (
            <div key={stage.key} className="flex items-center">
              {/* Step circle */}
              <motion.div
                className={`
                  relative w-14 h-14 rounded-full flex items-center justify-center
                  border-2 transition-all duration-300
                  ${isFailed && isActive
                    ? 'border-red-500 bg-red-500/20 text-red-400'
                    : isComplete
                      ? 'border-[var(--cyan)] bg-[var(--cyan)]/20 text-[var(--cyan)]'
                      : isActive
                        ? 'border-[var(--magenta)] bg-[var(--magenta)]/20 text-[var(--magenta)]'
                        : 'border-gray-600 bg-gray-800/50 text-gray-500'
                  }
                `}
                animate={{
                  scale: isActive ? [1, 1.1, 1] : 1,
                }}
                transition={{
                  duration: 1,
                  repeat: isActive && !isFailed ? Infinity : 0,
                }}
              >
                {/* Glow effect for active */}
                {isActive && !isFailed && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-[var(--magenta)]"
                    animate={{
                      opacity: [0.2, 0.4, 0.2],
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                    style={{ filter: 'blur(8px)' }}
                  />
                )}
                
                <span className="relative z-10 text-xl font-bold">
                  {isFailed && isActive ? '✕' : stage.icon}
                </span>
              </motion.div>

              {/* Connector line */}
              {index < stages.length - 1 && (
                <div className="w-12 md:w-20 h-0.5 mx-1 md:mx-2 bg-gray-700 overflow-hidden">
                  <motion.div
                    className={`h-full ${isComplete ? 'bg-[var(--cyan)]' : 'bg-gray-700'}`}
                    initial={{ width: '0%' }}
                    animate={{ 
                      width: isComplete ? '100%' : isActive ? `${Math.min(progress, 100)}%` : '0%'
                    }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex || currentStage === 'completed';

          return (
            <div 
              key={`label-${stage.key}`}
              className={`
                w-14 text-center text-[9px] font-medium tracking-wider
                ${isFailed && isActive
                  ? 'text-red-400'
                  : isComplete
                    ? 'text-[var(--cyan)]'
                    : isActive
                      ? 'text-[var(--magenta)]'
                      : 'text-gray-500'
                }
              `}
            >
              {stage.label}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-8">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-[var(--foreground-muted)]">
            {isFailed ? 'ERROR' : stages[currentIndex]?.description || 'INITIALIZING'}
          </span>
          <span className={`text-sm font-mono ${isFailed ? 'text-red-400' : 'text-[var(--cyan)]'}`}>
            {progress}%
          </span>
        </div>
        <div className="progress-bar h-2">
          <motion.div
            className={`progress-bar-fill ${isFailed ? '!bg-red-500' : ''}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Stage details for AI Refactoring */}
        {currentStage === 'ai_refactoring' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-[var(--background-tertiary)] rounded-lg border border-[var(--magenta)]/30"
          >
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[var(--cyan)]">●</span>
                <span className="text-[var(--foreground-muted)]">Stage 1:</span>
                <span className="text-[var(--cyan)]">LLM4Decompile</span>
                <span className="text-[var(--foreground-muted)]">(fixes structure)</span>
              </div>
              <span className="text-[var(--foreground-muted)]">→</span>
              <div className="flex items-center gap-2">
                <span className="text-[var(--magenta)]">●</span>
                <span className="text-[var(--foreground-muted)]">Stage 2:</span>
                <span className="text-[var(--magenta)]">GPT-4o</span>
                <span className="text-[var(--foreground-muted)]">(adds readability)</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
