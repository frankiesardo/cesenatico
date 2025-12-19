import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { generateText, tool, stepCountIs } from "ai";
import type { Route } from "./+types/home";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from "zod/v4";
import ReactMarkdown from "react-markdown";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Visit Cesenatico - Assistente Turistico" },
    { name: "description", content: "Scopri eventi, attrazioni e suggerimenti per la tua visita a Cesenatico" },
  ];
}

type StrapiEvent = {
  id: number;
  documentId: string;
  titolo: string;
  descrizione?: string;
  dataInizio?: string;
  dataFine?: string;
  localita?: string;
  gratuito?: boolean;
  prezzo?: string | null;
  linkUrl?: string;
  [key: string]: unknown;
};

async function fetchEvents(startDate: string, endDate: string): Promise<StrapiEvent[]> {
  // Filter: events that overlap with the requested date range
  // An event overlaps if: event.dataInizio <= endDate AND event.dataFine >= startDate
  const url = `${process.env.STRAPI_URL}/api/eventi?filters[dataInizio][$lte]=${endDate}&filters[dataFine][$gte]=${startDate}&pagination[limit]=100`;
  
  console.log("=== Strapi API Request ===");
  console.log("URL:", url);
  console.log("Date range:", startDate, "to", endDate);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Strapi API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    console.log("Events found:", data.data?.length || 0);
    return data.data || [];
  } catch (error) {
    console.error("Failed to fetch events:", error);
    return [];
  }
}

