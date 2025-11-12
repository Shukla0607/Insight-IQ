import type { RequestHandler } from "express";
import type { AgentRequest, AgentResponse, ChatMessage } from "@shared/api";

const OLIST_SCHEMA = `
You are an intelligent SQL data assistant connected to the Olist E-commerce dataset (CSV-based database).

Your goal is to understand user questions about sales, customers, products, payments, and reviews — and automatically:
1. Select the correct CSV(s) relevant to the query.
2. Generate a valid SQL query that matches the schema and datatypes.
3. Execute it safely on the selected CSV(s).
4. Return: The SQL query, A concise explanation of the result, A suitable visualization format (bar, pie, line, or table).

Available CSVs and Schema (use EXACT table names with square brackets):

1️⃣ [olist_order_items_dataset]
- Columns: [order_id] (TEXT), [order_item_id] (INTEGER), [product_id] (TEXT), [seller_id] (TEXT), [shipping_limit_date] (DATETIME), [price] (FLOAT), [freight_value] (FLOAT)

2️⃣ [olist_order_payments_dataset]
- Columns: [order_id] (TEXT), [payment_sequential] (INTEGER), [payment_type] (TEXT), [payment_installments] (INTEGER), [payment_value] (FLOAT)

3️⃣ [olist_order_reviews_dataset]
- Columns: [review_id] (TEXT), [order_id] (TEXT), [review_score] (INTEGER), [review_comment_title] (TEXT), [review_comment_message] (TEXT), [review_creation_date] (DATETIME), [review_answer_timestamp] (DATETIME)

4️⃣ [olist_orders_dataset]
- Columns: [order_id] (TEXT), [customer_id] (TEXT), [order_status] (TEXT), [order_purchase_timestamp] (DATETIME), [order_approved_at] (DATETIME), [order_delivered_carrier_date] (DATETIME), [order_delivered_customer_date] (DATETIME), [order_estimated_delivery_date] (DATETIME)

5️⃣ [olist_products_dataset]
- Columns: [product_id] (TEXT), [product_category_name] (TEXT), [product_name_lenght] (INTEGER), [product_description_lenght] (INTEGER), [product_photos_qty] (INTEGER), [product_weight_g] (FLOAT), [product_length_cm] (FLOAT), [product_height_cm] (FLOAT), [product_width_cm] (FLOAT)

6️⃣ [olist_sellers_dataset]
- Columns: [seller_id] (TEXT), [seller_zip_code_prefix] (INTEGER), [seller_city] (TEXT), [seller_state] (TEXT)

7️⃣ [product_category_name_translation]
- Columns: [product_category_name] (TEXT), [product_category_name_english] (TEXT)

8️⃣ [olist_customers_dataset]
- Columns: [customer_id] (TEXT), [customer_unique_id] (TEXT), [customer_zip_code_prefix] (INTEGER), [customer_city] (TEXT), [customer_state] (TEXT)

9️⃣ [olist_geolocation_dataset]
- Columns: [geolocation_zip_code_prefix] (INTEGER), [geolocation_lat] (FLOAT), [geolocation_lng] (FLOAT), [geolocation_city] (TEXT), [geolocation_state] (TEXT)

Relationships Between Tables (JOIN keys):

- [olist_orders_dataset].[customer_id] → [olist_customers_dataset].[customer_id]
- [olist_orders_dataset].[order_id] → [olist_order_items_dataset].[order_id]
- [olist_orders_dataset].[order_id] → [olist_order_payments_dataset].[order_id]
- [olist_orders_dataset].[order_id] → [olist_order_reviews_dataset].[order_id]
- [olist_order_items_dataset].[product_id] → [olist_products_dataset].[product_id]
- [olist_order_items_dataset].[seller_id] → [olist_sellers_dataset].[seller_id]
- [olist_customers_dataset].[customer_zip_code_prefix] → [olist_geolocation_dataset].[geolocation_zip_code_prefix]
- [olist_sellers_dataset].[seller_zip_code_prefix] → [olist_geolocation_dataset].[geolocation_zip_code_prefix]
- [olist_products_dataset].[product_category_name] → [product_category_name_translation].[product_category_name]

Rules for Query Generation:
1. Always validate that columns exist in the schema above.
2. Use standard SQL compatible with DuckDB/SQLite (avoid unsupported syntax like RANK() OVER()).
3. Always use explicit JOINs with correct keys when combining datasets.
4. Use appropriate aggregates: AVG(), COUNT(), SUM(), MAX(), MIN(), etc.
5. For date columns, support filtering and grouping by year, month, or day using strftime().
6. When computing averages or totals, ensure correct numeric columns are used (CAST to REAL if needed).
7. Always use square brackets [] around table and column names.
8. Use COALESCE() to handle NULLs.
9. Monetary fields are in BRL. Timestamps are UTC.

Visualization Rules:
- Bar chart: comparison by categories (cities, products, sellers, etc.)
- Line chart: trends over time (sales, reviews, etc.)
- Pie chart: proportional breakdown (payment type, order status)
- Table: detailed listing (customer orders, product details)
`;

