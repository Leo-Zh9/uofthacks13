'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import FileDropzone from '@/components/FileDropzone';
import ProgressStepper, { Stage } from '@/components/ProgressStepper';
import ConsoleStream from '@/components/ConsoleStream';
import CodeViewer from '@/components/CodeViewer';
import { uploadBinary, getJobStatus, getJobResult, JobResultResponse } from '@/lib/api';

type AppState = 'idle' | 'processing' | 'complete' | 'error';

function HomeContent() {
  const searchParams = useSearchParams();
  const [appState, setAppState] = useState<AppState>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('pending');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<JobResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('decompiled');
  const [geminiMode, setGeminiMode] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load job from URL query parameter (from Chrome extension)
  useEffect(() => {
    if (initialized) return; // Only run once
    
    const jobIdParam = searchParams.get('jobId');
    const filenameParam = searchParams.get('filename');
    
    console.log('URL params:', { jobIdParam, filenameParam });
    
    // Handle job ID from Chrome extension
    if (jobIdParam) {
      console.log('Loading job from URL:', jobIdParam);
      setJobId(jobIdParam);
      setFilename(filenameParam || 'extension-download');
      setAppState('processing');
      setStage('pending');
      setProgress(10);
      setLogs([
        `[*] Loading job from Chrome extension...`,
        `[*] File: ${filenameParam || 'unknown'}`,
        `[*] Job ID: ${jobIdParam}`,
        `[*] Starting to poll for updates...`
      ]);
      setInitialized(true);
    }
  }, [searchParams, initialized]);

  // Poll for job status
  useEffect(() => {
    if (!jobId || appState !== 'processing') return;

    const pollStatus = async () => {
      try {
        const status = await getJobStatus(jobId);
        setStage(status.status as Stage);
        setProgress(status.progress);
        
        // Merge new logs with existing ones, avoiding duplicates
        setLogs(prevLogs => {
          const newLogs = status.logs.filter(log => !prevLogs.includes(log));
          if (newLogs.length > 0) {
            return [...prevLogs, ...newLogs];
          }
          return status.logs; // Replace with server logs once they start coming
        });

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
        // If job not found, it might have expired
        if (err instanceof Error && err.message.includes('not found')) {
          setError('Job not found. It may have expired.');
          setAppState('error');
        }
      }
    };

    // Poll immediately
    pollStatus();
    
    // Then poll every 1.5 seconds for faster updates
    const interval = setInterval(pollStatus, 1500);
    return () => clearInterval(interval);
  }, [jobId, appState]);

  const handleFileSelect = useCallback(async (file: File) => {
    setFilename(file.name.replace(/\.[^/.]+$/, ''));
    setAppState('processing');
    setStage('uploading');
    setProgress(5);
    setLogs([
      `[+] Selected file: ${file.name}`,
      `[+] Size: ${(file.size / 1024).toFixed(2)} KB`,
      `[+] Mode: ${geminiMode ? 'Gemini' : 'LLM4Decompile + Gemini'}`,
      `[*] Uploading...`
    ]);
    setError(null);
    setResult(null);

    try {
      const response = await uploadBinary(file, { geminiMode });
      setJobId(response.job_id);
      setLogs(prev => [...prev, `[+] Upload complete. Job ID: ${response.job_id}`, '[*] Starting analysis...']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setAppState('error');
      setStage('failed');
      setLogs(prev => [...prev, `[!] Error: ${err instanceof Error ? err.message : 'Upload failed'}`]);
    }
  }, [geminiMode]);

  const handleReset = () => {
    setAppState('idle');
    setJobId(null);
    setStage('pending');
    setProgress(0);
    setLogs([]);
    setResult(null);
    setError(null);
    // Keep geminiMode preference across resets
  };

  return (
    <main className="min-h-screen flex flex-col bg-[var(--background)] relative z-10">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--background-secondary)]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--primary)]/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[var(--foreground)] tracking-tight">
                  Decompiler
                </h1>
                <p className="text-xs text-[var(--foreground-muted)] font-mono">
                  AI-Powered Binary Analysis
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Gemini Mode Toggle */}
              {appState === 'idle' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className={`text-sm font-medium transition-colors ${geminiMode ? 'text-[var(--primary)]' : 'text-[var(--foreground-muted)]'}`}>
                    Gemini Mode
                  </span>
                  <div 
                    className={`relative w-11 h-6 rounded-full transition-colors ${geminiMode ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
                    onClick={() => setGeminiMode(!geminiMode)}
                  >
                    <div 
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${geminiMode ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </div>
                </label>
              )}
              
              {appState !== 'idle' && (
                <button
                  onClick={handleReset}
                  className="btn-outline text-sm"
                >
                  New Analysis
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 container mx-auto px-6 py-12 max-w-4xl relative z-10">
        <AnimatePresence mode="wait">
          {/* Idle state - Show upload */}
          {appState === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-12"
            >
              <div className="text-center space-y-4">
                <motion.h2 
                  className="text-5xl font-semibold text-[var(--foreground)] tracking-tight"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  Analyze Binary Files
                </motion.h2>
                <motion.p 
                  className="text-lg text-[var(--foreground-muted)] max-w-xl mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  Upload your executable and transform cryptic assembly into clean, readable C code
                </motion.p>
              </div>

              <FileDropzone onFileSelect={handleFileSelect} />

              {/* Feature highlights */}
              <motion.div 
                className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mt-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                {[
                  { title: 'Ghidra Engine', desc: 'Industry-standard decompilation' },
                  { title: 'AI Refactoring', desc: 'Gemini transforms code for readability' },
                  { title: 'Secure', desc: 'Binaries analyzed in isolation' },
                ].map((feature, i) => (
                  <div key={i} className="text-center space-y-2">
                    <h3 className="text-sm font-medium text-[var(--foreground)]">{feature.title}</h3>
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
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-2">
                  {appState === 'error' ? 'Analysis Failed' : 'Analyzing Binary'}
                </h2>
                <p className="text-[var(--foreground-muted)]">
                  {appState === 'error' ? 'An error occurred during analysis' : 'Please wait while we process your file'}
                </p>
              </div>
              
              <ProgressStepper currentStage={stage} progress={progress} />
              <ConsoleStream logs={logs} isActive={appState === 'processing'} />
              
              {appState === 'error' && error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 bg-red-950/30 border border-red-800/50 rounded-lg"
                >
                  <h3 className="text-red-400 font-medium mb-2">Error</h3>
                  <p className="text-red-300 text-sm mb-4">{error}</p>
                  <button
                    onClick={handleReset}
                    className="btn-primary bg-red-600 hover:bg-red-700"
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
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-green-950/30 border border-green-800/50 rounded-lg flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-green-900/50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-green-400 font-medium">Analysis Complete</h3>
                  <p className="text-green-300 text-sm">
                    Successfully processed {result.functions.length} functions
                  </p>
                </div>
              </motion.div>

              {/* Code viewer */}
              <div className="flex-1 min-h-0">
                <CodeViewer
                  functions={result.functions}
                  rawCombined={result.raw_combined}
                  refactoredCombined={result.refactored_combined}
                  filename={filename}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-4 mt-auto relative z-10">
        <div className="container mx-auto px-6 text-center">
          <p className="text-xs text-[var(--foreground-muted)] font-mono">
            Powered by Ghidra + Gemini AI • Built for UofTHacks 13
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-[#0d1117] via-[#161b22] to-[#0d1117] flex items-center justify-center">
        <div className="text-[var(--foreground-muted)]">Loading...</div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
