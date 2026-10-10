import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";

const configuredEnv = {
  PORT: "3001",
  FRONTEND_ORIGINS: "http://localhost:5173",
  OPENAI_API_KEY: "test-model-key",
  OPENAI_BASE_URL: "https://model.example/v1",
  OPENAI_MODEL: "test-model",
  ANALYSIS_TIMEOUT_MS: "1000",
};

const modelAnalysis = {
  overview: "A concise overview.",
  readingLevels: {
    simple: "A very simple version.",
    balanced: "A balanced explanation with useful context.",
    detailed: "A detailed explanation that preserves supporting facts and relationships.",
  },
  keyPoints: ["First key idea."],
  pictureExplanations: {
    simple: "A simple visual analogy.",
    balanced: "A visual analogy showing the main ideas together.",
    detailed: "A detailed visual analogy showing how the supporting facts connect.",
  },
  pictureScenes: {
    simple: {
      title: "A simple picture",
      nodes: [
        { icon: "book", label: "The topic", caption: "The document introduces an idea." },
        { icon: "brain", label: "The meaning", caption: "The idea is explained." },
        { icon: "bulb", label: "The takeaway", caption: "The reader understands." },
      ],
    },
    balanced: {
      title: "A connected picture",
      nodes: [
        { icon: "book", label: "The source", caption: "The document presents information." },
        { icon: "chart", label: "The details", caption: "Supporting points build context." },
        { icon: "bulb", label: "The result", caption: "The main message becomes clear." },
      ],
    },
    detailed: {
      title: "A detailed picture",
      nodes: [
        { icon: "book", label: "The subject", caption: "The text establishes its main topic." },
        { icon: "molecule", label: "The relationships", caption: "Evidence connects the central ideas." },
        { icon: "chart", label: "The conclusion", caption: "The reader can follow the implications." },
      ],
    },
  },
  explanationSteps: {
    simple: ["First simple idea.", "Next simple idea.", "Final simple idea."],
    balanced: ["First balanced idea.", "Next balanced idea.", "Final balanced idea."],
    detailed: ["First detailed idea.", "Next detailed idea.", "Final detailed idea."],
  },
};

let server;
let origin;

before(async () => {
  server = createServer(createApp({ env: configuredEnv, logger: { error() {} } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRequest(body, { headers = {} } = {}) {
  return fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeCommandRequest(body, { headers = {} } = {}) {
  return fetch(`${origin}/api/reader-command`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("GET /api/health", () => {
  it("reports readiness without returning provider secrets", async () => {
    const response = await fetch(`${origin}/api/health`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload, { status: "ok", analysisConfigured: true });
    assert.equal(JSON.stringify(payload).includes("test-model-key"), false);
  });
});

describe("POST /api/analyze", () => {
  it("rejects invalid requests before calling the model provider", async () => {
    const response = await makeRequest({ text: "  " });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.error, "Invalid analysis request.");
  });

  it("does not require a Supabase account or bearer token to analyze and return results", async () => {
    let providerRequest;
    const testServer = createServer(createApp({
      env: configuredEnv,
      logger: { error() {} },
      async fetchImpl(url, options) {
        providerRequest = { url, options, body: JSON.parse(options.body) };
        return jsonResponse({ choices: [{ message: { content: JSON.stringify(modelAnalysis) } }] });
      },
    }));
    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "A private source document.",
          title: "My document",
          readingLevel: "simple",
          language: "English",
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.title, "My document");
      assert.equal(payload.readingLevel, "simple");
      assert.deepEqual(payload.analysis, modelAnalysis);
      assert.equal(payload.model, configuredEnv.OPENAI_MODEL);
      assert.equal(providerRequest.url, `${configuredEnv.OPENAI_BASE_URL}/chat/completions`);
      assert.equal(providerRequest.body.model, configuredEnv.OPENAI_MODEL);
      assert.equal(providerRequest.options.headers.Authorization, `Bearer ${configuredEnv.OPENAI_API_KEY}`);
      assert.equal(providerRequest.options.headers["Content-Type"], "application/json");
      assert.equal(providerRequest.body.messages[1].content.includes("A private source document."), true);
    } finally {
      await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("returns a clear configuration error when the provider key is missing", async () => {
    const unconfiguredServer = createServer(createApp({
      env: { PORT: "3002" },
      logger: { error() {} },
    }));
    await new Promise((resolve) => unconfiguredServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${unconfiguredServer.address().port}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A document." }),
      });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /OPENAI_API_KEY/);
    } finally {
      await new Promise((resolve, reject) => unconfiguredServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("does not return success when the provider gives malformed analysis", async () => {
    const testServer = createServer(createApp({
      env: configuredEnv,
      logger: { error() {} },
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "not json" } }] }),
    }));
    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A document." }),
      });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /invalid analysis data/i);
    } finally {
      await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("rejects analysis output that repeats the same content for every reading level", async () => {
    const duplicateAnalysis = {
      ...modelAnalysis,
      readingLevels: { simple: "Same text.", balanced: "Same text.", detailed: "Same text." },
    };
    const testServer = createServer(createApp({
      env: configuredEnv,
      logger: { error() {} },
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: JSON.stringify(duplicateAnalysis) } }] }),
    }));
    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A document." }),
      });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /unexpected result format/i);
    } finally {
      await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("rejects a pictorial scene that does not contain exactly three subjects", async () => {
    const invalidAnalysis = {
      ...modelAnalysis,
      pictureScenes: {
        ...modelAnalysis.pictureScenes,
        simple: {
          ...modelAnalysis.pictureScenes.simple,
          nodes: modelAnalysis.pictureScenes.simple.nodes.slice(0, 2),
        },
      },
    };
    const testServer = createServer(createApp({
      env: configuredEnv,
      logger: { error() {} },
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: JSON.stringify(invalidAnalysis) } }] }),
    }));
    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A document." }),
      });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /unexpected result format/i);
    } finally {
      await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
    }
  });
});

