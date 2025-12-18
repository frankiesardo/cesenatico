import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { google } from '@ai-sdk/google';
import { generateText } from "ai";
import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import type { Route } from "./+types/home";

// Strapi configuration
const STRAPI_URL = process.env.STRAPI_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

// Helper function to make Strapi API calls
async function strapiQuery(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${STRAPI_URL}/api/${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  console.log(`🔍 [Strapi] Querying: ${endpoint}`);
  console.log(`🔍 [Strapi] URL: ${url.toString()}`);

  const startTime = Date.now();
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${STRAPI_TOKEN}`,
    },
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    console.error(`❌ [Strapi] Error ${response.status} after ${duration}ms`);
    throw new Error(`Strapi API error: ${response.status}`);
  }

  const data = await response.json();
  console.log(`✅ [Strapi] Success: ${endpoint} (${duration}ms) - ${data.data?.length || 0} results`);
  
  return data;
}

// System prompt in Italian
const SYSTEM_PROMPT = `Sei un assistente turistico virtuale per Visit Cesenatico, una località balneare sulla costa romagnola in Italia.

Il tuo compito è aiutare i turisti a:
- Trovare eventi, attività ed esperienze da fare
- Suggerire itinerari personalizzati
- Trovare ristoranti, hotel, stabilimenti balneari e altre strutture
- Rispondere a domande su cosa fare a Cesenatico e dintorni

INFORMAZIONI IMPORTANTI:
- La data di oggi è: ${new Date().toLocaleDateString("it-IT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- Quando l'utente chiede "la prossima settimana", "lunedì prossimo", etc., calcola le date corrette
- Per query su famiglie/bambini, cerca nella categoria "Mare e Family" o "Famiglie e bambini"
- Usa sempre i tool per cercare informazioni aggiornate prima di rispondere

CATEGORIE DISPONIBILI:
- Eventi: Spiagge e Mare, Porto canale leonardesco, Arte e cultura marinara, Sport, Natura e benessere, Mare e sapori
- Cosa Fare: Servizi, Wellness, Cultura e buon vivere, Food, Sport e Outdoor, Mare e Family
- Esperienze: Visita guidata, Degustazione, Percorso tematico, Itinerario, Laboratorio
- POI: Eventi e tradizioni, Porto canale leonardesco, Arte e cultura marinara, Mare e sapori, Sport, Natura e benessere, Shopping e mercati, Famiglie e bambini, Borgo e luoghi storici, Spiagge e mare
- Strutture: Ricettivo, Balneare, Attività di ristorazione, Commercio e artigianato, Case e Appartamenti, Operatori Wellness, Guide e accompagnatori turistici

LINEE GUIDA:
1. Rispondi sempre in italiano
2. Sii cordiale e entusiasta nel promuovere Cesenatico
3. Quando crei itinerari, considera la durata delle attività e gli spostamenti
4. Se non trovi risultati per una ricerca, prova con criteri più ampi
5. Includi sempre informazioni pratiche come orari, prezzi (se disponibili) e come prenotare`;

// Define the tools using the correct AI SDK v5 format
const tools = {
  cerca_eventi: tool({
    description: `Cerca eventi a Cesenatico. Usa questo tool per trovare concerti, festival, manifestazioni, spettacoli e altri eventi.
    
Campi disponibili negli eventi:
- titolo: nome dell'evento
- descrizione: descrizione dettagliata
- dataInizio/dataFine: date dell'evento (formato YYYY-MM-DD)
- gratuito: se l'evento è gratuito
- prezzo: costo in euro (se non gratuito)
- accessibile: se è accessibile ai disabili
- localita: dove si svolge
- categoria_evento: categoria dell'evento`,
    inputSchema: zodSchema(
      z.object({
        dataInizio: z
          .string()
          .optional()
          .describe("Data inizio ricerca (formato YYYY-MM-DD)"),
        dataFine: z
          .string()
          .optional()
          .describe("Data fine ricerca (formato YYYY-MM-DD)"),
        searchText: z
          .string()
          .optional()
          .describe("Testo da cercare nel titolo o descrizione"),
        gratuito: z
          .boolean()
          .optional()
          .describe("Filtra solo eventi gratuiti"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Numero massimo di risultati"),
      })
    ),
    execute: async ({
      dataInizio,
      dataFine,
      searchText,
      gratuito,
      limit,
    }: {
      dataInizio?: string;
      dataFine?: string;
      searchText?: string;
      gratuito?: boolean;
      limit?: number;
    }) => {
      console.log(`🛠️ [Tool] cerca_eventi called with:`, { dataInizio, dataFine, searchText, gratuito, limit });
      
      const params: Record<string, string> = {
        "populate[categoria_evento]": "true",
        "populate[cover]": "true",
        "pagination[pageSize]": String(limit || 10),
        sort: "dataInizio:asc",
      };

      if (dataInizio) {
        params["filters[dataInizio][$gte]"] = dataInizio;
      }
      if (dataFine) {
        params["filters[dataFine][$lte]"] = dataFine;
      }
      if (searchText) {
        params["filters[$or][0][titolo][$containsi]"] = searchText;
        params["filters[$or][1][descrizione][$containsi]"] = searchText;
      }
      if (gratuito !== undefined) {
        params["filters[gratuito][$eq]"] = String(gratuito);
      }

      const result = await strapiQuery("eventi", params);
      const response = {
        totale: result.meta?.pagination?.total || 0,
        eventi: result.data?.map((e: any) => ({
          id: e.id,
          titolo: e.titolo,
          descrizione: e.descrizione?.substring(0, 300) + "...",
          dataInizio: e.dataInizio,
          dataFine: e.dataFine,
          gratuito: e.gratuito,
          prezzo: e.prezzo,
          localita: e.localita,
          accessibile: e.accessibile,
          categorie: e.categoria_evento?.map((c: any) => c.titolo) || [],
        })),
      };
      console.log(`✅ [Tool] cerca_eventi returned ${response.totale} results`);
      return response;
    },
  }),

  cerca_experiences: tool({
    description: `Cerca esperienze e attività a Cesenatico. Usa questo tool per trovare visite guidate, degustazioni, laboratori, percorsi tematici e altre attività turistiche.
    
Campi disponibili:
- titolo: nome dell'esperienza
- descrizione: cosa include
- durata: durata in minuti
- prezzo: costo
- gratuito: se è gratuita
- partecipantiMin/Max: numero partecipanti
- orarioInizio/Fine: orari
- disponibileInizio/Fine: periodo di disponibilità
- tipologia_experience: tipo (Visita guidata, Degustazione, Percorso tematico, Itinerario, Laboratorio)
- categoria_cosafare: categoria (Servizi, Wellness, Cultura e buon vivere, Food, Sport e Outdoor, Mare e Family)`,
    inputSchema: zodSchema(
      z.object({
        searchText: z
          .string()
          .optional()
          .describe("Testo da cercare nel titolo o descrizione"),
        categoria: z
          .string()
          .optional()
          .describe(
            "Categoria: Servizi, Wellness, Cultura e buon vivere, Food, Sport e Outdoor, Mare e Family"
          ),
        tipologia: z
          .string()
          .optional()
          .describe(
            "Tipo: Visita guidata, Degustazione, Percorso tematico, Itinerario, Laboratorio"
          ),
        gratuito: z
          .boolean()
          .optional()
          .describe("Filtra solo esperienze gratuite"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Numero massimo di risultati"),
      })
    ),
    execute: async ({
      searchText,
      categoria,
      tipologia,
      gratuito,
      limit,
    }: {
      searchText?: string;
      categoria?: string;
      tipologia?: string;
      gratuito?: boolean;
      limit?: number;
    }) => {
      console.log(`🛠️ [Tool] cerca_experiences called with:`, { searchText, categoria, tipologia, gratuito, limit });
      
      const params: Record<string, string> = {
        "populate[categoria_cosafare]": "true",
        "populate[tipologia_experience]": "true",
        "populate[cover]": "true",
        "filters[attiva][$eq]": "true",
        "pagination[pageSize]": String(limit || 10),
      };

      if (searchText) {
        params["filters[$or][0][titolo][$containsi]"] = searchText;
        params["filters[$or][1][descrizione][$containsi]"] = searchText;
      }
      if (categoria) {
        params["filters[categoria_cosafare][titolo][$containsi]"] = categoria;
      }
      if (tipologia) {
        params["filters[tipologia_experience][titolo][$containsi]"] = tipologia;
      }
      if (gratuito !== undefined) {
        params["filters[gratuito][$eq]"] = String(gratuito);
      }

      const result = await strapiQuery("experiences", params);
      const response = {
        totale: result.meta?.pagination?.total || 0,
        esperienze: result.data?.map((e: any) => ({
          id: e.id,
          titolo: e.titolo,
          descrizione: e.descrizione?.substring(0, 300) + "...",
          durata: e.durata,
          prezzo: e.prezzo,
          gratuito: e.gratuito,
          luogo: e.luogo,
          orarioInizio: e.orarioInizio,
          orarioFine: e.orarioFine,
          partecipantiMin: e.partecipantiMin,
          partecipantiMax: e.partecipantiMax,
          tipologia: e.tipologia_experience?.titolo,
          categoria: e.categoria_cosafare?.titolo,
        })),
      };
      console.log(`✅ [Tool] cerca_experiences returned ${response.totale} results`);
      return response;
    },
  }),

  cerca_punti_interesse: tool({
    description: `Cerca punti di interesse (POI) a Cesenatico. Usa questo tool per trovare luoghi da visitare, monumenti, musei, spiagge, parchi e altre attrazioni.
    
Categorie disponibili: Eventi e tradizioni, Porto canale leonardesco, Arte e cultura marinara, Mare e sapori, Sport, Natura e benessere, Shopping e mercati, Famiglie e bambini, Borgo e luoghi storici, Spiagge e mare`,
    inputSchema: zodSchema(
      z.object({
        searchText: z
          .string()
          .optional()
          .describe("Testo da cercare nel titolo o descrizione"),
        categoria: z
          .string()
          .optional()
          .describe(
            "Categoria del POI (es: Famiglie e bambini, Spiagge e mare, etc.)"
          ),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Numero massimo di risultati"),
      })
    ),
    execute: async ({
      searchText,
      categoria,
      limit,
    }: {
      searchText?: string;
      categoria?: string;
      limit?: number;
    }) => {
      console.log(`🛠️ [Tool] cerca_punti_interesse called with:`, { searchText, categoria, limit });
      
      const params: Record<string, string> = {
        "populate[categoria_esplora]": "true",
        "populate[cover]": "true",
        "pagination[pageSize]": String(limit || 10),
      };

      if (searchText) {
        params["filters[$or][0][titolo][$containsi]"] = searchText;
        params["filters[$or][1][descrizione][$containsi]"] = searchText;
      }
      if (categoria) {
        params["filters[categoria_esplora][titolo][$containsi]"] = categoria;
      }

      const result = await strapiQuery("pois", params);
      const response = {
        totale: result.meta?.pagination?.total || 0,
        puntiInteresse: result.data?.map((p: any) => ({
          id: p.id,
          titolo: p.titolo,
          descrizione: p.descrizione?.substring(0, 300) + "...",
          indirizzo: p.indirizzo,
          orario: p.orario,
          googleMapsLink: p.googleMapsLink,
          categoria: p.categoria_esplora?.titolo,
        })),
      };
      console.log(`✅ [Tool] cerca_punti_interesse returned ${response.totale} results`);
      return response;
    },
  }),

  cerca_strutture: tool({
    description: `Cerca strutture a Cesenatico: hotel, ristoranti, stabilimenti balneari, negozi, etc.
    
Categorie disponibili: Ricettivo (hotel/alberghi), Balneare (stabilimenti balneari), Attività di ristorazione (ristoranti/bar), Commercio e artigianato (negozi), Case e Appartamenti, Operatori Wellness, Guide e accompagnatori turistici`,
    inputSchema: zodSchema(
      z.object({
        searchText: z
          .string()
          .optional()
          .describe("Testo da cercare nel titolo o descrizione"),
        categoria: z
          .string()
          .optional()
          .describe(
            "Categoria: Ricettivo, Balneare, Attività di ristorazione, Commercio e artigianato, Case e Appartamenti, Operatori Wellness, Guide e accompagnatori turistici"
          ),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Numero massimo di risultati"),
      })
    ),
    execute: async ({
      searchText,
      categoria,
      limit,
    }: {
      searchText?: string;
      categoria?: string;
      limit?: number;
    }) => {
      console.log(`🛠️ [Tool] cerca_strutture called with:`, { searchText, categoria, limit });
      
      const params: Record<string, string> = {
        "populate[categoria_struttura]": "true",
        "populate[tipologia_struttura]": "true",
        "populate[cover]": "true",
        "filters[attiva][$eq]": "true",
        "pagination[pageSize]": String(limit || 10),
      };

      if (searchText) {
        params["filters[$or][0][titolo][$containsi]"] = searchText;
        params["filters[$or][1][descrizione][$containsi]"] = searchText;
      }
      if (categoria) {
        params["filters[categoria_struttura][titolo][$containsi]"] = categoria;
      }

      const result = await strapiQuery("strutturas", params);
      const response = {
        totale: result.meta?.pagination?.total || 0,
        strutture: result.data?.map((s: any) => ({
          id: s.id,
          titolo: s.titolo,
          descrizione: s.descrizione?.substring(0, 300) + "...",
          indirizzo: s.indirizzo,
          telefono: s.telefono,
          email: s.email,
          sitoWeb: s.sitoWeb,
          orarioApertura: s.orarioApertura,
          orarioChiusura: s.orarioChiusura,
          categoria: s.categoria_struttura?.titolo,
          tipologia: s.tipologia_struttura?.titolo,
        })),
      };
      console.log(`✅ [Tool] cerca_strutture returned ${response.totale} results`);
      return response;
    },
  }),

  cerca_offerte: tool({
    description: `Cerca offerte speciali e promozioni a Cesenatico. Usa questo tool per trovare sconti, pacchetti e promozioni delle strutture turistiche.`,
    inputSchema: zodSchema(
      z.object({
        searchText: z
          .string()
          .optional()
          .describe("Testo da cercare nel titolo o descrizione"),
        dataInizio: z
          .string()
          .optional()
          .describe("Data inizio validità offerta (formato YYYY-MM-DD)"),
        dataFine: z
          .string()
          .optional()
          .describe("Data fine validità offerta (formato YYYY-MM-DD)"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Numero massimo di risultati"),
      })
    ),
    execute: async ({
      searchText,
      dataInizio,
      dataFine,
      limit,
    }: {
      searchText?: string;
      dataInizio?: string;
      dataFine?: string;
      limit?: number;
    }) => {
      console.log(`🛠️ [Tool] cerca_offerte called with:`, { searchText, dataInizio, dataFine, limit });
      
      const params: Record<string, string> = {
        "populate[categoria_offerta]": "true",
        "populate[struttura]": "true",
        "populate[cover]": "true",
        "filters[attiva][$eq]": "true",
        "pagination[pageSize]": String(limit || 10),
      };

      if (searchText) {
        params["filters[$or][0][titolo][$containsi]"] = searchText;
        params["filters[$or][1][descrizione][$containsi]"] = searchText;
      }
      if (dataInizio) {
        params["filters[disponibileInizio][$lte]"] = dataInizio;
      }
      if (dataFine) {
        params["filters[disponibileFine][$gte]"] = dataFine;
      }

      const result = await strapiQuery("offertas", params);
      const response = {
        totale: result.meta?.pagination?.total || 0,
        offerte: result.data?.map((o: any) => ({
          id: o.id,
          titolo: o.titolo,
          descrizione: o.descrizione?.substring(0, 300) + "...",
          prezzo: o.prezzo,
          disponibileInizio: o.disponibileInizio,
          disponibileFine: o.disponibileFine,
          struttura: o.struttura?.titolo,
        })),
      };
      console.log(`✅ [Tool] cerca_offerte returned ${response.totale} results`);
      return response;
    },
  }),

  ottieni_categorie: tool({
    description: `Ottieni l'elenco delle categorie disponibili per un tipo di contenuto. Utile per sapere quali filtri sono disponibili.`,
    inputSchema: zodSchema(
      z.object({
        tipo: z
          .enum([
            "eventi",
            "cosa-fare",
            "esperienze",
            "esplora",
            "strutture",
            "offerte",
          ])
          .describe("Tipo di contenuto per cui ottenere le categorie"),
      })
    ),
    execute: async ({
      tipo,
    }: {
      tipo:
        | "eventi"
        | "cosa-fare"
        | "esperienze"
        | "esplora"
        | "strutture"
        | "offerte";
    }) => {
      console.log(`🛠️ [Tool] ottieni_categorie called with:`, { tipo });
      
      const endpoints: Record<string, string> = {
        eventi: "categorie-evento",
        "cosa-fare": "categorie-cosa-fare",
        esperienze: "tipologia-experiences",
        esplora: "categorie-esplora",
        strutture: "categorie-struttura",
        offerte: "categoria-offertas",
      };

      const endpoint = endpoints[tipo];
      if (!endpoint) {
        console.error(`❌ [Tool] ottieni_categorie: tipo non valido: ${tipo}`);
        return { error: "Tipo non valido" };
      }

      const result = await strapiQuery(endpoint);
      const response = {
        tipo,
        categorie: result.data?.map((c: any) => ({
          id: c.id,
          titolo: c.titolo,
          slug: c.slug,
        })),
      };
      console.log(`✅ [Tool] ottieni_categorie returned ${response.categorie?.length || 0} categories`);
      return response;
    },
  }),
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Visit Cesenatico - Assistente Turistico" },
    {
      name: "description",
      content: "Assistente virtuale per scoprire Cesenatico",
    },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const formData = await request.formData();
    const messagesJson = formData.get("messages") as string;
    const messages = JSON.parse(messagesJson);

    console.log(`\n${"=".repeat(50)}`);
    console.log(`🤖 [AI] New request received`);
    console.log(`📝 [AI] Last message: "${messages[messages.length - 1]?.content?.substring(0, 100)}..."`);
    console.log(`🔧 [Config] STRAPI_URL: ${STRAPI_URL ? "✅ set" : "❌ missing"}`);
    console.log(`🔧 [Config] STRAPI_TOKEN: ${STRAPI_TOKEN ? "✅ set" : "❌ missing"}`);
    console.log(`${"=".repeat(50)}\n`);

    const startTime = Date.now();
    
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system: SYSTEM_PROMPT,
      messages,
      tools,
    });

    const duration = Date.now() - startTime;
    console.log(`\n✅ [AI] Response generated in ${duration}ms`);
    console.log(`📊 [AI] Steps: ${result.steps.length}, Tool calls: ${result.steps.reduce((acc, s) => acc + (s.toolCalls?.length || 0), 0)}`);
    
    // Collect tool calls from all steps
    const toolCalls = result.steps.flatMap(step => 
      step.toolCalls?.map(tc => ({
        toolName: tc.toolName,
        args: (tc as any).args || {},
      })) || []
    );

    return Response.json({
      text: result.text,
      toolCalls,
    });
  } catch (error) {
    console.error(`\n❌ [AI] Error:`, error);
    return Response.json({
      text: "Mi dispiace, si è verificato un errore. Riprova.",
      toolCalls: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

type ToolCall = {
  toolName: string;
  args: Record<string, any>;
  status: "pending" | "completed";
};

type Message = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
};

// Helper to format tool names for display
function formatToolName(name: string): string {
  const nameMap: Record<string, string> = {
    cerca_eventi: "🎪 Ricerca eventi",
    cerca_experiences: "🎯 Ricerca esperienze",
    cerca_punti_interesse: "📍 Ricerca luoghi",
    cerca_strutture: "🏨 Ricerca strutture",
    cerca_offerte: "🎁 Ricerca offerte",
    ottieni_categorie: "📂 Caricamento categorie",
  };
  return nameMap[name] || name;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher<{ text: string; toolCalls: any[]; error?: string }>();
  
  const isLoading = fetcher.state !== "idle";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data && pendingMessage !== null) {
      console.log("[Client] Response received:", fetcher.data);
      
      const toolCallsWithStatus: ToolCall[] = fetcher.data.toolCalls?.map((tc: any) => ({
        ...tc,
        status: "completed" as const,
      })) || [];

      if (fetcher.data.error) {
        console.error("[Client] Server error:", fetcher.data.error);
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: fetcher.data?.text || "Mi dispiace, si è verificato un errore.",
          toolCalls: toolCallsWithStatus,
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
    
    setMessages([...newMessages, { role: "assistant", content: "", toolCalls: [] }]);
    setPendingMessage(input.trim());
    setInput("");

    console.log("[Client] Sending request...");
    
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
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
                Visit Cesenatico
              </h1>
              <p className="text-xs text-zinc-500">Assistente Turistico AI</p>
            </div>
          </div>
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
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-zinc-200 mb-2">
                Ciao! Sono il tuo assistente turistico
              </h2>
              <p className="text-zinc-500 max-w-sm mb-6">
                Chiedimi cosa fare a Cesenatico, eventi, ristoranti, spiagge e
                molto altro!
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "Cosa posso fare con i bambini?",
                  "Eventi questo weekend",
                  "Ristoranti sul porto",
                  "Spiagge family-friendly",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-3 py-1.5 text-sm bg-zinc-900 text-zinc-400 rounded-lg ring-1 ring-zinc-800 hover:ring-sky-500/50 hover:text-zinc-200 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
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
                        ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3"
                        : "bg-zinc-900 text-zinc-100 rounded-2xl rounded-bl-md px-4 py-3 ring-1 ring-zinc-800"
                    }`}
                  >
                    {/* Tool calls indicator */}
                    {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mb-3 pb-3 border-b border-zinc-700/50">
                        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <span>Sto cercando informazioni...</span>
                        </div>
                        <div className="space-y-1.5">
                          {message.toolCalls.map((tc, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
                                tc.status === "completed"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-amber-500/10 text-amber-400"
                              }`}
                            >
                              {tc.status === "pending" ? (
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              <span className="font-medium">{formatToolName(tc.toolName)}</span>
                              {tc.args && Object.keys(tc.args).length > 0 && (
                                <span className="text-zinc-500">
                                  {Object.entries(tc.args)
                                    .filter(([_, v]) => v !== undefined)
                                    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                                    .join(", ")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                      {isLoading &&
                        index === messages.length - 1 &&
                        message.role === "assistant" &&
                        !message.content && 
                        (!message.toolCalls || message.toolCalls.length === 0) && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-sky-400 animate-pulse rounded-full align-middle" />
                        )}
                      {isLoading &&
                        index === messages.length - 1 &&
                        message.role === "assistant" &&
                        message.content && (
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
              placeholder="Chiedimi qualcosa su Cesenatico..."
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
            Premi Invio per inviare • Dati da Visit Cesenatico
          </p>
        </div>
      </footer>
    </div>
  );
}
