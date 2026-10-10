# UniRead AI backend

Small Express API for model-powered text analysis. It calls a compatible Chat Completions endpoint and returns a validated overview, distinct simple, balanced, and detailed explanations, key points, level-specific picture analogies and three-node visual scenes, and exactly three document-specific explanation steps for every level. The frontend renders the validated scene data as a safe SVG illustration. It does not use Supabase or persist analyses.

The reader command field also sends typed or offline-transcribed instructions to the same configured model. The model applies the requested edit to the document and returns the revised text into the reader; it does not create a separate answer tab. Groq is configured by default for this workspace; set `GROQ_API_KEY` in `backend/.env` before using model commands.

The provider key must also have available API billing credits/quota. If the provider reports exhausted quota, the reader shows that reason and keeps the original document unchanged until billing is restored.

Read aloud and speech recognition use the ElevenLabs API through the Express backend. The API key stays server-side in `backend/.env`.

## Requirements

- Node.js 22.12 or newer
- A Groq API key, or another compatible provider key/base URL/model
- An ElevenLabs API key for read aloud and speech recognition

## Configure

1. Configure `GROQ_API_KEY` in `backend/.env`. The current Groq endpoint is `https://api.groq.com/openai/v1` and the default model is `openai/gpt-oss-120b`.
2. Create a Groq API key in the Groq console. Do not use an OpenAI API key in `GROQ_API_KEY`.
3. For local development, the Vite server proxies `/api` to `http://localhost:3001`. If the API is hosted on a different origin, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_URL` to that origin.
4. Set `FRONTEND_ORIGINS` in `backend/.env` to the exact frontend origins allowed to call the API. Local development defaults allow the Vite ports 5173 and 5177 on `localhost` and `127.0.0.1`.
5. Set `ELEVENLABS_API_KEY` in `backend/.env` to enable ElevenLabs text-to-speech and speech-to-text. Optional settings select the TTS model, female/male voice IDs, and speech timeout.

To use another Groq model or endpoint, set `GROQ_MODEL` or `GROQ_BASE_URL`. The backend also continues to support the legacy `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL` settings when the configured endpoint is not Groq.

Never put the model provider key in frontend environment variables or source code. Analyses are returned to the current browser request only; neither original document text nor analysis output is saved by this API.

## Run

```powershell
cd backend
npm install
npm run dev
```

Run the frontend separately with `npm --prefix frontend run dev`. The health endpoint at `http://localhost:3001/api/health` reports whether the provider key is configured without revealing it.

### ElevenLabs speech

The browser records microphone input and sends the compressed recording to the backend, which forwards audio to ElevenLabs Scribe v2 and returns the transcript. Read aloud sends the selected reader text to ElevenLabs Flash v2.5 and returns MP3 audio for browser playback. No Python service or speech model downloads are required. Microphone access is required, and recordings are limited to 3 minutes/4 MB.

`GET /api/speech/health` reports whether an ElevenLabs key is configured and which transcription-language choices are available. `POST /api/speech` returns MP3 audio and accepts up to 40,000 characters using ElevenLabs Flash v2.5. `POST /api/speech/transcribe?language=English` accepts an audio body and returns `{ "text": "recognized words" }`. Set `ELEVENLABS_BASE_URL` for a regional ElevenLabs API endpoint, `ELEVENLABS_FEMALE_VOICE_ID` / `ELEVENLABS_MALE_VOICE_ID` for your preferred voices, and `SPEECH_TIMEOUT_MS` to change the request timeout.

The ElevenLabs key is never sent to the frontend. Speech audio and microphone recordings are sent to ElevenLabs for processing and are subject to your ElevenLabs account, plan, and data-handling settings.

## API

`POST /api/analyze` requires no account or bearer token.

`POST /api/reader-command` accepts `{ "text": "Document text", "command": "Translate this document to Telugu", "title": "Optional title", "language": "English" }` and returns `{ "text": "The complete revised document", "model": "configured-model" }`. It uses the same server-side provider key as analysis and never exposes the key to the frontend.

```json
{
  "text": "Document text to analyze",
  "title": "Optional document title",
  "readingLevel": "balanced",
  "language": "English"
}
```

Success returns `200` with `title`, `readingLevel`, `language`, and an `analysis` object containing `overview`, `readingLevels`, `keyPoints`, `pictureExplanations`, `pictureScenes`, and `explanationSteps`. Each reading level has its own explanation, picture analogy, three-subject pictorial scene, and exactly three document-specific explanation steps. Text is limited to 50,000 characters; requests are rate-limited to 10 per minute per IP.

The API is unauthenticated. The API allows the current Vercel deployment and production origins automatically; set `FRONTEND_ORIGINS` in Vercel to include any custom domain. The in-memory IP rate limit is per function instance, so public deployments should add user authentication and shared abuse/rate controls at a trusted proxy or gateway.

## Tests

```powershell
npm test
```

Tests mock model-provider responses and require no credentials or external network.