describe("POST /api/reader-command", () => {
  it("returns the revised document rather than an answer about the command", async () => {
    let providerRequest;
    const testServer = createServer(createApp({
      env: configuredEnv,
      logger: { error() {} },
      async fetchImpl(url, options) {
        providerRequest = { url, options, body: JSON.parse(options.body) };
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify({ text: "The revised document in Telugu." }) } }],
        });
      },
    }));
    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/reader-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "A private source document.",
          command: "Translate the document to Telugu.",
          title: "My document",
          language: "English",
        }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { text: "The revised document in Telugu.", model: configuredEnv.OPENAI_MODEL });
      assert.equal(providerRequest.url, `${configuredEnv.OPENAI_BASE_URL}/chat/completions`);
      assert.equal(providerRequest.body.model, configuredEnv.OPENAI_MODEL);
      assert.equal(providerRequest.body.messages[0].content.includes("not an explanation or an answer"), true);
      assert.equal(providerRequest.body.messages[1].content.includes("Translate the document to Telugu."), true);
      assert.equal(providerRequest.body.messages[1].content.includes("A private source document."), true);
    } finally {
      await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("rejects an empty command before calling the model provider", async () => {
    const response = await makeCommandRequest({ text: "A document.", command: " " });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "Invalid reader command request.");
  });

  it("reports when the provider key is not configured", async () => {
    const unconfiguredServer = createServer(createApp({
      env: { PORT: "3002", GROQ_BASE_URL: "https://api.groq.com/openai/v1" },
      logger: { error() {} },
    }));
    await new Promise((resolve) => unconfiguredServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${unconfiguredServer.address().port}/api/reader-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A document.", command: "Make it simpler." }),
      });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /GROQ_API_KEY/);
    } finally {
      await new Promise((resolve, reject) => unconfiguredServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("explains when the model provider has no billing credits", async () => {
    const testServer = createServer(createApp({
      env: configuredEnv,
      logger: { error() {} },
      fetchImpl: async () => jsonResponse({
        error: {
          type: "insufficient_quota",
          message: "You have no credits remaining.",
        },
      }, 429),
    }));
    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/reader-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A document.", command: "Make it simpler." }),
      });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /no credits remaining|billing quota/i);
    } finally {
      await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("uses Groq credentials and model settings without falling back to an OpenAI key", async () => {
    let providerRequest;
    const groqEnv = {
      ...configuredEnv,
      OPENAI_API_KEY: "unused-openai-key",
      GROQ_API_KEY: "test-groq-key",
      GROQ_BASE_URL: "https://api.groq.com/openai/v1/",
      GROQ_MODEL: "openai/gpt-oss-120b",
    };
    const testServer = createServer(createApp({
      env: groqEnv,
      logger: { error() {} },
      async fetchImpl(url, options) {
        providerRequest = { url, options, body: JSON.parse(options.body) };
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify({ text: "Groq revised document." }) } }],
        });
      },
    }));
    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/reader-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A document.", command: "Simplify this." }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        text: "Groq revised document.",
        model: "openai/gpt-oss-120b",
      });
      assert.equal(providerRequest.url, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(providerRequest.options.headers.Authorization, "Bearer test-groq-key");
      assert.equal(providerRequest.body.model, "openai/gpt-oss-120b");
    } finally {
      await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
    }
  });
});

it("rejects an unapproved frontend origin", async () => {
  const response = await makeRequest({ text: "A document." }, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(response.status, 403);
});
