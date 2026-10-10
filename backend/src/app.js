import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z, ZodError } from "zod";
import {
  analysisRequestSchema,
  ProviderError,
  requestReaderCommand,
  requestTextAnalysis,
  readerCommandRequestSchema,
} from "./analysis.js";
import { isAnalysisConfigured, isSpeechConfigured, readConfig } from "./config.js";
import { requestSpeechSynthesis, requestSpeechTranscription } from "./speech.js";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApp({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  const config = readConfig(env);
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new HttpError(403, "This website origin is not allowed."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }));
  app.use(express.json({ limit: "512kb", strict: true }));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      analysisConfigured: isAnalysisConfigured(config),
    });
  });

  const analyzeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many analysis requests. Wait a minute and try again." },
  });
  const speechLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many speech requests. Wait a minute and try again." },
  });

  app.get("/api/speech/health", (_request, response) => {
    const configured = isSpeechConfigured(config);
    response.json({
      status: "ok",
      speechConfigured: configured,
      recognitionLanguages: configured ? ["English", "Spanish", "Hindi", "Telugu"] : [],
    });
  });

  app.post("/api/speech", speechLimiter, async (request, response, next) => {
    try {
      if (!isSpeechConfigured(config)) {
        throw new HttpError(503, "Speech is not configured. Set ELEVENLABS_API_KEY in backend/.env and restart the API.");
      }
      const parsed = z.strictObject({
        text: z.string().trim().min(1).max(40_000),
        voice: z.enum(["female", "male"]).default("female"),
        language: z.enum(["English", "Spanish", "Hindi", "Telugu"]).default("English"),
      }).safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      try {
        const audio = await requestSpeechSynthesis({ config, input: parsed.data, fetchImpl });
        response
          .status(200)
          .set("Content-Type", "audio/mpeg")
          .set("Cache-Control", "no-store")
          .send(audio);
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          throw new ProviderError("ElevenLabs speech synthesis timed out. Try shorter text or retry later.", 504);
        }
        logger.error("ElevenLabs speech synthesis request failed.", error);
        throw new ProviderError("ElevenLabs speech synthesis is temporarily unavailable.", 503);
      }
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/speech/transcribe",
    speechLimiter,
    express.raw({ type: ["audio/*", "application/octet-stream"], limit: "20mb" }),
    async (request, response, next) => {
      try {
        if (!isSpeechConfigured(config)) {
          throw new HttpError(503, "Speech recognition is not configured. Set ELEVENLABS_API_KEY in backend/.env and restart the API.");
        }
        const language = z.enum(["English", "Spanish", "Hindi", "Telugu"]).safeParse(request.query.language);
        if (!language.success) {
          throw new HttpError(400, "Choose a supported speech recognition language.");
        }
        if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
          throw new HttpError(400, "No audio was received. Record a short voice clip and try again.");
        }

        try {
          const text = await requestSpeechTranscription({
            config,
            audio: request.body,
            contentType: request.get("content-type") || "audio/wav",
            language: language.data,
            fetchImpl,
          });
          response.status(200).json({ text });
        } catch (error) {
          if (error instanceof ProviderError) throw error;
          if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            throw new ProviderError("ElevenLabs speech recognition timed out. Record a shorter clip or retry later.", 504);
          }
          logger.error("ElevenLabs speech recognition request failed.", error);
          throw new ProviderError("ElevenLabs speech recognition is temporarily unavailable.", 503);
        }
      } catch (error) {
        next(error);
      }
    },
  );

  app.post("/api/analyze", analyzeLimiter, async (request, response, next) => {
    try {
      if (!isAnalysisConfigured(config)) {
        throw new HttpError(503, `Analysis is not configured. Set ${config.apiKeyName} in backend/.env and restart the API.`);
      }

      const parsedRequest = analysisRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) throw parsedRequest.error;

      const input = parsedRequest.data;
      let analysis;
      try {
        analysis = await requestTextAnalysis({ config, input, fetchImpl });
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          throw new ProviderError("Text analysis timed out. Try a shorter document or retry later.", 504);
        }
        logger.error("Text analysis provider request failed.", error);
        throw new ProviderError("The text analysis provider is temporarily unavailable.", 503);
      }

      response.status(200).json({
        title: input.title || "Untitled document",
        readingLevel: input.readingLevel,
        language: input.language,
        analysis,
        model: config.openAiModel,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reader-command", analyzeLimiter, async (request, response, next) => {
    try {
      if (!isAnalysisConfigured(config)) {
        throw new HttpError(503, `Model commands are not configured. Set ${config.apiKeyName} in backend/.env and restart the API.`);
      }

      const parsedRequest = readerCommandRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) throw parsedRequest.error;

      let text;
      try {
        text = await requestReaderCommand({ config, input: parsedRequest.data, fetchImpl });
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          throw new ProviderError("The document command timed out. Try a shorter document or retry later.", 504);
        }
        logger.error("Reader command provider request failed.", error);
        throw new ProviderError("The model could not apply that command right now.", 503);
      }

      response.status(200).json({
        text,
        model: config.openAiModel,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        error: request.path === "/api/reader-command"
          ? "Invalid reader command request."
          : request.path.startsWith("/api/speech")
            ? "Invalid speech request."
            : "Invalid analysis request.",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    if (error instanceof HttpError || error instanceof ProviderError) {
      response.status(error.status).json({ error: error.message });
      return;
    }

    if (error?.type === "entity.too.large") {
      response.status(413).json({ error: "Request body is too large." });
      return;
    }

    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "Request body must contain valid JSON." });
      return;
    }

    logger.error("Unhandled API error.", error);
    response.status(500).json({ error: "An unexpected server error occurred." });
  });

  return app;
}
