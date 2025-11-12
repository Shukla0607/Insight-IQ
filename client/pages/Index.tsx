import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgentRequest, AgentResponse, StatusResponse } from "@shared/api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MessageSquare, Database, BarChart3, Trash2, Play, Copy, X, Send, Sparkles, FileText, Eye } from "lucide-react";

const samples = [
  "Which product category was the highest selling in the past 2 quarters?",
  "What is the average order value for Electronics?",
  "Top 10 cities by revenue and their trends",
  "Monthly cohort retention and repeat purchase rate",
];

export default function Index() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [mode, setMode] = useState<"insights" | "sql">("insights");
  const [execute, setExecute] = useState(false);

  const [chats, setChats] = useState<
    { id: string; title: string; messages: any[]; lastRows?: any[] }[]
  >(() => {
    try {
      const raw = localStorage.getItem("chats:v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastRows, setLastRows] = useState<any[] | null>(null);
  const [csvFiles, setCsvFiles] = useState<{ name: string; file: string }[]>(
    [],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const [sqlEditor, setSqlEditor] = useState<string>("");
  const [chartX, setChartX] = useState<string | null>(null);
  const [chartY, setChartY] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    fetch("/api/data/files")
      .then((r) => r.json())
      .then((d) => setCsvFiles(d.files || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("chats:v1", JSON.stringify(chats));
    } catch {}
  }, [chats]);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) setActiveChatId(chats[0].id);
  }, [chats, activeChatId]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeChat?.messages]);

  const providerLabel = useMemo(() => {
    if (!status) return "Checking...";
    if (status.provider === "none") return "Local AI only";
    if (status.provider === "openrouter") return "OpenRouter";
    return "Gemini";
  }, [status]);

  function newChat() {
    const id = String(Date.now());
    const c = { id, title: "New chat", messages: [] as any[] };
    setChats((s) => [c, ...s]);
    setActiveChatId(id);
    setLastRows(null);
  }

  function loadChat(id: string) {
    setActiveChatId(id);
    setLastRows(chats.find((c) => c.id === id)?.lastRows ?? null);
  }

  async function send(text: string) {
    if (!text.trim()) return;
    const id = activeChatId ?? String(Date.now());
    if (!activeChatId) {
      const c = {
        id,
        title: text.slice(0, 40),
        messages: [{ role: "user", content: text }],
      };
      setChats((s) => [c, ...s]);
      setActiveChatId(id);
    } else {
      setChats((s) =>
        s.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: [...c.messages, { role: "user", content: text }],
              }
            : c,
        ),
      );
    }

    setInput("");
    setLoading(true);
    try {
      const payload: AgentRequest = {
        messages: activeChat
          ? [...activeChat.messages, { role: "user", content: text }]
          : [{ role: "user", content: text }],
        mode,
        execute,
      };
      const resp = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await resp.json()) as AgentResponse;
      
      // Build the assistant message content
      let content = "";
      if (data.text) {
        content = data.text;
      } else if (data.sql) {
        content = data.sql;
      } else if (data.notice) {
        content = data.notice;
      }

      // Use SQL from response if available, otherwise try to extract from text
      const extractedSql = data.sql || null;
      if (extractedSql) {
        setSqlEditor(extractedSql.replace(/```/g, "").trim());
      }

      // Build a comprehensive response message
      let assistantMessage = content;
      
      // If we have SQL, format it nicely in the message
      if (extractedSql && data.text) {
        assistantMessage = `${data.text}\n\n**SQL Query:**\n\`\`\`sql\n${extractedSql}\n\`\`\``;
      } else if (extractedSql) {
        assistantMessage = `**SQL Query:**\n\`\`\`sql\n${extractedSql}\n\`\`\``;
      }

      // Add answer summary if we have results
      if (data.rows && data.rows.length > 0) {
        const rowCount = data.rows.length;
        const firstRow = data.rows[0];
        const keys = Object.keys(firstRow);
        
        // Create a summary of the answer
        let answerSummary = `\n\n**Answer:**\n`;
        if (rowCount === 1) {
          // Single row result - format nicely
          if (keys.length === 1) {
            // Single column result - show just the value
            const value = firstRow[keys[0]];
            answerSummary += `${keys[0]}: ${value !== null && value !== undefined ? value : 'N/A'}`;
          } else {
            // Multiple columns - format as key-value pairs
            const formatted = keys.map(k => {
              const val = firstRow[k];
              return `  ${k}: ${val !== null && val !== undefined ? val : 'N/A'}`;
            }).join('\n');
            answerSummary += formatted;
          }
        } else {
          // Multiple rows - show summary
          answerSummary += `Found ${rowCount} result(s). Showing top results below.`;
        }
        assistantMessage += answerSummary;
      }

      setChats((s) =>
        s.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: [...c.messages, { role: "assistant", content: assistantMessage }],
              }
            : c,
        ),
      );

      // Add notice if present
      if (data.notice && !data.notice.includes("execution failed")) {
        setChats((s) =>
          s.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    { role: "assistant", content: `ℹ️ ${data.notice}` },
                  ],
                }
              : c,
          ),
        );
      }

      // Set results if available - prioritize showing results in visualizer
      if (data.rows && data.rows.length > 0) {
        setLastRows(data.rows);
        setChats((s) =>
          s.map((c) => (c.id === id ? { ...c, lastRows: data.rows } : c)),
        );
      } else if (extractedSql && (!data.rows || data.rows.length === 0)) {
        // If SQL was generated but not executed or returned no results, try to execute it
        // This ensures users always see results when they ask for data
        try {
          const r2 = await fetch("/api/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sql: extractedSql, limit: 200 }),
          });
          const j2 = await r2.json();
          if (j2.ok && j2.rows && j2.rows.length > 0) {
            setLastRows(j2.rows);
            setChats((s) =>
              s.map((c) => (c.id === id ? { ...c, lastRows: j2.rows } : c)),
            );
            // Update the response message to indicate results were loaded
            if (j2.rows.length > 0) {
              setChats((s) =>
                s.map((c) =>
                  c.id === id
                    ? {
                        ...c,
                        messages: c.messages.map((m: any, idx: number) =>
                          idx === c.messages.length - 1 && m.role === "assistant"
                            ? {
                                ...m,
                                content: m.content + `\n\n✅ Results loaded: ${j2.rows.length} row(s) displayed in visualizer.`,
                              }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            }
          } else if (j2.error) {
            // Show execution error in chat
            setChats((s) =>
              s.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      messages: [
                        ...c.messages,
                        {
                          role: "assistant",
                          content: `⚠️ Could not execute SQL: ${j2.error}`,
                        },
                      ],
                    }
                  : c,
              ),
            );
          }
        } catch (e) {
          // Show error if execution fails
          setChats((s) =>
            s.map((c) =>
              c.id === id
                ? {
                    ...c,
                    messages: [
                      ...c.messages,
                      {
                        role: "assistant",
                        content: `⚠️ Failed to execute SQL: ${(e as Error).message}`,
                      },
                    ],
                  }
                : c,
            ),
          );
        }
      }
    } catch (e) {
      setChats((s) =>
        s.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    role: "assistant",
                    content: `Error: ${(e as Error).message}`,
                  },
                ],
              }
            : c,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function numericColumns(rows: any[]) {
    if (!rows || !rows.length) return [] as string[];
    const keys = Object.keys(rows[0]);
    return keys.filter((k) =>
      rows
        .slice(0, 10)
        .every(
          (r) => r[k] === null || r[k] === undefined || !isNaN(Number(r[k])),
        ),
    );
  }

  const chartData = useMemo(() => {
    if (!lastRows || lastRows.length === 0) return null;
    const keys = Object.keys(lastRows[0]);
    const numCols = numericColumns(lastRows);
    
    // Use selected columns if available, otherwise auto-detect
    const catCol = chartX || keys.find((k) => !numCols.includes(k)) || keys[0];
    const valCol = chartY || numCols[0] || keys[1] || keys[0];
    
    // If both columns are numeric, use first as category and second as value
    // Otherwise, use first non-numeric as category and first numeric as value
    const finalCatCol = numCols.includes(catCol) && numCols.length > 1 
      ? keys.find((k) => !numCols.includes(k)) || keys[0]
      : catCol;
    const finalValCol = numCols.includes(valCol) ? valCol : numCols[0] || keys[1] || keys[0];
    
    // Build chart data
    const data = lastRows.map((r) => {
      const cat = String(r[finalCatCol] ?? "(null)");
      const val = Number(r[finalValCol]) || 0;
      return { name: cat, value: val };
    });
    
    // If we have many items, group by category and sum values
    if (data.length > 20) {
      const grouped: Record<string, number> = {};
      for (const item of data) {
        grouped[item.name] = (grouped[item.name] || 0) + item.value;
      }
      return Object.entries(grouped)
        .slice(0, 20)
        .map(([k, v]) => ({ name: k, value: v }))
        .sort((a, b) => b.value - a.value); // Sort by value descending
    }
    
    return data.slice(0, 20).sort((a, b) => b.value - a.value);
  }, [lastRows, chartX, chartY]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-transparent">
                Olist AI Insights
              </div>
              <div className="text-xs text-muted-foreground">
                Intelligent E‑commerce Analytics
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Badge
              variant={
                status?.provider === "none" ? "destructive" : "secondary"
              }
              className="gap-1"
            >
              <Database className="h-3 w-3" />
              {providerLabel}
            </Badge>
            <Badge 
              variant={status?.hasDatabase ? "secondary" : "destructive"}
              className="gap-1"
            >
              <Database className="h-3 w-3" />
              {status?.hasDatabase ? "Connected" : "Not configured"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-1"
            >
              <a
                href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce/"
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="h-3 w-3" />
                Dataset
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10">
        <section className="grid gap-8 md:grid-cols-3 items-start">
          <aside className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Chats
              </h3>
              <Button variant="outline" size="sm" onClick={newChat} className="gap-1">
                <MessageSquare className="h-3 w-3" />
                New
              </Button>
            </div>
            <div className="space-y-2 max-h-[480px] overflow-y-auto border rounded-lg p-2 bg-card shadow-sm">
              {chats.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No chats yet. Start a new conversation!
                </div>
              )}
              {chats.map((c) => (
                <div
                  key={c.id}
                  className={
                    "flex items-center justify-between p-3 rounded-lg transition-all " +
                    (c.id === activeChatId 
                      ? "bg-primary/10 border border-primary/20 shadow-sm" 
                      : "hover:bg-muted/50 border border-transparent")
                  }
                >
                  <button
                    onClick={() => loadChat(c.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="font-medium truncate">{c.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {c.messages?.length ?? 0} messages
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Are you sure you want to delete this chat?")) {
                        setChats((s) => s.filter((chat) => chat.id !== c.id));
                        if (activeChatId === c.id) {
                          const remaining = chats.filter((chat) => chat.id !== c.id);
                          setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
                          setLastRows(null);
                        }
                      }
                    }}
                    className="ml-2 h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Data Files
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {csvFiles.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Drop CSVs into /data and restart
                  </div>
                )}
                {csvFiles.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between p-2 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-sm font-mono truncate flex-1">{f.name}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const r = await fetch(
                          `/api/data/preview?table=${encodeURIComponent(f.name)}&limit=5`,
                        );
                        const j = await r.json();
                        if (j.ok) {
                          alert(JSON.stringify(j.rows, null, 2));
                        } else {
                          alert(j.error || "Preview failed");
                        }
                      }}
                      className="gap-1"
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>

          <div className="md:col-span-1 md:col-start-2">
            <div className="mb-6">
              <h1 className="text-3xl font-extrabold bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-transparent mb-2">
                Chat with your e‑commerce data
              </h1>
              <p className="text-sm text-muted-foreground">
                Ask natural language questions about Olist's dataset. Get instant SQL queries, 
                answers, and visualizations automatically.
              </p>
            </div>

            <Card className="overflow-hidden shadow-lg">
              <CardHeader className="border-b bg-muted/30">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Conversation
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col h-[520px] p-0">
                <div
                  ref={listRef}
                  className="flex-1 overflow-y-auto space-y-4 p-4"
                >
                  {!activeChat?.messages?.length && (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      Start a chat or pick a sample prompt below.
                    </div>
                  )}
                  {activeChat?.messages?.map((m: any, i: number) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${
                        m.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] ${
                          m.role === "user"
                            ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                            : "bg-muted rounded-2xl rounded-tl-sm"
                        } p-4 shadow-sm`}
                      >
                        <div className="text-xs font-semibold mb-2 opacity-70">
                          {m.role === "user" ? "You" : "Assistant"}
                        </div>
                        {m.content.includes("```") ? (
                          <div className="whitespace-pre-wrap break-words text-sm">
                            {m.content.split(/(```[\s\S]*?```)/).map((part: string, idx: number) => {
                              if (part.startsWith("```")) {
                                const codeMatch = part.match(/```(\w+)?\n?([\s\S]*?)```/);
                                if (codeMatch) {
                                  const lang = codeMatch[1] || "";
                                  const code = codeMatch[2];
                                  return (
                                    <pre key={idx} className="bg-slate-900 text-slate-100 p-3 rounded-lg mt-2 mb-2 overflow-x-auto text-xs">
                                      <code className={`language-${lang}`}>{code}</code>
                                    </pre>
                                  );
                                }
                              }
                              return <span key={idx} className="whitespace-pre-wrap">{part}</span>;
                            })}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t bg-muted/30 p-4 space-y-3">
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send(input);
                    }}
                  >
                    <Input
                      placeholder="Ask anything about orders, products, customers…"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={loading}
                      className="flex-1"
                    />
                    <Button 
                      disabled={loading || !input.trim()} 
                      type="submit"
                      className="gap-2"
                    >
                      {loading ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          Thinking…
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          {mode === "sql" ? "Generate" : "Ask"}
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-2 select-none cursor-pointer hover:text-primary transition-colors">
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === "insights"}
                        onChange={() => setMode("insights")}
                        className="cursor-pointer"
                      />
                      <Sparkles className="h-3 w-3" />
                      Insights
                    </label>
                    <label className="flex items-center gap-2 select-none cursor-pointer hover:text-primary transition-colors">
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === "sql"}
                        onChange={() => setMode("sql")}
                        className="cursor-pointer"
                      />
                      <Database className="h-3 w-3" />
                      SQL
                    </label>
                    <label className="flex items-center gap-2 select-none cursor-pointer hover:text-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={execute}
                        onChange={(e) => setExecute(e.target.checked)}
                        className="cursor-pointer"
                      />
                      <Play className="h-3 w-3" />
                      Execute SQL
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Generated SQL (editable)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <textarea
                    value={sqlEditor}
                    onChange={(e) => setSqlEditor(e.target.value)}
                    className="w-full h-36 p-2 text-sm font-mono bg-transparent text-slate-100 resize-none focus:outline-none"
                    placeholder="SQL will appear here..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={async () => {
                      if (!sqlEditor.trim()) return alert("No SQL to execute");
                      const r = await fetch("/api/execute", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sql: sqlEditor, limit: 200 }),
                      });
                      const j = await r.json();
                      if (j.ok) {
                        setLastRows(j.rows);
                        alert("Executed: " + (j.rows?.length || 0) + " rows");
                      } else {
                        alert("Execute failed: " + (j.error || "unknown"));
                      }
                    }}
                    className="gap-2"
                  >
                    <Play className="h-3 w-3" />
                    Execute SQL
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(sqlEditor);
                    }}
                    className="gap-2"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSqlEditor("");
                    }}
                    className="gap-2"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3 text-muted-foreground">Sample Questions</h4>
              <div className="flex flex-wrap gap-2">
                {samples.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm px-4 py-2 rounded-lg bg-muted hover:bg-accent hover:shadow-sm transition-all border border-transparent hover:border-primary/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Visualize
              </h3>
            </div>
            <Card className="shadow-lg">
              <CardContent className="p-4 min-h-[320px]">
              {lastRows ? (
                <div>
                  <div className="text-sm font-medium mb-3 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Query Results ({lastRows.length} rows)
                  </div>
                  <div className="max-h-[220px] overflow-auto border rounded-lg">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                          {Object.keys(lastRows[0] || {}).map((k) => (
                            <TableHead key={k} className="font-semibold">{k}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lastRows.slice(0, 20).map((r, i) => (
                          <TableRow key={i} className="hover:bg-muted/50">
                            {Object.values(r).map((v, j) => (
                              <TableCell key={j} className="font-mono text-xs">{String(v)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {chartData ? (
                    <div>
                      <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <label className="text-sm font-medium flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" />
                            Chart Options:
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium">X-Axis:</label>
                            <select
                              className="text-xs px-2 py-1 border rounded-md bg-background"
                              value={chartX || ""}
                              onChange={(e) => setChartX(e.target.value || null)}
                            >
                              <option value="">Auto</option>
                              {Object.keys(lastRows[0] || {}).map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium">Y-Axis:</label>
                            <select
                              className="text-xs px-2 py-1 border rounded-md bg-background"
                              value={chartY || ""}
                              onChange={(e) => setChartY(e.target.value || null)}
                            >
                              <option value="">Auto</option>
                              {Object.keys(lastRows[0] || {}).map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium">Type:</label>
                            <select
                              className="text-xs px-2 py-1 border rounded-md bg-background"
                              value={chartType}
                              onChange={(e) => setChartType(e.target.value as any)}
                            >
                              <option value="bar">Bar</option>
                              <option value="line">Line</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 h-64 border rounded-lg p-2 bg-background">
                        <ResponsiveContainer width="100%" height="100%">
                          {chartType === "bar" ? (
                            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                              <XAxis 
                                dataKey="name" 
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                interval={0}
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip 
                                contentStyle={{ fontSize: '12px' }}
                                formatter={(value: any) => [Number(value).toLocaleString(), 'Value']}
                              />
                              <Bar dataKey="value" fill="rgba(99,102,241,0.9)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          ) : (
                            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                              <XAxis 
                                dataKey="name" 
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                interval={0}
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip 
                                contentStyle={{ fontSize: '12px' }}
                                formatter={(value: any) => [Number(value).toLocaleString(), 'Value']}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="value" 
                                stroke="rgba(99,102,241,0.9)" 
                                strokeWidth={2}
                                dot={{ fill: "rgba(99,102,241,0.9)", r: 4 }}
                              />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground mt-3 text-center py-4">
                      No numeric column found to visualize. Execute a query with numeric data to see charts.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-12 flex flex-col items-center gap-2">
                  <BarChart3 className="h-12 w-12 opacity-50" />
                  Execute a query or ask for a table to see data here.
                </div>
              )}
              </CardContent>
            </Card>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground font-medium">
                    Provider
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{providerLabel}</div>
                  {status?.tips?.length ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      {status.tips.join(" • ")}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </aside>
        </section>

        {status?.tips?.length ? (
          <section className="mt-10">
            <Card>
              <CardHeader>
                <CardTitle>Setup tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                  {status.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </main>

      <footer className="mt-16 border-t">
        <div className="container mx-auto h-16 flex items-center justify-between text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Olist AI Insights</span>
          <div className="flex items-center gap-4">
            <a
              className="hover:underline"
              href="https://openrouter.ai/"
              target="_blank"
              rel="noreferrer"
            >
              OpenRouter
            </a>
            <a
              className="hover:underline"
              href="https://ai.google.dev/"
              target="_blank"
              rel="noreferrer"
            >
              Gemini
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
