import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();
const app = createApp();
const server = app.listen(config.port, () => {
  console.info(`UniRead API listening on http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.info(`${signal} received. Closing the API server.`);
  server.close((error) => {
    if (error) {
      console.error("Could not close the API server cleanly.", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
