import { useEffect, useRef, useState } from "react";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI Chat" },
    { name: "description", content: "A minimal chat interface" },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const messagesJson = formData.get("messages") as string;
  const messages = JSON.parse(messagesJson);

  const result = streamText({
    model: openai("gpt-4o"),
    messages,
  });

  return result.toTextStreamResponse();
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    try {
      const formData = new FormData();
      formData.append("messages", JSON.stringify(newMessages));

      const response = await fetch("/?index", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("0:")) {
            const text = JSON.parse(line.slice(2));
            assistantContent += text;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
              };
              return updated;
            });
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-zinc-950"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
              Chat
            </h1>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
                <svg
                  className="w-8 h-8 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-zinc-200 mb-2">
                Start a conversation
              </h2>
              <p className="text-zinc-500 max-w-sm">
                Ask me anything. I'm powered by GPT-4o.
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
                        ? "bg-gradient-to-br from-emerald-500 to-cyan-600 text-white rounded-2xl rounded-br-md px-4 py-3"
                        : "bg-zinc-900 text-zinc-100 rounded-2xl rounded-bl-md px-4 py-3 ring-1 ring-zinc-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                      {isStreaming &&
                        index === messages.length - 1 &&
                        message.role === "assistant" && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-emerald-400 animate-pulse rounded-full align-middle" />
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
              placeholder="Type your message..."
              disabled={isStreaming}
              className="w-full bg-zinc-900 text-zinc-100 placeholder-zinc-500 rounded-xl px-4 py-3 pr-12 ring-1 ring-zinc-800 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none transition-all disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:from-emerald-400 hover:to-cyan-500 transition-all"
            >
              {isStreaming ? (
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              )}
            </button>
          </form>
          <p className="text-xs text-zinc-600 text-center mt-3">
            Press Enter to send • Powered by Vercel AI SDK
          </p>
        </div>
      </footer>
    </div>
  );
}