function formatEventsForAI(events: StrapiEvent[]): string {
  if (events.length === 0) {
    return "Nessun evento trovato per il periodo richiesto.";
  }

  let result = `Trovati ${events.length} eventi:\n\n`;
  
  events.forEach((event, index) => {
    result += `${index + 1}. "${event.titolo}"\n`;
    if (event.descrizione) {
      const plainDesc = event.descrizione.replace(/<[^>]*>/g, '').trim().substring(0, 300);
      result += `   Descrizione: ${plainDesc}${plainDesc.length >= 300 ? '...' : ''}\n`;
    }
    if (event.localita) result += `   Località: ${event.localita}\n`;
    result += `   Date: dal ${event.dataInizio} al ${event.dataFine}\n`;
    if (event.gratuito) result += `   Gratuito: Sì\n`;
    else if (event.prezzo) result += `   Prezzo: ${event.prezzo}\n`;
    result += '\n';
  });

  return result;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const messagesJson = formData.get("messages") as string;
  const messages = JSON.parse(messagesJson);

  const today = new Date().toISOString().split('T')[0];

  const systemPrompt = `Sei un assistente turistico esperto per Cesenatico, una bellissima località balneare sulla costa romagnola in Italia.
Il tuo compito è aiutare i visitatori a scoprire eventi, attività e luoghi interessanti.

Data di oggi: ${today}

HAI A DISPOSIZIONE UNO STRUMENTO per cercare eventi nel database di Cesenatico.
Usa lo strumento "searchEvents" quando l'utente chiede informazioni su:
- Eventi di oggi, domani, questa settimana, prossima settimana, questo mese, etc.
- Attività per bambini, famiglie, coppie, etc.
- Eventi specifici (concerti, mercatini, sagre, mostre, etc.)
- Programmi o itinerari per un periodo specifico

Quando usi lo strumento:
1. Calcola le date corrette basandoti sulla data di oggi (${today})
2. Per "oggi" usa startDate e endDate uguali alla data odierna
3. Per "domani" aggiungi 1 giorno
4. Per "questa settimana" vai da oggi a domenica
5. Per "prossima settimana" vai da lunedì prossimo a domenica prossima
6. Per "questo weekend" usa sabato e domenica di questa settimana

Dopo aver ottenuto i risultati:
- Analizza gli eventi e seleziona quelli più rilevanti per la richiesta dell'utente
- Se chiedono attività per bambini, cerca parole chiave come "bambini", "famiglia", "kids", "animazione", etc.
- Crea un programma o suggerimenti personalizzati basati sui risultati
- Sii entusiasta e cordiale nelle risposte
- Rispondi SEMPRE in italiano`;

  const provider = createOpenAICompatible({
    name: 'shopify-proxy',
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_API_BASE!,
  });
  
  const model = provider("anthropic:claude-sonnet-4-20250514");
  
  const result = await generateText({
    model,
    system: systemPrompt,
    messages,
    tools: {
      searchEvents: tool({
        description: "Cerca eventi a Cesenatico in un intervallo di date specifico. Usa questo strumento per trovare eventi, attività, spettacoli, mostre e manifestazioni.",
        inputSchema: z.object({
          startDate: z.string().describe("Data di inizio ricerca in formato YYYY-MM-DD"),
          endDate: z.string().describe("Data di fine ricerca in formato YYYY-MM-DD"),
        }),
        execute: async ({ startDate, endDate }) => {
          console.log(`Tool called: searchEvents(${startDate}, ${endDate})`);
          const events = await fetchEvents(startDate, endDate);
          return formatEventsForAI(events);
        },
      }),
    },
    stopWhen: stepCountIs(5),
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
    <div className="flex flex-col h-screen bg-gradient-to-b from-sky-950 via-zinc-950 to-zinc-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-sky-800/30 bg-sky-950/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <span className="text-xl">⛵</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
              Visit Cesenatico
            </h1>
            <p className="text-xs text-sky-400/80">Il tuo assistente turistico</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 flex items-center justify-center mb-6 ring-1 ring-amber-500/20">
                <span className="text-4xl">🏖️</span>
              </div>
              <h2 className="text-2xl font-medium text-zinc-200 mb-2">
                Benvenuto a Cesenatico!
              </h2>
              <p className="text-zinc-400 max-w-md mb-6">
                Chiedimi degli eventi di oggi, cosa vedere, dove mangiare o qualsiasi consiglio per la tua visita.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button 
                  onClick={() => setInput("Cosa c'è da fare oggi?")}
                  className="px-4 py-2 rounded-full bg-sky-900/50 text-sky-300 text-sm hover:bg-sky-800/50 transition-colors ring-1 ring-sky-700/50"
                >
                  🎉 Eventi di oggi
                </button>
                <button 
                  onClick={() => setInput("Dammi un programma per questo weekend")}
                  className="px-4 py-2 rounded-full bg-sky-900/50 text-sky-300 text-sm hover:bg-sky-800/50 transition-colors ring-1 ring-sky-700/50"
                >
                  📅 Questo weekend
                </button>
                <button 
                  onClick={() => setInput("Cosa posso fare con i bambini questa settimana?")}
                  className="px-4 py-2 rounded-full bg-sky-900/50 text-sky-300 text-sm hover:bg-sky-800/50 transition-colors ring-1 ring-sky-700/50"
                >
                  👨‍👩‍👧 Per famiglie
                </button>
              </div>
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
                        ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl rounded-br-md px-4 py-3 shadow-lg shadow-orange-500/10"
                        : "bg-sky-950/60 text-zinc-100 rounded-2xl rounded-bl-md px-4 py-3 ring-1 ring-sky-800/50"
                    }`}
                  >
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:my-2 prose-headings:text-amber-300 prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-strong:text-amber-200 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline">
                        {message.content ? (
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        ) : isLoading && index === messages.length - 1 ? (
                          <span className="inline-block w-1.5 h-4 bg-amber-400 animate-pulse rounded-full align-middle" />
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input */}
      <footer className="flex-shrink-0 border-t border-sky-800/30 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Chiedimi qualcosa su Cesenatico..."
              disabled={isLoading}
              className="w-full bg-zinc-900/80 text-zinc-100 placeholder-zinc-500 rounded-xl px-4 py-3 pr-12 ring-1 ring-sky-800/50 focus:ring-2 focus:ring-amber-500/50 focus:outline-none transition-all disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:from-amber-300 hover:to-orange-400 transition-all shadow-lg shadow-orange-500/20"
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
