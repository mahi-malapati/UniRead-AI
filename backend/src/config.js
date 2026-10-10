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

  return {
    port,
    frontendOrigins: (env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5177,http://127.0.0.1:5177")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    openAiApiKey: usesGroq
      ? env.GROQ_API_KEY || ""
      : env.OPENAI_API_KEY || env.GROQ_API_KEY || "",
    apiKeyName: usesGroq ? "GROQ_API_KEY" : "OPENAI_API_KEY",
    openAiBaseUrl,
    openAiModel: usesGroq
      ? env.GROQ_MODEL || env.OPENAI_MODEL || "openai/gpt-oss-120b"
      : env.OPENAI_MODEL || env.GROQ_MODEL || "gpt-4o-mini",
    analysisTimeoutMs: timeout,
  };
}

export function isAnalysisConfigured(config) {
  return Boolean(config.openAiApiKey);
}
