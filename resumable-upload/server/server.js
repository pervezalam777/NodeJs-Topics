const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// 1. Handshake Endpoint: Check how many bytes have been uploaded so far
app.get('/upload/status', (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const safeFileName = path.basename(fileId);
  const filePath = path.join(UPLOAD_DIR, safeFileName);

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    return res.json({ uploadedBytes: stats.size });
  }

  return res.json({ uploadedBytes: 0 });
});

// 2. Chunk Upload Endpoint: Append incoming binary stream to file
app.post('/upload', (req, res) => {
  const fileId = req.headers['x-file-id'];
  const startByte = parseInt(req.headers['x-start-byte'], 10);

  if (!fileId || isNaN(startByte)) {
    return res.status(400).json({ error: 'Missing x-file-id or x-start-byte header' });
  }

  const safeFileName = path.basename(fileId);
  const filePath = path.join(UPLOAD_DIR, safeFileName);

  let currentSize = 0;
  if (fs.existsSync(filePath)) {
    currentSize = fs.statSync(filePath).size;
  }

  if (currentSize !== startByte) {
    return res.status(409).json({
      error: 'Offset mismatch',
      expectedByte: currentSize,
    });
  }

  const writeStream = fs.createWriteStream(filePath, { flags: 'a' });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    const newSize = fs.statSync(filePath).size;
    res.json({ uploadedBytes: newSize });
  });

  writeStream.on('error', (err) => {
    console.error('Stream error:', err);
    res.status(500).json({ error: 'Failed to write chunk' });
  });
});

app.listen(4000, () => {
  console.log('Server running on http://localhost:4000');
});
