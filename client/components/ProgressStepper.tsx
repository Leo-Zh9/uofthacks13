'use client';

import { motion } from 'framer-motion';

export type Stage = 'pending' | 'uploading' | 'disassembling' | 'analyzing' | 'ai_refactoring' | 'completed' | 'failed';

interface ProgressStepperProps {
  currentStage: Stage;
  progress: number;
}

const stages: { key: Stage; label: string; icon: string }[] = [
  { key: 'uploading', label: 'UPLOADING', icon: '↑' },
  { key: 'disassembling', label: 'DISASSEMBLING', icon: '⚙' },
  { key: 'analyzing', label: 'ANALYZING', icon: '◎' },
  { key: 'ai_refactoring', label: 'AI REFACTORING', icon: '✧' },
  { key: 'completed', label: 'COMPLETE', icon: '✓' },
];

export default function ProgressStepper({ currentStage, progress }: ProgressStepperProps) {
  const currentIndex = stages.findIndex(s => s.key === currentStage);
  const isFailed = currentStage === 'failed';

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Steps */}
      <div className="flex items-center justify-between mb-8">
        {stages.map((stage, index) => {
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex || currentStage === 'completed';
          const isPending = index > currentIndex;

          return (
            <div key={stage.key} className="flex items-center">
              {/* Step circle */}
              <motion.div
                className={`
                  relative w-12 h-12 rounded-full flex items-center justify-center
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
                
                <span className="relative z-10 text-lg font-bold">
                  {isFailed && isActive ? '✕' : stage.icon}
                </span>
              </motion.div>

              {/* Connector line */}
              {index < stages.length - 1 && (
                <div className="w-16 h-0.5 mx-2 bg-gray-700 overflow-hidden">
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
                w-12 text-center text-[10px] font-medium tracking-wider
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
            {isFailed ? 'ERROR' : stages[currentIndex]?.label || 'INITIALIZING'}
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
      </div>
    </div>
  );
}
