import type { RequestHandler } from "express";

export const handleExecute: RequestHandler = async (req, res) => {
  try {
    const { sql, limit } = req.body as { sql: string; limit?: number };
    if (!sql) return res.status(400).json({ ok: false, error: "Missing sql" });
    const db = await import("../db");
    // @ts-ignore
    const exec = await db.executeSqlite(sql, limit ?? 200);
    if (exec.executed)
      return res.json({ ok: true, rows: exec.rows, fields: exec.fields });
    return res.json({ ok: false, error: exec.error });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
};
