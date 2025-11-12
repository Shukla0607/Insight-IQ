import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in index.html");

// Persist the root to avoid duplicate createRoot calls during HMR
const globalAny: any = globalThis as any;
if (!globalAny.__root) {
  globalAny.__root = createRoot(container);
}

globalAny.__root.render(<App />);
