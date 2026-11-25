import React, { useState, useEffect, useRef } from 'react';

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const API_URL = 'http://localhost:4000';

export default function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Idle');
  const [logs, setLogs] = useState([]);

  const isUploadingRef = useRef(false);
  const activeFileRef = useRef(null);

  const addLog = (msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const getFileId = (selectedFile) => {
    return `${selectedFile.size}-${selectedFile.lastModified}-${selectedFile.name}`;
  };

  const startOrResumeUpload = async (targetFile) => {
    if (!targetFile || isUploadingRef.current) return;

    isUploadingRef.current = true;
    const fileId = getFileId(targetFile);

    try {
      setStatus('Checking server offset...');
      const statusRes = await fetch(
        `${API_URL}/upload/status?fileId=${encodeURIComponent(fileId)}`
      );
      if (!statusRes.ok) throw new Error('Failed to check upload status');

      const { uploadedBytes } = await statusRes.json();
      let currentOffset = uploadedBytes;

      addLog(`Resuming from byte ${currentOffset} / ${targetFile.size}`);
      setStatus('Uploading...');

      while (currentOffset < targetFile.size) {
        if (!navigator.onLine) {
          throw new Error('Browser went offline');
        }

        const chunk = targetFile.slice(currentOffset, currentOffset + CHUNK_SIZE);

        const uploadRes = await fetch(`${API_URL}/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-file-id': fileId,
            'x-start-byte': currentOffset.toString(),
          },
          body: chunk,
        });

        if (!uploadRes.ok) {
          throw new Error(`Server responded with ${uploadRes.status}`);
        }

        const data = await uploadRes.json();
        currentOffset = data.uploadedBytes;

        const percent = Math.round((currentOffset / targetFile.size) * 100);
        setProgress(percent);
      }

      setStatus('Upload Complete!');
      addLog('File uploaded 100% successfully.');
    } catch (err) {
      setStatus('Paused (Network Error - Waiting to resume...)');
      addLog(`Upload interrupted: ${err.message}`);
    } finally {
      isUploadingRef.current = false;
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      addLog('Internet connection restored! Resuming upload...');
      if (activeFileRef.current) {
        startOrResumeUpload(activeFileRef.current);
      }
    };

    const handleOffline = () => {
      addLog('Internet connection lost!');
      setStatus('Offline - Paused');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    activeFileRef.current = selected;
    setProgress(0);
    setLogs([]);
    startOrResumeUpload(selected);
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Resumable Chunked File Upload</h2>

      <input type="file" onChange={handleFileChange} />

      {file && (
        <div style={{ marginTop: 20 }}>
          <p><strong>File:</strong> {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</p>
          <p><strong>Status:</strong> {status}</p>

          <div style={{ width: '100%', background: '#eee', height: 24, borderRadius: 4 }}>
            <div
              style={{
                width: `${progress}%`,
                background: progress === 100 ? '#22c55e' : '#3b82f6',
                height: '100%',
                borderRadius: 4,
                transition: 'width 0.2s',
              }}
            />
          </div>
          <p>{progress}%</p>

          <button
            onClick={() => startOrResumeUpload(file)}
            style={{ padding: '8px 16px', cursor: 'pointer' }}
          >
            Force Manual Resume
          </button>
        </div>
      )}

      <div style={{ marginTop: 30, background: '#1e1e1e', color: '#00ff88', padding: 15, borderRadius: 6, height: 200, overflowY: 'auto', fontSize: 13 }}>
        <strong>Event Logs:</strong>
        {logs.map((log, i) => (
          <div key={i} style={{ marginTop: 4 }}>{log}</div>
        ))}
      </div>
    </div>
  );
}
