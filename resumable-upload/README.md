# Resumable Chunked File Upload (React + Node.js)

A minimal, self-contained example demonstrating how to resume large file uploads after an internet disconnection using byte-range chunking.

## Project Structure
- `server/` — Express backend with byte-offset status checks and append-stream writing.
- `client/` — React + Vite frontend with 1MB file slicing and automatic `online`/`offline` recovery.

## How to Run Locally

### 1. Start the Node.js Backend
```bash
cd server
npm install
npm start
```
The server runs on `http://localhost:4000` and stores uploaded files in `server/uploads/`.

### 2. Start the React Frontend
Open a second terminal:
```bash
cd client
npm install
npm run dev
```
Open the local URL printed by Vite (typically `http://localhost:5173`).

## Testing Internet Cutoff
1. Select a large file (e.g., 50MB–200MB) in the React app.
2. Open Chrome DevTools (`F12` or `Cmd+Option+I`) -> **Network** tab.
3. Switch throttling from **No throttling** to **Offline** mid-upload.
4. Switch back to **No throttling** and watch the upload automatically resume from the last saved byte offset.
