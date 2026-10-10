import { ProviderError } from "./analysis.js";

const voiceIds = {
  female: "elevenLabsFemaleVoiceId",
  male: "elevenLabsMaleVoiceId",
};

const languageCodes = {
  English: "en",
  Spanish: "es",
  Hindi: "hi",
  Telugu: "te",
};

async function getProviderError(response, operation) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderError("ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY in backend/.env.", 502);
  }
  if (response.status === 429) {
    return new ProviderError("ElevenLabs rate limit or account quota reached. Check your ElevenLabs plan and try again.", 429);
  }

  const providerMessage = payload?.detail?.message
    || payload?.detail
    || payload?.message
    || payload?.error?.message;
  if (typeof providerMessage === "string" && providerMessage.length < 300) {
    return new ProviderError(`ElevenLabs ${operation} failed: ${providerMessage}`, 502);
  }
  return new ProviderError(`ElevenLabs ${operation} failed with status ${response.status}.`, 502);
}

export async function requestSpeechSynthesis({ config, input, fetchImpl }) {
  const voiceId = config[voiceIds[input.voice]];
  const url = `${config.elevenLabsBaseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "xi-api-key": config.elevenLabsApiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: "eleven_flash_v2_5",
      language_code: languageCodes[input.language],
    }),
    signal: AbortSignal.timeout(config.speechTimeoutMs),
  });

  if (!response.ok) throw await getProviderError(response, "speech synthesis");
  return Buffer.from(await response.arrayBuffer());
}

export async function requestSpeechTranscription({ config, audio, contentType, language, fetchImpl }) {
  const form = new FormData();
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  const extension = normalizedType.includes("webm") ? "webm"
    : normalizedType.includes("ogg") ? "ogg"
      : normalizedType.includes("mp4") ? "mp4"
        : normalizedType.includes("mpeg") ? "mp3"
          : "wav";
  form.append("file", new Blob([audio], { type: normalizedType || "audio/wav" }), `recording.${extension}`);
  form.append("model_id", "scribe_v2");
  if (languageCodes[language]) form.append("language_code", languageCodes[language]);

  const response = await fetchImpl(`${config.elevenLabsBaseUrl}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsApiKey },
    body: form,
    signal: AbortSignal.timeout(config.speechTimeoutMs),
  });

  if (!response.ok) throw await getProviderError(response, "speech recognition");

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError("ElevenLabs returned an unreadable speech recognition response.", 502);
  }
  if (typeof payload?.text !== "string") {
    throw new ProviderError("ElevenLabs returned an invalid speech recognition response.", 502);
  }
  return payload.text;
}
