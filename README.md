# UniRead AI

UniRead AI is a document reader built with React, Vite, and Tailwind CSS. It can extract text from TXT, DOCX, PPTX, and text-based PDF files, then help readers explore the content with reading-level explanations, key points, document summaries, mind maps, a pictorial visualization, and ElevenLabs-powered read aloud and speech recognition.

The frontend lives in [`frontend/`](./frontend/). A Node.js API in [`backend/`](./backend/) uses a server-side, OpenAI-compatible model provider (Groq by default) and securely proxies speech requests to ElevenLabs.

## Requirements

- Node.js 22.12 or newer
- A Groq API key for model-powered analysis and quick actions
- An ElevenLabs API key for read aloud and speech recognition

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

## Speech with ElevenLabs

Add your ElevenLabs key to `backend/.env`:

```dotenv
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

Restart the Node backend after setting it. The key stays on the server. Read aloud uses ElevenLabs text-to-speech; microphone dictation and voice commands use ElevenLabs speech-to-text. Recordings are sent to ElevenLabs for processing, and usage is subject to your account plan.

## Features

- Import or drag and drop TXT, DOCX, PPTX, and text-based PDF documents.
- View original text, key points, or simplified reading-level explanations.
- Generate model-powered summaries, Telugu translations, and mind maps.
- Open the document analysis view with the current reader text prefilled.
- Adjust output language, font, font size, and visible line limit.
- Use keyboard shortcuts and saved sequences for Smart Quick Actions.
- Submit optional post-action feedback, stored in the current browser.
- Use dark mode, high contrast, ElevenLabs read-aloud, and voice dictation.

## Security and deployment

Never add API keys or other credentials to frontend code or commit `.env` files. The API is configured for local development; see [`backend/README.md`](./backend/README.md) for API details and security considerations before deploying it publicly.
