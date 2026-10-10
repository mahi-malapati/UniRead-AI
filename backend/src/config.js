export function readConfig(env = process.env) {
  const timeout = Number(env.ANALYSIS_TIMEOUT_MS || 45_000);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error("ANALYSIS_TIMEOUT_MS must be an integer from 1000 to 120000.");
  }

  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }

  const openAiBaseUrl = (
    env.GROQ_BASE_URL
    || env.OPENAI_BASE_URL
    || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const usesGroq = new URL(openAiBaseUrl).hostname === "api.groq.com";
  const speechTimeout = Number(env.SPEECH_TIMEOUT_MS || timeout);
  if (!Number.isInteger(speechTimeout) || speechTimeout < 1_000 || speechTimeout > 120_000) {
    throw new Error("SPEECH_TIMEOUT_MS must be an integer from 1000 to 120000.");
  }

  const frontendOrigins = (env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5177,http://127.0.0.1:5177")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const deploymentOrigins = [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter(Boolean)
    .map((host) => {
      try {
        return new URL(host.startsWith("http") ? host : `https://${host}`).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return {
    port,
    frontendOrigins: [...new Set([...frontendOrigins, ...deploymentOrigins])],
    openAiApiKey: usesGroq
      ? env.GROQ_API_KEY || ""
      : env.OPENAI_API_KEY || env.GROQ_API_KEY || "",
    apiKeyName: usesGroq ? "GROQ_API_KEY" : "OPENAI_API_KEY",
    openAiBaseUrl,
    openAiModel: usesGroq
      ? env.GROQ_MODEL || env.OPENAI_MODEL || "openai/gpt-oss-120b"
      : env.OPENAI_MODEL || env.GROQ_MODEL || "gpt-4o-mini",
    analysisTimeoutMs: timeout,
    elevenLabsApiKey: env.ELEVENLABS_API_KEY || "",
    elevenLabsBaseUrl: (env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, ""),
    elevenLabsFemaleVoiceId: env.ELEVENLABS_FEMALE_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
    elevenLabsMaleVoiceId: env.ELEVENLABS_MALE_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
    speechTimeoutMs: speechTimeout,
  };
}

export function isAnalysisConfigured(config) {
  return Boolean(config.openAiApiKey);
}

export function isSpeechConfigured(config) {
  return Boolean(config.elevenLabsApiKey);
}
