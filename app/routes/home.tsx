import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { generateText } from "ai";
import type { Route } from "./+types/home";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI Chat" },
    { name: "description", content: "Simple AI Chat" },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const messagesJson = formData.get("messages") as string;
  const messages = JSON.parse(messagesJson);

  const provider = createOpenAICompatible({
    name: 'shopify-proxy',
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_API_BASE!,
  });
  
  const model = provider("anthropic:claude-opus-4-5");
  
  const result = await generateText({
    model,
    messages,
  });

  return Response.json({ text: result.text });
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher<{ text: string }>();
  
  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (fetcher.data && pendingMessage !== null) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: fetcher.data?.text || "Sorry, something went wrong.",
        };
        return updated;
      });
      setPendingMessage(null);
    }
  }, [fetcher.data, pendingMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setPendingMessage(input.trim());
    setInput("");

    fetcher.submit(
      { messages: JSON.stringify(newMessages) },
      { method: "POST" }
    );
    
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
            AI Chat
          </h1>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400/20 to-blue-600/20 flex items-center justify-center mb-6 ring-1 ring-sky-500/20">
                <svg
                  className="w-8 h-8 text-sky-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-zinc-200 mb-2">
                Start a conversation
              </h2>
              <p className="text-zinc-500 max-w-sm">
                Type a message below to begin chatting with the AI.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] ${
                      message.role === "user"
                        ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3"
                        : "bg-zinc-900 text-zinc-100 rounded-2xl rounded-bl-md px-4 py-3 ring-1 ring-zinc-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                      {isLoading &&
                        index === messages.length - 1 &&
                        message.role === "assistant" &&
                        !message.content && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-sky-400 animate-pulse rounded-full align-middle" />
                        )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input */}
      <footer className="flex-shrink-0 border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={isLoading}
              className="w-full bg-zinc-900 text-zinc-100 placeholder-zinc-500 rounded-xl px-4 py-3 pr-12 ring-1 ring-zinc-800 focus:ring-2 focus:ring-sky-500/50 focus:outline-none transition-all disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:from-sky-400 hover:to-blue-500 transition-all"
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
