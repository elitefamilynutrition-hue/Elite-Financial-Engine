'use client';

import { useState, useRef } from 'react';

interface ProcessedStub {
  fileName: string;
  payDate: string;
  netPay: number;
  deduplicated?: boolean;
}

interface PaystubDropzoneProps {
  onUploadSuccess: (record?: unknown) => void;
}

export default function PaystubDropzone({ onUploadSuccess }: PaystubDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [queueProgress, setQueueProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [processedStubs, setProcessedStubs] = useState<ProcessedStub[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setErrorMsg(null);
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    
    const invalidFiles = files.filter(f => !validTypes.includes(f.type));
    if (invalidFiles.length > 0) {
      setErrorMsg(`Invalid file format (${invalidFiles.map(f => f.name).join(', ')}). Please upload PDF, JPG, PNG, or WEBP.`);
      return;
    }

    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setQueueProgress({ current: i + 1, total: files.length, fileName: file.name });

        const formData = new FormData();
        formData.append('paystub', file);

        const response = await fetch('/api/telemetry/vision', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Failed to process ${file.name}`);
        }

        if (data.record) {
          setProcessedStubs(prev => [
            {
              fileName: file.name,
              payDate: data.record.pay_date,
              netPay: Number(data.record.net_pay || 0),
              deduplicated: data.deduplicated,
            },
            ...prev,
          ]);
        }

        onUploadSuccess(data.record);
      }
    } catch (error: unknown) {
      console.error('Upload error:', error);
      setErrorMsg(error instanceof Error ? error.message : 'Error processing paystub batch.');
    } finally {
      setIsUploading(false);
      setQueueProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 ease-in-out cursor-pointer ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-800/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="hidden"
        />

        <div className="space-y-3 pointer-events-none">
          {isUploading && queueProgress ? (
            <div className="animate-pulse space-y-2 py-2">
              <div className="h-8 w-8 mx-auto rounded-full bg-indigo-500 mb-3 animate-ping" />
              <p className="text-sm font-semibold text-zinc-200">
                Extracting {queueProgress.current} of {queueProgress.total}: {queueProgress.fileName}
              </p>
              <p className="text-xs text-indigo-400 font-mono">
                Running Gemini Vision Forensic OCR...
              </p>
            </div>
          ) : (
            <>
              <div className="mx-auto w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-300">
                  Drag & Drop Paystubs (Batch Upload Supported)
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Select multiple PDFs, PNGs, or JPGs at once
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-lg text-xs text-rose-300 flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white ml-2">✕</button>
        </div>
      )}

      {processedStubs.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {processedStubs.map((stub, idx) => (
            <div key={idx} className="flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-zinc-300 truncate max-w-[160px]">{stub.fileName}</span>
                <span className="text-zinc-500 font-mono">({stub.payDate})</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-emerald-400 font-mono font-semibold">
                  +${stub.netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-800 text-emerald-400 rounded text-[10px]">
                  {stub.deduplicated ? 'Updated' : 'Synced'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
