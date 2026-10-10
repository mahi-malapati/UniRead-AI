import { ProviderError } from "./analysis.js";

const voices = {
  female: "Kore",
  male: "Puck",
};

async function getProviderError(response, operation) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderError("Google AI Studio rejected the API key. Check GEMINI_API_KEY in backend/.env.", 502);
  }
  if (response.status === 429) {
    return new ProviderError("Google AI Studio rate limit or quota reached. Check your Google AI Studio project and try again.", 429);
  }

  const providerMessage = payload?.error?.message;
  if (typeof providerMessage === "string" && providerMessage.length < 300) {
    return new ProviderError(`Google AI Studio ${operation} failed: ${providerMessage}`, 502);
  }
  return new ProviderError(`Google AI Studio ${operation} failed with status ${response.status}.`, 502);
}

async function readJsonResponse(response, operation) {
  try {
    return await response.json();
  } catch {
    throw new ProviderError(`Google AI Studio returned an unreadable ${operation} response.`, 502);
  }
}

export async function requestSpeechSynthesis({ config, input, fetchImpl }) {
  const response = await fetchImpl(`${config.geminiApiBaseUrl}/v1beta/interactions`, {
    method: "POST",
    headers: {
      "x-goog-api-key": config.geminiApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.geminiSpeechModel,
      input: [{
        type: "user_input",
        content: [{
          type: "text",
          text: input.text,
          annotations: [{
            type: "speech_metadata",
            style: `Read clearly and naturally in ${input.language}. Read the text verbatim; do not translate or add words.`,
          }],
        }],
      }],
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [{ voice: voices[input.voice] }],
      },
    }),
    signal: AbortSignal.timeout(config.speechTimeoutMs),
  });

  if (!response.ok) throw await getProviderError(response, "speech synthesis");
  const payload = await readJsonResponse(response, "speech synthesis");
  const audioData = payload.output_audio?.data
    || payload.steps
      ?.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content || [])
      .filter((part) => part.type === "audio")
      .at(-1)
      ?.data;
  if (typeof audioData !== "string" || !audioData) {
    throw new ProviderError("Google AI Studio returned no speech audio.", 502);
  }
  return Buffer.from(audioData, "base64");
}

export async function requestSpeechTranscription({ config, audio, contentType, language, fetchImpl }) {
  const response = await fetchImpl(
    `${config.geminiApiBaseUrl}/v1beta/models/${encodeURIComponent(config.geminiTranscriptionModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": config.geminiApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              text: `Transcribe the spoken words verbatim in ${language}. Return only the transcription, without labels, translation, timestamps, or explanation.`,
            },
            {
              inline_data: {
                mime_type: contentType.split(";")[0].trim().toLowerCase() || "audio/wav",
                data: audio.toString("base64"),
              },
            },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(config.speechTimeoutMs),
    },
  );

  if (!response.ok) throw await getProviderError(response, "speech recognition");
  const payload = await readJsonResponse(response, "speech recognition");
  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text)
    .filter((part) => typeof part === "string")
    .join("")
    .trim();
  if (typeof text !== "string") {
    throw new ProviderError("Google AI Studio returned an invalid speech recognition response.", 502);
  }
  return text;
}
