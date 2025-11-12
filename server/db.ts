import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import alasql from "alasql";

const DATA_DIR = path.resolve(process.cwd(), "data");

// In-memory alasql database instance
const DB = new alasql.Database();

export async function initSqliteFromCsvs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const csvFiles = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  for (const file of csvFiles) {
    try {
      const filePath = path.join(DATA_DIR, file);
      const content = fs.readFileSync(filePath, "utf8");
      const records = parse(content, { columns: true, skip_empty_lines: true });
      if (!records || records.length === 0) continue;

      const table = sanitizeName(path.basename(file, ".csv"));

      // Add derived fields for certain tables (normalize dates, numeric fields)
      if (table === "olist_orders_dataset") {
        for (const r of records) {
          const ts = (r["order_purchase_timestamp"] || "").trim();
          if (ts && ts.length >= 10) {
            const day = ts.substr(0, 2);
            const month = ts.substr(3, 2);
            const year = ts.substr(6, 4);
            const timePart = ts.length > 11 ? ts.substr(11) : "00:00";
            const iso = `${year}-${month}-${day} ${timePart}`;
            r["order_purchase_iso"] = iso;
            r["order_year_month"] = `${year}-${month}`;
            const m = parseInt(month || "0", 10);
            const q = Math.floor((Math.max(1, m) - 1) / 3) + 1;
            r["order_quarter"] = `${year}-Q${q}`;
          } else {
            r["order_purchase_iso"] = null;
            r["order_year_month"] = null;
            r["order_quarter"] = null;
          }
        }
      }

      if (table === "olist_order_items_dataset") {
        for (const r of records) {
          const p = String(r["price"] || "").replace(/[^0-9.-]+/g, "");
          const f = String(r["freight_value"] || "").replace(/[^0-9.-]+/g, "");
          r["price_num"] = p || null;
          r["freight_num"] = f || null;
        }
      }

      const cols = Object.keys(records[0]);

      // Build create table with TEXT columns (alasql will accept any) using [] identifiers
      const colDefs = cols.map((c) => `[${sanitizeName(c)}] TEXT`).join(", ");
      const createSql = `CREATE TABLE IF NOT EXISTS [${table}] (${colDefs})`;
      DB.exec(createSql);

      // If table already has data, skip
      const existing = DB.exec(`SELECT COUNT(1) as c FROM [${table}]`);
      if (existing && existing[0] && existing[0].c > 0) continue;

      const insertSql = `INSERT INTO [${table}] (${cols.map((c) => `[${sanitizeName(c)}]`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
      for (const r of records) {
        const vals = cols.map((c) =>
          r[c] === undefined || r[c] === null ? null : String(r[c]),
        );
        DB.exec(insertSql, vals);
      }
    } catch (e) {
      console.error("Failed to load CSV", file, e);
    }
  }
}

export async function executeSqlite(sql: string, limit = 200) {
  if (!fs.existsSync(DATA_DIR)) {
    return {
      executed: false as const,
      error:
        "Local data directory not found. Add CSV files into /data and restart.",
    };
  }
  try {
    // Clean SQL
    let cleaned = sql.trim();
    
    // Remove trailing semicolons
    cleaned = cleaned.replace(/;+\s*$/, "");
    
    // Remove markdown code fences if present
    cleaned = cleaned.replace(/^```[\w]*\n?/i, "").replace(/\n?```$/i, "");
    
    // Check if it's a SELECT statement (for safety, only allow SELECT)
    // Allow comments and whitespace before SELECT
    const selectMatch = cleaned.match(/(?:--[\s\S]*?\n|\/\*[\s\S]*?\*\/|\s)*SELECT/i);
    if (!selectMatch) {
      // Check if it might be a malformed query
      if (cleaned.length < 10) {
        return {
          executed: false as const,
          error: "SQL query appears to be empty or too short.",
        };
      }
      return {
        executed: false as const,
        error: `Only SELECT queries are allowed for security reasons. Query must start with SELECT. Got: ${cleaned.substring(0, 50)}...`,
      };
    }
    
    // Extract the actual SELECT statement (remove any leading comments)
    const selectIndex = cleaned.search(/SELECT/i);
    if (selectIndex > 0) {
      cleaned = cleaned.substring(selectIndex);
    }
    
    // Validate SQL completeness - check for incomplete WHERE clauses
    if (/\bWHERE\s+/i.test(cleaned)) {
      // Check if WHERE clause looks incomplete (column name without operator/value)
      const whereMatch = cleaned.match(/\bWHERE\s+([\s\S]*?)(?:\bGROUP\s+BY|\bORDER\s+BY|\bLIMIT|$)/i);
      if (whereMatch) {
        const whereClause = whereMatch[1].trim();
        // Check if WHERE clause ends with just a column name (incomplete)
        // Pattern: column name followed by end, AND, or OR without a condition
        const incompletePattern = /^\[?[\w]+\]?\s*(AND|OR)?\s*$/i;
        if (incompletePattern.test(whereClause)) {
          return {
            executed: false as const,
            error: `SQL query appears incomplete. The WHERE clause is missing a condition. Found: WHERE ${whereClause}`,
          };
        }
      }
    }
    
    // Check for LIMIT clause
    const hasLimit = /\blimit\s+\d+/i.test(cleaned);
    
    // Add LIMIT if not present and it's not an aggregate-only query
    // (Some queries like COUNT(*) don't need LIMIT, but we'll add it anyway for safety)
    const limited = hasLimit
      ? cleaned
      : `${cleaned} LIMIT ${Math.max(1, Math.min(1000, limit))}`;
    
    // Execute query
    const rows = DB.exec(limited) as any[];
    
    // Handle empty results
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return {
        executed: true as const,
        rows: [],
        fields: [],
      };
    }
    
    const fields = Object.keys(rows[0]);
    
    // Convert numeric strings to numbers where appropriate
    const processedRows = rows.map((row: any) => {
      const processed: any = {};
      for (const key in row) {
        const value = row[key];
        // Try to convert to number if it looks like a number
        if (typeof value === "string" && value !== "" && !isNaN(Number(value)) && value.trim() !== "") {
          const num = Number(value);
          // Only convert if it's a valid number representation
          if (!isNaN(num) && isFinite(num)) {
            processed[key] = num;
          } else {
            processed[key] = value;
          }
        } else {
          processed[key] = value;
        }
      }
      return processed;
    });
    
    return { executed: true as const, rows: processedRows, fields };
  } catch (e: any) {
    // Provide more helpful error messages
    let errorMessage = e.message || "Unknown error";
    
    // Common SQLite/alasql errors
    if (errorMessage.includes("no such table") || errorMessage.includes("Table")) {
      errorMessage = `Table not found. Available tables: ${listCsvFiles().map(f => f.name).join(", ")}`;
    } else if (errorMessage.includes("no such column") || errorMessage.includes("Column") || errorMessage.includes("Cannot read properties of undefined")) {
      // Extract column name if possible
      const columnMatch = errorMessage.match(/['"`]?(\w+)['"`]?/);
      const columnName = columnMatch ? columnMatch[1] : "unknown";
      errorMessage = `Column "${columnName}" not found. Common issues:\n` +
        `- "order_value" doesn't exist - use payments.[payment_value] or SUM([order_items].[price] + [order_items].[freight_value])\n` +
        `- Check that column names use square brackets: [column_name]\n` +
        `- Verify the table schema matches your query`;
    } else if (errorMessage.includes("syntax error") || errorMessage.includes("Syntax")) {
      errorMessage = `SQL syntax error: ${errorMessage}\n` +
        `Make sure to use SQLite-compatible syntax and square brackets for identifiers.`;
    } else if (errorMessage.includes("undefined")) {
      errorMessage = `Query error: ${errorMessage}\n` +
        `This often means a column or table doesn't exist. Check your table and column names.`;
    }
    
    return { executed: false as const, error: errorMessage };
  }
}

export function listCsvFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => ({ name: path.basename(f, ".csv"), file: f }));
}

export function previewCsv(table: string, limit = 10) {
  const filePath = path.join(DATA_DIR, `${table}.csv`);
  if (!fs.existsSync(filePath)) return { ok: false, error: "CSV not found" };
  const content = fs.readFileSync(filePath, "utf8");
  const records = parse(content, { columns: true, skip_empty_lines: true });
  return { ok: true, rows: records.slice(0, limit) };
}

function sanitizeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}
