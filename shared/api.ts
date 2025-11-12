/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AgentMode = "insights" | "sql";

export interface AgentRequest {
  messages: ChatMessage[];
  mode?: AgentMode;
  execute?: boolean; // If true, try executing generated SQL against local CSV-derived DB
  limit?: number; // Max rows when executing SQL
}

export interface AgentResponse {
  ok: boolean;
  mode: AgentMode;
  text?: string; // Assistant natural language response
  sql?: string; // Generated SQL (when mode = 'sql' or useful)
  fields?: string[]; // Column names for executed query
  rows?: unknown[]; // Result rows when SQL executed
  notice?: string; // Any informational note
  provider?: "openrouter" | "gemini" | "none";
}

export interface StatusResponse {
  provider: "openrouter" | "gemini" | "none";
  hasDatabase: boolean;
  databaseUrlConfigured: boolean;
  tips?: string[];
}
