import "./loadEnv.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config, warnIfPlaceholderGoogleCredentials } from "./lib/config.js";
import { contextStore } from "./services/contextStore.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { contextRoutes } from "./routes/context.js";
import { chatRoutes } from "./routes/chat.js";
import { requireAuth } from "./middleware/auth.js";

function isAllowedOrigin(origin: string): boolean {
  if (origin.startsWith("chrome-extension://")) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  return false;
}

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      return isAllowedOrigin(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.route("/", healthRoutes);
app.route("/", authRoutes);

app.use("/context/*", requireAuth);
app.use("/chat", requireAuth);
app.route("/", contextRoutes);
app.route("/", chatRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("[syncle-services]", err);
  return c.json({ error: "Internal server error" }, 500);
});

warnIfPlaceholderGoogleCredentials();

contextStore.start();

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`syncle-services listening on http://localhost:${info.port}`);
  }
);

function shutdown(): void {
  contextStore.stop();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
