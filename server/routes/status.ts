import type { RequestHandler } from "express";
import type { StatusResponse } from "@shared/api";
import fs from "fs";
import { listCsvFiles } from "../db";

function pickProvider() {
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  if (hasOpenRouter) return "openrouter" as const;
  if (hasGemini) return "gemini" as const;
  return "none" as const;
}

export const handleStatus: RequestHandler = (_req, res) => {
  const provider = pickProvider();
  const dataDirExists = fs.existsSync("./data") && listCsvFiles().length > 0;
  const tips: string[] = [];
  if (provider === "none")
    tips.push("Set OPENROUTER_API_KEY or GEMINI_API_KEY to enable AI.");
  if (!dataDirExists)
    tips.push(
      "Drop CSV files into the ./data folder and restart the app to enable local query execution.",
    );

  const payload: StatusResponse = {
    provider,
    hasDatabase: dataDirExists,
    databaseUrlConfigured: dataDirExists,
    tips,
  };
  res.status(200).json(payload);
};
