import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleAgent } from "./routes/agent";
import { handleStatus } from "./routes/status";
import { initSqliteFromCsvs, listCsvFiles, previewCsv } from "./db";
import { handleExecute } from "./routes/execute";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  // Initialize local DB from CSVs (non-blocking)
  initSqliteFromCsvs().catch((e) => console.error("DB init failed", e));

  app.get("/api/demo", handleDemo);
  app.post("/api/agent", handleAgent);
  app.get("/api/status", handleStatus);

  // Data endpoints for local CSVs
  app.get("/api/data/files", (_req, res) => {
    res.json({ files: listCsvFiles() });
  });

  app.get("/api/data/preview", (req, res) => {
    const table = String(req.query.table || "");
    const limit = Number(req.query.limit || 10);
    const result = previewCsv(table, limit);
    res.json(result);
  });

  app.post("/api/execute", handleExecute);

  return app;
}