function pickProvider() {
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  if (hasOpenRouter) return "openrouter" as const;
  if (hasGemini) return "gemini" as const;
  return "none" as const;
}

async function callOpenRouter(messages: ChatMessage[], system: string) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
      "X-Title": process.env.OPENROUTER_TITLE || "Olist AI Insights",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/auto",
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.2,
    }),
  });
  if (!resp.ok) {
    const status = resp.status;
    let errorMsg = `OpenRouter error ${status}`;
    if (status === 429) {
      errorMsg = "Rate limit exceeded. Please wait a moment and try again, or check your API key limits.";
    } else if (status === 401) {
      errorMsg = "Invalid API key. Please check your OPENROUTER_API_KEY environment variable.";
    } else if (status === 400) {
      errorMsg = "Invalid request. Please check your query and try again.";
    } else {
      try {
        const errorData = await resp.json();
        errorMsg = errorData.error?.message || errorMsg;
      } catch {
        // Use default error message
      }
    }
    throw new Error(errorMsg);
  }
  const data = await resp.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  return content;
}

async function callGemini(messages: ChatMessage[], system: string) {
  // Gemini expects a single prompt; we will collapse messages
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `System instructions:\n${system}\n\nConversation:\n${messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}`,
        },
      ],
    },
  ];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.2 } }),
  });
  if (!resp.ok) {
    const status = resp.status;
    let errorMsg = `Gemini error ${status}`;
    if (status === 429) {
      errorMsg = "Rate limit exceeded. Please wait a moment and try again. You may need to wait a few seconds between requests or check your API quota.";
    } else if (status === 401) {
      errorMsg = "Invalid API key. Please check your GEMINI_API_KEY environment variable.";
    } else if (status === 400) {
      errorMsg = "Invalid request. Please check your query and try again.";
    } else if (status === 503) {
      errorMsg = "Service temporarily unavailable. Please try again in a moment.";
    } else {
      try {
        const errorData = await resp.json();
        errorMsg = errorData.error?.message || errorData.message || errorMsg;
      } catch {
        // Use default error message
      }
    }
    throw new Error(errorMsg);
  }
  const data = await resp.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text && data.candidates?.[0]?.finishReason) {
    throw new Error(`Gemini response incomplete: ${data.candidates[0].finishReason}`);
  }
  return text;
}

async function maybeExecuteSQL(sql: string, limit = 200) {
  try {
    const dbModule = await import("../db");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const exec = await dbModule.executeSqlite(sql, limit);
    if (exec.executed)
      return { executed: true as const, fields: exec.fields, rows: exec.rows };
    return { executed: false as const, error: exec.error };
  } catch (e) {
    return { executed: false as const, error: (e as Error).message };
  }
}

