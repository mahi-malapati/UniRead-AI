const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/+$/, "");
const speechApiUrl = (import.meta.env.VITE_SPEECH_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export async function analyzeTextDocument({ text, title, readingLevel, language }) {
  const response = await fetch(`${apiUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, title, readingLevel, language }),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The analysis API returned an unreadable response.");
  }

  if (!response.ok) {
    const details = Array.isArray(payload?.details)
      ? payload.details.map((detail) => detail.message).filter(Boolean).join(" ")
      : "";
    if (details) throw new Error(`${payload.error || "Invalid analysis request."} ${details}`);
    throw new Error(payload?.error || `Analysis request failed with status ${response.status}.`);
  }
  return payload;
}

export async function applyReaderCommand({ text, command, title, language, signal }) {
  let response;
  try {
    response = await fetch(`${apiUrl}/api/reader-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, command, title, language }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Can't reach the model API. Start the backend and configure OPENAI_API_KEY in backend/.env.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The model API returned an unreadable response. Check the backend and try again.");
  }
  if (!response.ok) {
    throw new Error(payload?.error || `The model could not apply the command (status ${response.status}).`);
  }
  if (typeof payload?.text !== "string" || !payload.text.trim()) {
    throw new Error("The model returned no revised document. Try a clearer command.");
  }
  return payload.text;
}

export async function synthesizeSpeech({ text, voice, language, signal }) {
  let response;
  try {
    response = await fetch(`${speechApiUrl}/api/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, language }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Can't reach the offline speech service. Start it with `python -m uvicorn app:app --host 127.0.0.1 --port 8000` from backend/python.");
  }

  if (!response.ok) {
    let message = `Speech synthesis failed with status ${response.status}.`;
    try {
      const payload = await response.json();
      if (payload?.detail) message = payload.detail;
    } catch {
      // Keep the status-based error when the service does not return JSON.
    }
    throw new Error(message);
  }
  return response.blob();
}

export async function transcribeSpeech({ audio, language, signal }) {
  let response;
  try {
    response = await fetch(`${speechApiUrl}/api/transcribe?language=${encodeURIComponent(language)}`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: audio,
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Can't reach the offline speech service. Start it with `python -m uvicorn app:app --host 127.0.0.1 --port 8000` from backend/python.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The offline speech service returned an unreadable response.");
  }
  if (!response.ok) {
    throw new Error(payload?.detail || `Speech recognition failed with status ${response.status}.`);
  }
  if (typeof payload?.text !== "string") {
    throw new Error("The offline speech service returned an invalid transcript.");
  }
  return payload.text;
}

export async function getSpeechServiceHealth({ signal } = {}) {
  let response;
  try {
    response = await fetch(`${speechApiUrl}/api/health`, { cache: "no-store", signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Can't reach the offline speech service. Start it with `python -m uvicorn app:app --host 127.0.0.1 --port 8000` from backend/python.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The offline speech service returned an unreadable health response.");
  }
  if (!response.ok) {
    throw new Error(payload?.detail || `Speech service health check failed with status ${response.status}.`);
  }
  if (payload?.status !== "ok" || !Array.isArray(payload.recognitionLanguages)
    || !payload.recognitionLanguages.every((language) => ["English", "Spanish", "Hindi"].includes(language))) {
    throw new Error("The offline speech service returned invalid recognition-language settings.");
  }
  return { recognitionLanguages: payload.recognitionLanguages };
}
