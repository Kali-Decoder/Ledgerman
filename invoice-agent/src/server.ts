import express from "express";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import gmailRoutes from "./routes/gmail.routes.js";
import slackRoutes from "./routes/slack.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import { startSlackSocketMode } from "./services/slack-socket.service.js";

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(
  "/slack/interactions",
  express.urlencoded({
    extended: true,
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/gmail", gmailRoutes);
app.use("/slack", slackRoutes);
app.use("/payment", paymentRoutes);
app.use("/agent", agentRoutes);

app.listen(env.port, async () => {
  logger.info(`Invoice agent listening on port ${env.port}`);
  try {
    await startSlackSocketMode();
  } catch (err) {
    logger.error("Failed to start Slack Socket Mode", err);
  }
});
