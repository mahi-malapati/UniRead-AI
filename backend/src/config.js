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
    geminiApiKey: env.GEMINI_API_KEY || "",
    geminiApiBaseUrl: (env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, ""),
    geminiSpeechModel: env.GEMINI_SPEECH_MODEL || "gemini-3.8-flash-lite-tts",
    geminiTranscriptionModel: env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.8-flash",
    geminiCommandModel: env.GEMINI_COMMAND_MODEL || env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.8-flash",
    speechTimeoutMs: speechTimeout,
  };
}

export function isAnalysisConfigured(config) {
  return Boolean(config.openAiApiKey || config.geminiApiKey);
}

export function isCommandConfigured(config) {
  return Boolean(config.geminiApiKey || config.openAiApiKey);
}

export function isSpeechConfigured(config) {
  return Boolean(config.geminiApiKey);
}
