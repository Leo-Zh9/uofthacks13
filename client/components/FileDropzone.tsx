'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function FileDropzone({ onFileSelect, disabled }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }

    // Check file extension
    const validExtensions = ['.exe', '.elf', '.bin', '.dll', '.so'];
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return 'Invalid file type. Please upload a PE (.exe, .dll) or ELF binary.';
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
          relative p-12 rounded-xl cursor-pointer
          border-2 border-dashed transition-all duration-300
          ${disabled 
            ? 'border-gray-600 bg-gray-800/30 cursor-not-allowed opacity-50' 
            : isDragging 
              ? 'border-[var(--cyan)] bg-[var(--cyan)]/10 glow-cyan' 
              : 'border-[var(--cyan)]/50 bg-[var(--background-secondary)] hover:border-[var(--cyan)] hover:bg-[var(--cyan)]/5'
          }
        `}
        animate={{
          scale: isDragging ? 1.02 : 1,
        }}
        transition={{ duration: 0.2 }}
      >
        {/* Animated corner accents */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[var(--cyan)] rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[var(--magenta)] rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[var(--magenta)] rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[var(--cyan)] rounded-br-xl" />

        <div className="flex flex-col items-center gap-6">
          {/* Upload icon */}
          <motion.div
            animate={{
              y: isDragging ? -10 : 0,
            }}
            transition={{ duration: 0.3 }}
          >
            <svg
              className={`w-16 h-16 ${isDragging ? 'text-[var(--cyan)]' : 'text-[var(--foreground-muted)]'}`}
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
          <div className="text-center">
            <h3 className={`text-xl font-semibold mb-2 ${isDragging ? 'text-[var(--cyan)] text-glow-cyan' : 'text-[var(--foreground)]'}`}>
              {isDragging ? 'DROP BINARY HERE' : 'UPLOAD EXECUTABLE'}
            </h3>
            <p className="text-[var(--foreground-muted)] text-sm">
              Drag and drop your <span className="text-[var(--cyan)]">.exe</span> or{' '}
              <span className="text-[var(--magenta)]">.elf</span> file here, or click to browse
            </p>
            <p className="text-[var(--foreground-muted)] text-xs mt-2">
              Maximum file size: 5MB
            </p>
          </div>

          {/* Animated particles when dragging */}
          <AnimatePresence>
            {isDragging && (
              <>
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 bg-[var(--cyan)] rounded-full"
                    initial={{ 
                      opacity: 0, 
                      x: 0, 
                      y: 0,
                    }}
                    animate={{ 
                      opacity: [0, 1, 0],
                      x: Math.cos(i * 60 * Math.PI / 180) * 100,
                      y: Math.sin(i * 60 * Math.PI / 180) * 100,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ 
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm text-center"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
