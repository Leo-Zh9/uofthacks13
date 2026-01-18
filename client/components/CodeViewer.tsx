'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import { downloadAsFile, FunctionCode, cleanupCodeWithGemini } from '@/lib/api';

interface CodeViewerProps {
  functions: FunctionCode[];
  rawCombined: string;
  refactoredCombined: string;
  filename?: string;
}

type ViewMode = 'split' | 'raw' | 'refactored' | 'gemini';

export default function CodeViewer({ 
  functions, 
  rawCombined, 
  refactoredCombined, 
  filename = 'decompiled' 
}: CodeViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [selectedFunction, setSelectedFunction] = useState<string>('__all__');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [showOnlyAI, setShowOnlyAI] = useState<boolean>(true);
  
  // Gemini cleanup state
  const [geminiCode, setGeminiCode] = useState<string>('');
  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  
  // Filter to only AI-processed functions if toggle is on
  const displayFunctions = showOnlyAI 
    ? functions.filter(f => f.refactored_code !== null && f.refactored_code !== undefined)
    : functions;

  // Get the current code to display based on selected function
  const { rawCode, refactoredCode } = useMemo(() => {
    if (selectedFunction === '__all__') {
      // When showing all, use only AI-processed functions if toggle is on
      if (showOnlyAI) {
        const aiProcessed = functions.filter(f => f.refactored_code);
        const rawCombinedFiltered = aiProcessed.map(f => `// Function: ${f.name}\n${f.raw_code}`).join('\n\n');
        const refactoredCombinedFiltered = aiProcessed.map(f => `// Function: ${f.name}\n${f.refactored_code}`).join('\n\n');
        return { 
          rawCode: rawCombinedFiltered || '// No AI-processed functions', 
          refactoredCode: refactoredCombinedFiltered || '// No AI-processed functions' 
        };
      }
      return { rawCode: rawCombined, refactoredCode: refactoredCombined };
    }
    const func = functions.find(f => f.name === selectedFunction);
    return {
      rawCode: func?.raw_code || '// Function not found',
      refactoredCode: func?.refactored_code || func?.raw_code || '// Not processed by AI',
    };
  }, [selectedFunction, functions, rawCombined, refactoredCombined, showOnlyAI]);

  const handleCopy = async (code: string, label: string) => {
    await navigator.clipboard.writeText(code);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleDownload = (code: string, suffix: string) => {
    const funcSuffix = selectedFunction === '__all__' ? '' : `_${selectedFunction}`;
    downloadAsFile(code, `${filename}${funcSuffix}_${suffix}.c`);
  };

  // Handle Gemini cleanup - ALWAYS processes ALL functions together
  const handleGeminiCleanup = async () => {
    // Always use the combined refactored code (all functions)
    // This gives Gemini full context to make better naming decisions
    const codeToClean = refactoredCombined || rawCombined;
    if (!codeToClean) return;
    
    setGeminiLoading(true);
    setGeminiError(null);
    
    try {
      // Pass "all_functions" as context, process everything together
      const response = await cleanupCodeWithGemini(codeToClean, 'all_functions');
      setGeminiCode(response.cleaned_code);
      setViewMode('gemini');
      // Auto-select "all" view to show the full cleaned code
      setSelectedFunction('__all__');
    } catch (err) {
      setGeminiError(err instanceof Error ? err.message : 'Cleanup failed');
    } finally {
      setGeminiLoading(false);
    }
  };

  const editorOptions = {
    readOnly: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    automaticLayout: true,
    padding: { top: 16, bottom: 16 },
    renderLineHighlight: 'none' as const,
    scrollbar: {
      vertical: 'auto' as const,
      horizontal: 'auto' as const,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  };

  const CodePanel = ({ 
    code, 
    title, 
    accentColor,
    onCopy,
    onDownload,
  }: { 
    code: string; 
    title: string; 
    accentColor: string;
    onCopy: () => void;
    onDownload: () => void;
  }) => (
    <div className="flex flex-col h-full bg-[var(--background-secondary)] rounded-lg overflow-hidden border border-[var(--border)] shadow-lg">
      {/* Panel header */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--background-tertiary)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopy}
            className="p-1.5 rounded hover:bg-[var(--background-secondary)] transition-colors text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            title="Copy to clipboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onDownload}
            className="p-1.5 rounded hover:bg-[var(--background-secondary)] transition-colors text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            title="Download as .c file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Code editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="c"
          theme="vs-dark"
          value={code}
          options={editorOptions}
        />
      </div>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header with function selector and view mode toggle */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Code Comparison
          </h2>
          
          {/* Function selector */}
          {displayFunctions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--foreground-muted)] font-mono">Function:</span>
              <select
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value)}
                className="bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg 
                         px-3 py-1.5 text-sm text-[var(--foreground)] outline-none font-mono
                         focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-colors cursor-pointer
                         max-w-[200px]"
              >
                <option value="__all__">All Functions ({displayFunctions.length})</option>
                {displayFunctions.map((func) => (
                  <option key={func.name} value={func.name}>
                    {func.name}
                    {func.refactored_code ? ' [AI]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* AI-only toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyAI}
              onChange={(e) => {
                setShowOnlyAI(e.target.checked);
                setSelectedFunction('__all__');
              }}
              className="w-4 h-4 rounded border-[var(--border)] bg-[var(--background-secondary)] 
                       text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0"
            />
            <span className="text-xs text-[var(--foreground-muted)] font-mono">AI Only</span>
          </label>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View mode buttons */}
          <div className="flex bg-[var(--background-tertiary)] rounded-lg p-1">
            {(['split', 'raw', 'refactored'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded transition-all font-mono
                  ${viewMode === mode 
                    ? 'bg-[var(--background-secondary)] text-[var(--foreground)] shadow-sm' 
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }
                `}
              >
                {mode === 'split' ? 'Split' : mode === 'raw' ? 'Raw' : 'Clean'}
              </button>
            ))}
            {/* Gemini view mode - only show if we have gemini code */}
            {geminiCode && (
              <button
                onClick={() => setViewMode('gemini')}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded transition-all font-mono
                  ${viewMode === 'gemini' 
                    ? 'bg-[var(--primary)] text-white shadow-lg' 
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }
                `}
              >
                Gemini
              </button>
            )}
          </div>

          {/* Gemini cleanup button */}
          <button
            onClick={handleGeminiCleanup}
            disabled={geminiLoading}
            className={`
              btn-primary text-xs py-2 px-4 flex items-center gap-2
              ${geminiLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {geminiLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Cleaning...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Clean All + Add Comments
              </>
            )}
          </button>

          {/* Download all button */}
          <button
            onClick={() => handleDownload(geminiCode || refactoredCombined, geminiCode ? 'gemini' : 'refactored')}
            className="btn-outline text-xs py-2 px-4"
          >
            Export Code
          </button>
        </div>
      </div>

      {/* Function tabs for quick navigation */}
      {displayFunctions.length > 1 && displayFunctions.length <= 10 && (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedFunction('__all__')}
            className={`
              px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all font-mono
              ${selectedFunction === '__all__'
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }
            `}
          >
            ALL
          </button>
          {displayFunctions.map((func) => (
            <button
              key={func.name}
              onClick={() => setSelectedFunction(func.name)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 font-mono
                ${selectedFunction === func.name
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }
              `}
            >
              {func.name}
              {func.refactored_code && (
                <span className={`w-1.5 h-1.5 rounded-full ${selectedFunction === func.name ? 'bg-white' : 'bg-green-400'}`} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Copy success notification */}
      <AnimatePresence>
        {copySuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-4 right-4 bg-green-950/90 border border-green-800/50 text-green-300 px-4 py-2 rounded-lg text-sm font-medium z-50 shadow-lg font-mono backdrop-blur-sm"
          >
            Copied {copySuccess}!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code panels */}
      <div className="flex-1 min-h-0">
        {/* Gemini error message */}
        {geminiError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Gemini cleanup failed: {geminiError}
          </motion.div>
        )}

        {viewMode === 'split' ? (
          <div className="grid grid-cols-2 gap-4 h-full">
            <CodePanel
              code={rawCode}
              title="RAW DECOMPILED"
              accentColor="var(--orange)"
              onCopy={() => handleCopy(rawCode, 'raw code')}
              onDownload={() => handleDownload(rawCode, 'raw')}
            />
            <CodePanel
              code={refactoredCode}
              title="AI REFACTORED"
              accentColor="var(--cyan)"
              onCopy={() => handleCopy(refactoredCode, 'refactored code')}
              onDownload={() => handleDownload(refactoredCode, 'refactored')}
            />
          </div>
        ) : viewMode === 'raw' ? (
          <CodePanel
            code={rawCode}
            title="RAW DECOMPILED"
            accentColor="var(--orange)"
            onCopy={() => handleCopy(rawCode, 'raw code')}
            onDownload={() => handleDownload(rawCode, 'raw')}
          />
        ) : viewMode === 'gemini' ? (
          <CodePanel
            code={geminiCode || '// Click "Gemini Flash Cleanup" to generate cleaned code with renamed variables and comments'}
            title="GEMINI FLASH CLEANED (All Functions)"
            accentColor="var(--primary)"
            onCopy={() => handleCopy(geminiCode, 'gemini code')}
            onDownload={() => handleDownload(geminiCode, 'gemini')}
          />
        ) : (
          <CodePanel
            code={refactoredCode}
            title="AI REFACTORED"
            accentColor="var(--cyan)"
            onCopy={() => handleCopy(refactoredCode, 'refactored code')}
            onDownload={() => handleDownload(refactoredCode, 'refactored')}
          />
        )}
      </div>
    </div>
  );
}
