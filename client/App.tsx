import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, Link } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b backdrop-blur supports-[backdrop-filter]:bg-background/60 bg-background/80">
        <div className="container mx-auto flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-8 rounded-md bg-gradient-to-br from-violet-500 to-cyan-400" />
            <span className="text-lg font-bold tracking-tight">
              Olist AI Insights
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <a
              className="text-primary underline"
              href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce/"
              target="_blank"
              rel="noreferrer"
            >
              Dataset
            </a>
            <a
              className="hover:underline"
              href="https://github.com/olist/dataset"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
          </nav>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t">
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
