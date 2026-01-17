'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Editor from '@monaco-editor/react';
import { downloadAsFile } from '@/lib/api';

interface CodeViewerProps {
  rawCode: string;
  refactoredCode: string;
  filename?: string;
}

type ViewMode = 'split' | 'raw' | 'refactored';

export default function CodeViewer({ rawCode, refactoredCode, filename = 'decompiled' }: CodeViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const handleCopy = async (code: string, label: string) => {
    await navigator.clipboard.writeText(code);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleDownload = (code: string, suffix: string) => {
    downloadAsFile(code, `${filename}_${suffix}.c`);
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
      {/* Header with view mode toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          CODE COMPARISON
        </h2>
        
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

      {/* Copy success notification */}
      {copySuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="absolute top-4 right-4 bg-[var(--green)] text-[var(--background)] px-4 py-2 rounded-lg text-sm font-medium z-50"
        >
          Copied {copySuccess}!
        </motion.div>
      )}

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
