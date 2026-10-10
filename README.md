# UniRead AI

UniRead AI is a document reader built with React, Vite, and Tailwind CSS. It can extract text from TXT, DOCX, PPTX, and text-based PDF files, then help readers explore the content with reading-level explanations, key points, document summaries, mind maps, a pictorial visualization, and Google AI Studio-powered read aloud and speech recognition.

The frontend lives in [`frontend/`](./frontend/). A Node.js API in [`backend/`](./backend/) uses a server-side, OpenAI-compatible model provider (Groq by default) and securely proxies speech requests to Google AI Studio.

## Requirements

- Node.js 22.12 or newer
- A Groq API key for model-powered analysis and quick actions
- A Google AI Studio API key for read aloud and speech recognition

## Start the app

1. Install project dependencies and configure the model provider:

   ```powershell
   npm install
   Copy-Item backend/.env.example backend/.env
   ```

   Add your `GROQ_API_KEY` to `backend/.env`. Keep this file private; it is excluded from Git.

2. Start the backend:

   ```powershell
   npm run dev:backend
   ```

3. In another terminal, start the frontend:

   ```powershell
   npm run dev:frontend
   ```

4. Open the local URL printed by Vite.

## Speech with Google AI Studio

Create a key in [Google AI Studio](https://aistudio.google.com/apikey), then add it to `backend/.env`:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_api_key
```

Restart the Node backend after setting it. The key stays on the server. Read aloud and microphone transcription use Gemini models through Google AI Studio.

## Features

- Import or drag and drop TXT, DOCX, PPTX, and text-based PDF documents.
- View original text, key points, or simplified reading-level explanations.
- Generate model-powered summaries, Telugu translations, and mind maps.
- Open the document analysis view with the current reader text prefilled.
- Adjust output language, font, font size, and visible line limit.
- Use keyboard shortcuts and saved sequences for Smart Quick Actions.
- Submit optional post-action feedback, stored in the current browser.
- Use dark mode, high contrast, Google AI Studio read-aloud, and voice dictation.

## Security and deployment

Never add API keys or other credentials to frontend code or commit `.env` files. For a single-project Vercel deployment:

1. Import this GitHub repository into Vercel and leave the project root set to the repository root. The included `vercel.json` configures a Vercel frontend service (`frontend/`) and Express API service (`backend/`) under one project and routes `/api/*` to the API.
2. In the Vercel project settings, set the Node.js version to 22.x and add `GROQ_API_KEY` and `GEMINI_API_KEY` as encrypted environment variables for the environments you use. Do not add either key with a `VITE_` prefix.
3. If you use a custom domain, set `FRONTEND_ORIGINS` to its full origin, for example `https://uniread.example.com`. Vercel preview and production deployment origins are allowed automatically.
4. Deploy. The frontend calls `/api/*` on the same origin, so no separate API URL is needed. Verify `/api/health` and `/api/speech/health` on the deployed domain.

See [`backend/README.md`](./backend/README.md) for API details and security considerations before deploying it publicly.
