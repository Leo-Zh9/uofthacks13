'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import { downloadAsFile, FunctionCode } from '@/lib/api';

interface CodeViewerProps {
  functions: FunctionCode[];
  rawCombined: string;
  refactoredCombined: string;
  filename?: string;
}

type ViewMode = 'split' | 'raw' | 'refactored';

export default function CodeViewer({ 
  functions, 
  rawCombined, 
  refactoredCombined, 
  filename = 'decompiled' 
}: CodeViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [selectedFunction, setSelectedFunction] = useState<string>('__all__');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Get the current code to display based on selected function
  const { rawCode, refactoredCode } = useMemo(() => {
    if (selectedFunction === '__all__') {
      return { rawCode: rawCombined, refactoredCode: refactoredCombined };
    }
    const func = functions.find(f => f.name === selectedFunction);
    return {
      rawCode: func?.raw_code || '// Function not found',
      refactoredCode: func?.refactored_code || func?.raw_code || '// Not processed by AI',
    };
  }, [selectedFunction, functions, rawCombined, refactoredCombined]);

  const handleCopy = async (code: string, label: string) => {
    await navigator.clipboard.writeText(code);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleDownload = (code: string, suffix: string) => {
    const funcSuffix = selectedFunction === '__all__' ? '' : `_${selectedFunction}`;
    downloadAsFile(code, `${filename}${funcSuffix}_${suffix}.c`);
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
    <div className="flex flex-col h-full bg-[var(--background-secondary)] rounded-lg overflow-hidden border border-gray-700/50">
      {/* Panel header */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50"
        style={{ borderTopColor: accentColor, borderTopWidth: '2px' }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-sm font-semibold tracking-wide" style={{ color: accentColor }}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopy}
            className="p-1.5 rounded hover:bg-gray-700/50 transition-colors text-gray-400 hover:text-white"
            title="Copy to clipboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onDownload}
            className="p-1.5 rounded hover:bg-gray-700/50 transition-colors text-gray-400 hover:text-white"
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
            CODE COMPARISON
          </h2>
          
          {/* Function selector */}
          {functions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--foreground-muted)]">FUNCTION:</span>
              <select
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value)}
                className="bg-[var(--background-tertiary)] border border-gray-700/50 rounded-lg 
                         px-3 py-1.5 text-sm text-[var(--foreground)] outline-none
                         focus:border-[var(--cyan)] transition-colors cursor-pointer
                         max-w-[200px]"
              >
                <option value="__all__">All Functions ({functions.length})</option>
                {functions.map((func) => (
                  <option key={func.name} value={func.name}>
                    {func.name}
                    {func.refactored_code ? ' ✓' : ' ○'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* View mode buttons */}
          <div className="flex bg-[var(--background-tertiary)] rounded-lg p-1">
            {(['split', 'raw', 'refactored'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded transition-all
                  ${viewMode === mode 
                    ? 'bg-[var(--cyan)] text-[var(--background)] shadow-lg' 
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }
                `}
              >
                {mode === 'split' ? 'SPLIT' : mode === 'raw' ? 'RAW' : 'CLEAN'}
              </button>
            ))}
          </div>

          {/* Download all button */}
          <button
            onClick={() => handleDownload(refactoredCode, 'refactored')}
            className="btn-cyber text-xs py-2 px-4"
          >
            EXPORT CLEAN CODE
          </button>
        </div>
      </div>

      {/* Function tabs for quick navigation */}
      {functions.length > 1 && functions.length <= 10 && (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedFunction('__all__')}
            className={`
              px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all
              ${selectedFunction === '__all__'
                ? 'bg-[var(--magenta)] text-white'
                : 'bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }
            `}
          >
            ALL
          </button>
          {functions.map((func) => (
            <button
              key={func.name}
              onClick={() => setSelectedFunction(func.name)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5
                ${selectedFunction === func.name
                  ? 'bg-[var(--cyan)] text-[var(--background)]'
                  : 'bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }
              `}
            >
              {func.name}
              {func.refactored_code && (
                <span className={`w-1.5 h-1.5 rounded-full ${selectedFunction === func.name ? 'bg-[var(--background)]' : 'bg-[var(--green)]'}`} />
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
            className="fixed top-4 right-4 bg-[var(--green)] text-[var(--background)] px-4 py-2 rounded-lg text-sm font-medium z-50"
          >
            Copied {copySuccess}!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code panels */}
      <div className="flex-1 min-h-0">
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
