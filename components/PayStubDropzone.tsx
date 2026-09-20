'use client';

import { useState, useRef } from 'react';

export default function PaystubDropzone({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    if (!file) return;
    
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Invalid file type. Please upload a PDF, JPG, or PNG.');
      return;
    }

    setFileName(file.name);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('paystub', file);

      // The API route we will build in Step 2
      const response = await fetch('/api/telemetry/vision', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      alert('Paystub processed and telemetry updated successfully.');
      onUploadSuccess();
      setFileName(null);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Error processing paystub.');
      setFileName(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ease-in-out cursor-pointer ${
          isDragging 
            ? 'border-indigo-500 bg-indigo-500/10' 
            : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-800/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="hidden"
        />
        
        <div className="space-y-4 pointer-events-none">
          {isUploading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-8 w-8 mx-auto rounded-full bg-indigo-500 mb-4 animate-ping" />
              <p className="text-sm font-semibold text-zinc-300">
                Extracting {fileName}...
              </p>
              <p className="text-xs text-zinc-500">
                Running Gemini Vision OCR...
              </p>
            </div>
          ) : (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-300">
                  Drag & Drop Paystub
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  PDF, PNG, or JPG
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}