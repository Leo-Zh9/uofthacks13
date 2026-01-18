'use client';

import { motion } from 'framer-motion';

export type Stage = 'pending' | 'uploading' | 'disassembling' | 'analyzing' | 'ai_refactoring' | 'completed' | 'failed';

interface ProgressStepperProps {
  currentStage: Stage;
  progress: number;
}

const stages: { key: Stage; label: string; description: string }[] = [
  { key: 'uploading', label: 'Upload', description: 'Uploading binary' },
  { key: 'disassembling', label: 'Disassemble', description: 'Ghidra analysis' },
  { key: 'analyzing', label: 'Analyze', description: 'Deep inspection' },
  { key: 'ai_refactoring', label: 'Refactor', description: 'AI processing' },
  { key: 'completed', label: 'Complete', description: 'Done' },
];

export default function ProgressStepper({ currentStage, progress }: ProgressStepperProps) {
  const currentIndex = stages.findIndex(s => s.key === currentStage);
  const isFailed = currentStage === 'failed';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Steps */}
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex || currentStage === 'completed';

          return (
            <div key={stage.key} className="flex items-center flex-1">
              {/* Step circle */}
              <div className="flex flex-col items-center flex-1">
                <motion.div
                  className={`
                    relative w-10 h-10 rounded-full flex items-center justify-center
                    border-2 transition-all duration-200
                    ${isFailed && isActive
                      ? 'border-red-500 bg-red-950/30 text-red-400'
                      : isComplete
                        ? 'border-green-500 bg-green-950/30 text-green-400'
                        : isActive
                          ? 'border-[var(--primary)] bg-[var(--background-tertiary)] text-[var(--primary)] shadow-lg shadow-[var(--primary)]/20'
                          : 'border-[var(--border)] bg-[var(--background-secondary)] text-[var(--foreground-subtle)]'
                    }
                  `}
                  animate={{
                    scale: isActive && !isFailed ? [1, 1.05, 1] : 1,
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: isActive && !isFailed ? Infinity : 0,
                  }}
                >
                  {isComplete ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isFailed && isActive ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-current" />
                  )}
                </motion.div>

                {/* Label */}
                <div className="mt-2 text-center">
                  <p className={`text-xs font-medium ${
                    isFailed && isActive
                      ? 'text-red-400'
                      : isComplete
                        ? 'text-green-400'
                        : isActive
                          ? 'text-[var(--primary)]'
                          : 'text-[var(--foreground-subtle)]'
                  }`}>
                    {stage.label}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              {index < stages.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 bg-[var(--border)] overflow-hidden rounded-full relative">
                  <motion.div
                    className={`absolute inset-y-0 left-0 ${
                      isComplete ? 'bg-green-500' : 'bg-[var(--primary)]'
                    }`}
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

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {isFailed ? 'Error' : stages[currentIndex]?.description || 'Initializing'}
          </span>
          <span className={`text-sm font-mono ${isFailed ? 'text-red-400' : 'text-[var(--primary)]'}`}>
            {progress}%
          </span>
        </div>
        <div className="progress-bar">
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
