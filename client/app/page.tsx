'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FileDropzone from '@/components/FileDropzone';
import ProgressStepper, { Stage } from '@/components/ProgressStepper';
import ConsoleStream from '@/components/ConsoleStream';
import CodeViewer from '@/components/CodeViewer';
import { uploadBinary, getJobStatus, getJobResult, JobResultResponse } from '@/lib/api';

type AppState = 'idle' | 'processing' | 'complete' | 'error';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('pending');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<JobResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('decompiled');

  // Poll for job status
  useEffect(() => {
    if (!jobId || appState !== 'processing') return;

    const pollStatus = async () => {
      try {
        const status = await getJobStatus(jobId);
        setStage(status.status as Stage);
        setProgress(status.progress);
        setLogs(status.logs);

        if (status.status === 'completed') {
          const jobResult = await getJobResult(jobId);
          setResult(jobResult);
          setAppState('complete');
        } else if (status.status === 'failed') {
          setError(status.error || 'An unknown error occurred');
          setAppState('error');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Initial poll
    pollStatus();

    // Set up interval
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [jobId, appState]);

  const handleFileSelect = useCallback(async (file: File) => {
    setFilename(file.name.replace(/\.[^/.]+$/, ''));
    setAppState('processing');
    setStage('uploading');
    setProgress(5);
    setLogs([`[*] Selected file: ${file.name}`, `[*] Size: ${(file.size / 1024).toFixed(2)} KB`]);
    setError(null);
    setResult(null);

    try {
      const response = await uploadBinary(file);
      setJobId(response.job_id);
      setLogs(prev => [...prev, `[+] Upload complete. Job ID: ${response.job_id}`, '[*] Starting analysis...']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setAppState('error');
      setStage('failed');
      setLogs(prev => [...prev, `[!] Error: ${err instanceof Error ? err.message : 'Upload failed'}`]);
    }
  }, []);

  const handleReset = () => {
    setAppState('idle');
    setJobId(null);
    setStage('pending');
    setProgress(0);
    setLogs([]);
    setResult(null);
    setError(null);
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--cyan)]/20 bg-[var(--background-secondary)]/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--cyan)] to-[var(--magenta)] flex items-center justify-center">
                <span className="text-xl">⚙</span>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-wider text-glow-cyan">
                  DECOMPILER
                </h1>
                <p className="text-[10px] text-[var(--foreground-muted)] tracking-widest">
                  AI-POWERED BINARY ANALYSIS
                </p>
              </div>
            </div>
            
            {appState !== 'idle' && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm border border-[var(--cyan)]/50 rounded-lg
                         text-[var(--cyan)] hover:bg-[var(--cyan)]/10 transition-colors"
              >
                NEW ANALYSIS
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 container mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* Idle state - Show upload */}
          {appState === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[60vh] gap-8"
            >
              <div className="text-center mb-8">
                <motion.h2 
                  className="text-4xl font-bold mb-4 bg-gradient-to-r from-[var(--cyan)] to-[var(--magenta)] bg-clip-text text-transparent"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  REVERSE ENGINEER ANY BINARY
                </motion.h2>
                <motion.p 
                  className="text-[var(--foreground-muted)] max-w-lg mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  Upload your executable and watch as our AI transforms cryptic assembly 
                  into clean, readable C code with meaningful variable names and comments.
                </motion.p>
              </div>

              <FileDropzone onFileSelect={handleFileSelect} />

              {/* Feature highlights */}
              <motion.div 
                className="grid grid-cols-3 gap-8 mt-12 max-w-3xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {[
                  { icon: '⚡', title: 'GHIDRA POWERED', desc: 'Industry-standard decompilation engine' },
                  { icon: '🧠', title: 'AI REFACTORING', desc: 'GPT-4o transforms cryptic code into readable C' },
                  { icon: '🔒', title: 'SECURE', desc: 'Your binaries are never stored or shared' },
                ].map((feature, i) => (
                  <div key={i} className="text-center">
                    <div className="text-3xl mb-2">{feature.icon}</div>
                    <h3 className="text-sm font-semibold text-[var(--cyan)] mb-1">{feature.title}</h3>
                    <p className="text-xs text-[var(--foreground-muted)]">{feature.desc}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* Processing state */}
          {(appState === 'processing' || appState === 'error') && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-8"
            >
              <ProgressStepper currentStage={stage} progress={progress} />
              <ConsoleStream logs={logs} isActive={appState === 'processing'} />
              
              {appState === 'error' && error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-3xl mx-auto p-6 bg-red-500/10 border border-red-500/50 rounded-lg"
                >
                  <h3 className="text-red-400 font-semibold mb-2">Analysis Failed</h3>
                  <p className="text-red-300/80 text-sm">{error}</p>
                  <button
                    onClick={handleReset}
                    className="mt-4 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded
                             text-red-400 hover:bg-red-500/30 transition-colors text-sm"
                  >
                    Try Again
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Complete state - Show results */}
          {appState === 'complete' && result && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col h-[calc(100vh-200px)]"
            >
              {/* Success banner */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-[var(--green)]/10 border border-[var(--green)]/50 rounded-lg flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--green)]/20 flex items-center justify-center">
                  <span className="text-[var(--green)] text-xl">✓</span>
                </div>
                <div>
                  <h3 className="text-[var(--green)] font-semibold">Analysis Complete!</h3>
                  <p className="text-[var(--foreground-muted)] text-sm">
                    Successfully decompiled {result.functions.length} functions
                  </p>
                </div>
              </motion.div>

              {/* Code viewer */}
              <div className="flex-1 min-h-0">
                <CodeViewer
                  rawCode={result.raw_combined}
                  refactoredCode={result.refactored_combined}
                  filename={filename}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--cyan)]/10 py-4 text-center text-xs text-[var(--foreground-muted)]">
        <p>
          Built for <span className="text-[var(--cyan)]">UofTHacks</span> // 
          Powered by <span className="text-[var(--magenta)]">Ghidra</span> + <span className="text-[var(--cyan)]">GPT-4o</span>
        </p>
      </footer>
    </main>
  );
}