export const handleAgent: RequestHandler = async (req, res) => {
  const body = req.body as AgentRequest;
  const mode = body.mode || "insights";
  const limit = body.limit ?? 200;
  const provider = pickProvider();
  
  try {
    
    // Get the last user message to check for simple greetings
    const lastMessage = body.messages?.[body.messages.length - 1];
    const userText = lastMessage?.content?.toLowerCase().trim() || "";
    
    // Handle simple greetings without making API calls
    const simpleGreetings = ["hi", "hello", "hey", "greetings", "good morning", "good afternoon", "good evening"];
    if (simpleGreetings.some(g => userText === g || userText.startsWith(g + " "))) {
      const resp: AgentResponse = {
        ok: true,
        mode,
        provider,
        text: "Hello! I'm your Olist e-commerce analytics assistant. I can help you analyze your data by answering questions about orders, products, customers, and sales. Try asking me something like:\n- \"What is the average order value?\"\n- \"Which product category has the highest sales?\"\n- \"Show me top 10 cities by revenue\"\n\nWhat would you like to know?",
      };
      return res.status(200).json(resp);
    }
    
    if (provider === "none") {
      const resp: AgentResponse = {
        ok: false,
        mode,
        notice:
          "No provider configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY.",
        provider,
      };
      return res.status(200).json(resp);
    }

    const systemBase = `You are an intelligent SQL data assistant connected to the Olist E-commerce dataset (CSV-based database).

Your task: When the user enters a natural language prompt (e.g., "What is the average order value for Electronics?"), you must:

1. **Identify which CSV/table(s) are relevant.**
   - If about *customers, orders, reviews* → use [olist_orders_dataset], [olist_customers_dataset], [olist_order_reviews_dataset]
   - If about *products or prices* → use [olist_order_items_dataset], [olist_products_dataset], [product_category_name_translation]
   - If about *payments or revenue* → use [olist_order_payments_dataset], [olist_orders_dataset]
   - If about *geography* → use [olist_geolocation_dataset] with [olist_customers_dataset] or [olist_sellers_dataset]

2. **Generate a valid SQL query** that uses the correct column names, joins, and filters.
   - Always validate that columns exist in the schema.
   - Use standard SQL compatible with DuckDB/SQLite (avoid unsupported syntax like RANK() OVER()).
   - Always use explicit JOINs with correct keys when combining datasets.
   - Use appropriate aggregates: AVG(), COUNT(), SUM(), MAX(), MIN(), etc.
   - For date columns, support filtering and grouping by year, month, or day using strftime().
   - When computing averages or totals, ensure correct numeric columns are used (CAST to REAL if needed).
   - Always use square brackets [] around table and column names.
   - Always complete WHERE clauses with proper conditions (e.g., WHERE [column] = 'value', not just WHERE [column]).

3. **Execute that query** - The SQL will be automatically executed on the selected CSV(s).

4. **Fetch and print the actual numeric or textual answer** (not just the query).
   - Always provide a clear, human-readable answer with the actual result.
   - For single values: "The average order value for Electronics is R$ 245.60."
   - For multiple rows: "São Paulo has the highest number of orders with 15,541 orders."
   - Include the actual numbers from the query results, not just descriptions.

5. **If the result is numerical or categorical, visualize it** using appropriate charts (bar chart, pie, histogram, etc.) for better understanding.
   - Bar chart → comparisons (top products, cities, categories, etc.)
   - Line chart → time trends (sales over time, reviews over time)
   - Pie chart → proportional breakdown (payment types, order status)
   - Table → detailed listings (customer orders, product details)

6. **Always display both the SQL query and the answer clearly.**
   - Format: Provide the answer first, then the SQL query prefixed with 'SQL: ' on its own line.
   - Make the answer prominent and easy to read.

Example:

**User:** "What is the average order value for Electronics?"

**Assistant:**

The average order value for Electronics is R$ 245.60.

SQL: SELECT AVG(CAST([op].[payment_value] AS REAL)) AS avg_order_value
FROM [olist_order_payments_dataset] AS [op]
JOIN [olist_orders_dataset] AS [o] ON [op].[order_id] = [o].[order_id]
JOIN [olist_order_items_dataset] AS [oi] ON [o].[order_id] = [oi].[order_id]
JOIN [olist_products_dataset] AS [p] ON [oi].[product_id] = [p].[product_id]
JOIN [product_category_name_translation] AS [t] ON [p].[product_category_name] = [t].[product_category_name]
WHERE [t].[product_category_name_english] = 'electronics';

Visualization: Single-value display or bar chart comparing categories.

**User:** "What is the average product price including freight?"

**Assistant:**

The average product price including freight is R$ 145.30.

SQL: SELECT AVG(CAST([price] AS REAL) + CAST([freight_value] AS REAL)) AS avg_total_price
FROM [olist_order_items_dataset];

Visualization: Single-value display or bar chart comparing price components.`;

    let system = systemBase;

    // Always produce plain ANSI/SQLite-compatible SQL alongside any natural language answer.
    // Instructions for the model:
    // - Provide a concise natural language answer (one paragraph) followed by a clearly labeled SQL section.
    // - The SQL should be plain text (no markdown fences) and start with the prefix "SQL: " on its own line, or be the last line returned.
    // - Use only standard SQL and SQLite-compatible functions (strftime, date, substr, CAST, COALESCE). Avoid Postgres-only constructs (date_trunc, INTERVAL, RANK() OVER, FILTER, DISTINCT ON).
    // - Prefer simple CTEs and SELECTs. If time grouping is needed, use strftime('%Y-%m', ...) or substr for year-month.
    // - If the user asked for execution, ensure the SQL is safe and returns a reasonable number of rows (include LIMIT if appropriate).
    // - Use square brackets [] for table and column names to handle special characters.
    // - Convert dates using substr() and strftime() for SQLite compatibility.
    // - Use CAST() for numeric conversions: CAST(column AS REAL) or CAST(column AS INTEGER).

    system += `\n\nIMPORTANT OUTPUT FORMAT:
1. Provide a concise natural language answer summarizing the result
2. Always include a SQL query prefixed with 'SQL: ' on its own line
3. Optionally suggest a visualization type if applicable

Example output format:
The average electronic product value is R$ 245.60.

SQL: SELECT AVG(CAST([price] AS REAL)) AS average_value FROM [olist_products_dataset] WHERE [product_category_name] = 'electronics';

Visualization: Bar chart showing category vs average value.`;

    system += `\n\nContext schema:\n${OLIST_SCHEMA}\n\nSQLite/AlaSQL Compatibility Rules:\n- Use square brackets [] for all table and column names (e.g., [olist_orders_dataset], [order_id], [payment_value])\n- CRITICAL: Use the EXACT table names: [olist_orders_dataset], [olist_order_items_dataset], [olist_products_dataset], [olist_order_payments_dataset], [olist_customers_dataset], [olist_sellers_dataset], [olist_geolocation_dataset], [olist_order_reviews_dataset], [product_category_name_translation]\n- Use strftime('%Y-%m', column) for year-month grouping (NOT date_trunc - that's PostgreSQL only)\n- Use substr(column, 1, 10) for date extraction\n- Use CAST(column AS REAL) for numeric conversions (e.g., CAST([price] AS REAL))\n- Use COALESCE() to handle NULLs\n- Avoid PostgreSQL-specific functions (date_trunc, INTERVAL, RANK() OVER, etc.)\n- Avoid window functions unless absolutely necessary (AlaSQL has limited support)\n- Always include LIMIT when appropriate to prevent large result sets\n- CRITICAL: order_value does NOT exist - calculate it from [olist_order_payments_dataset].[payment_value] or SUM([olist_order_items_dataset].[price] + [olist_order_items_dataset].[freight_value])\n- CRITICAL: Always complete WHERE clauses with proper conditions. Example: WHERE [column] = 'value' NOT just WHERE [column]\n- Always verify column names exist in the schema before using them\n- Use proper JOIN syntax with table aliases for readability`;

    if (mode === "sql" && !body.execute) {
      system += `\n\nReturn ONLY a valid SQL query (plain text after 'SQL:'), followed optionally by a short explanation.`;
    } else {
      system += `\n\nCRITICAL: When the user asks for data, lists, rankings, or any query that requires database results, you MUST:
1. Analyze the question and identify what data is needed
2. Check the schema to ensure all referenced tables and columns exist
3. Provide a concise natural language answer summarizing what the query will find
4. ALWAYS include a complete, executable SQL query prefixed with 'SQL: ' on its own line
5. The SQL will be automatically executed and results displayed in a visualizer
6. Examples of queries that need SQL: "list top 10 products", "show me sales by category", "what is the average order value", "which city has most orders", etc.
7. Even if the user doesn't explicitly ask for SQL, if they're asking for data, generate SQL to fetch it
8. Always verify your SQL syntax is correct for AlaSQL/SQLite before including it

Output format:
[Your natural language answer explaining what the query does and what result to expect]

SQL: [Complete, executable SQL query]

[Optional: Visualization suggestion if applicable]`;
    }

    const messages = body.messages ?? [];

    const content =
      provider === "openrouter"
        ? await callOpenRouter(messages, system)
        : await callGemini(messages, system);

    let response: AgentResponse = { ok: true, mode, provider };

    // Extract SQL from response - try multiple patterns
    function extractSql(text: string): string | null {
      if (!text) return null;
      
      // Pattern 1: "SQL: SELECT ..." on its own line (multiline)
      const sqlPrefixMatch = text.match(/SQL:\s*([\s\S]*?)(?:\n\n|$)/i);
      if (sqlPrefixMatch) {
        const sql = sqlPrefixMatch[1].trim();
        if (sql) return sql;
      }
      
      // Pattern 2: SQL in code blocks
      const codeMatch =
        text.match(/```sql\n([\s\S]*?)```/i) ||
        text.match(/```\n([\s\S]*?)```/i);
      if (codeMatch) {
        const sql = codeMatch[1].trim();
        if (sql && /SELECT/i.test(sql)) return sql;
      }
      
      // Pattern 3: SELECT statement (find the first complete SELECT)
      // Look for SELECT ... until we hit a reasonable boundary
      const selectMatch = text.match(/(SELECT[\s\S]*?)(?:\n\n|```|SQL:|$)/i);
      if (selectMatch) {
        const sql = selectMatch[1].trim();
        if (sql && sql.length > 10) return sql;
      }
      
      // Pattern 4: Any SELECT statement in the text
      const anySelect = text.match(/(SELECT[\s\S]*)/i);
      if (anySelect) {
        const sql = anySelect[1].trim();
        // Take up to 5000 chars or until double newline/end
        const cleaned = sql.split(/\n\n/)[0].substring(0, 5000).trim();
        if (cleaned && cleaned.length > 10) return cleaned;
      }
      
      return null;
    }

    const extractedSql = extractSql(content);
    
    // Clean SQL: remove markdown code fences, ensure proper formatting
    let cleanSql = extractedSql;
    if (cleanSql) {
      cleanSql = cleanSql.replace(/```/g, "").trim();
      // Remove trailing semicolon if present (we'll add it if needed)
      cleanSql = cleanSql.replace(/;+\s*$/, "").trim();
    }

    if (mode === "sql") {
      response.sql = cleanSql || content.trim();
      if (body.execute && cleanSql) {
        const exec = await maybeExecuteSQL(cleanSql, limit);
        if (exec.executed) {
          response.fields = exec.fields;
          response.rows = (exec.rows as unknown[]);
        } else {
          response.notice = `Execution failed: ${exec.error}`;
        }
      }
      if (!response.rows && !response.notice) {
        response.notice =
          "SQL generated. Execution disabled or no database configured.";
      }
    } else {
      // In insights mode, always try to extract and execute SQL
      response.text = content;
      if (cleanSql) {
        response.sql = cleanSql;
        // Auto-execute SQL in insights mode to show results - this is critical for visualization
        const exec = await maybeExecuteSQL(cleanSql, limit);
        if (exec.executed) {
          response.fields = exec.fields;
          response.rows = (exec.rows as unknown[]);
          // If we have results, don't show any notice about execution
        } else {
          // Only show notice if execution failed - frontend will try to execute again
          response.notice = `SQL generated but execution failed: ${exec.error}`;
        }
      } else {
        // If no SQL was extracted, try to extract it more aggressively from the text
        // Sometimes the AI doesn't format SQL properly
        const fallbackSql = extractSql(content);
        if (fallbackSql && fallbackSql !== cleanSql) {
          const cleanedFallback = fallbackSql.replace(/```/g, "").trim().replace(/;+\s*$/, "").trim();
          if (cleanedFallback && cleanedFallback.length > 10) {
            response.sql = cleanedFallback;
            const exec = await maybeExecuteSQL(cleanedFallback, limit);
            if (exec.executed) {
              response.fields = exec.fields;
              response.rows = (exec.rows as unknown[]);
            }
          }
        }
      }
    }

    res.status(200).json(response);
  } catch (error) {
    const message = (error as Error).message || "Unknown error";
    
    // Provide more user-friendly error messages
    let userMessage = message;
    if (message.includes("Rate limit") || message.includes("429")) {
      userMessage = "⚠️ API rate limit exceeded. Please wait a few seconds and try again. If this persists, you may need to check your API quota or wait longer between requests.";
    } else if (message.includes("Invalid API key") || message.includes("401")) {
      userMessage = "⚠️ API authentication failed. Please check your API key configuration.";
    } else if (message.includes("fetch failed") || message.includes("network")) {
      userMessage = "⚠️ Network error. Please check your internet connection and try again.";
    } else if (message.includes("timeout")) {
      userMessage = "⚠️ Request timed out. The API is taking too long to respond. Please try again.";
    }
    
    const resp: AgentResponse = {
      ok: false,
      mode: mode,
      provider: provider,
      notice: userMessage,
    };
    res.status(200).json(resp); // Return 200 so frontend can display the error message
  }
};
