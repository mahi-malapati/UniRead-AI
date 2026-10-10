import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import {
  analysisRequestSchema,
  ProviderError,
  requestReaderCommand,
  requestTextAnalysis,
  readerCommandRequestSchema,
} from "./analysis.js";
import { isAnalysisConfigured, readConfig } from "./config.js";

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
