'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function FileDropzone({ onFileSelect, disabled }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }

    const validExtensions = ['.exe', '.elf', '.bin', '.dll', '.so'];
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return 'Invalid file type. Supported: .exe, .dll, .elf, .bin, .so';
    }

    return null;
  };

  const handleFile = useCallback((file: File) => {
    setError(null);
    const validationError = validateFile(file);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    onFileSelect(file);
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, handleFile]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.exe,.elf,.bin,.dll,.so';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFile(file);
      }
    };
    input.click();
  }, [disabled, handleFile]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative p-12 rounded-lg cursor-pointer
          border-2 border-dashed transition-all duration-200
          ${disabled 
            ? 'border-[var(--border)] bg-[var(--background-secondary)] cursor-not-allowed opacity-50' 
            : isDragging 
              ? 'border-[var(--primary)] bg-[var(--background-secondary)] shadow-lg shadow-[var(--primary)]/10' 
              : 'border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--border-hover)] hover:bg-[var(--background-tertiary)]'
          }
        `}
        animate={{
          scale: isDragging ? 1.01 : 1,
        }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex flex-col items-center gap-4">
          {/* Upload icon */}
          <motion.div
            animate={{
              y: isDragging ? -4 : 0,
            }}
            transition={{ duration: 0.2 }}
          >
            <svg
              className={`w-12 h-12 ${isDragging ? 'text-[var(--primary)]' : 'text-[var(--foreground-muted)]'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </motion.div>

          {/* Text content */}
          <div className="text-center space-y-2">
            <h3 className={`text-lg font-medium ${isDragging ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'}`}>
              {isDragging ? 'Drop file here' : 'Upload executable'}
            </h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Drag and drop your binary file, or click to browse
            </p>
            <p className="text-xs text-[var(--foreground-subtle)] mt-1 font-mono">
              Supported: .exe, .dll, .elf, .bin, .so • Max 50MB
            </p>
          </div>
        </div>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 bg-red-950/30 border border-red-800/50 rounded-lg text-red-300 text-sm text-center"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
