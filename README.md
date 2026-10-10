# UniRead AI

UniRead AI is a document reader built with React, Vite, and Tailwind CSS. It can extract text from TXT, DOCX, PPTX, and text-based PDF files, then help readers explore the content with reading-level explanations, key points, document summaries, mind maps, a pictorial visualization, and read-aloud or offline dictation.

The frontend lives in [`frontend/`](./frontend/). A Node.js API in [`backend/`](./backend/) uses a server-side, OpenAI-compatible model provider (Groq by default). An optional local Python service provides speech synthesis and offline speech recognition.

## Requirements

- Node.js 22.12 or newer
- A Groq API key for model-powered analysis and quick actions
- Python 3.10 or newer for optional speech features

## Start the app

1. Install backend dependencies and configure the model provider:

   ```powershell
   cd backend
   npm install
   Copy-Item .env.example .env
   ```

   Add your `GROQ_API_KEY` to `backend/.env`. Keep this file private; it is excluded from Git.

2. Start the backend in the `backend` directory:

   ```powershell
   npm run dev
   ```

3. In another terminal, start the frontend from the project root:

   ```powershell
   npm --prefix frontend install
   npm --prefix frontend run dev
   ```

4. Open the local URL printed by Vite.

## Optional offline speech

Install the Python dependencies and English speech-recognition model, then start the speech service:

```powershell
cd backend\python
python -m pip install -r requirements.txt
python setup_models.py
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Run the speech service in a separate terminal alongside the frontend and Node.js backend. Speech uses locally installed system voices and Vosk models.

## Features

- Import or drag and drop TXT, DOCX, PPTX, and text-based PDF documents.
- View original text, key points, or simplified reading-level explanations.
- Generate model-powered summaries, Telugu translations, and mind maps.
- Open the document analysis view with the current reader text prefilled.
- Adjust output language, font, font size, and visible line limit.
- Use keyboard shortcuts and saved sequences for Smart Quick Actions.
- Submit optional post-action feedback, stored in the current browser.
- Use dark mode, high contrast, read-aloud, and offline voice dictation.

## Security and deployment

Never add API keys or other credentials to frontend code or commit `.env` files. The API is configured for local development; see [`backend/README.md`](./backend/README.md) for API details and security considerations before deploying it publicly.
