import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Send, Loader2, Trash2, Check } from "lucide-react";

type ToolCall = { tool: string; summary: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; toolCalls: ToolCall[] | null; createdAt: string };

const QUICK_PROMPTS = [
  "¿Cuánto cuestan 500 mensajes WhatsApp marketing/mes?",
  "Si el cliente usa 200GB Supabase y 5M tokens Claude, ¿cuánto le sale?",
  "Compara el costo de usar Resend free vs Pro",
  "¿Qué servicios de IA tenemos en el catálogo y cuánto valen?",
];

const TOOL_LABELS: Record<string, string> = {
  list_services: "Listó servicios",
  get_service_detail: "Consultó detalle",
  calculate_cost: "Calculó costo",
};

export function SimulatorChatPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<Msg[]>({
    queryKey: ["/api/admin/stack-simulator/chat"],
  });

  const sendMut = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/admin/stack-simulator/chat", { message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stack-simulator/chat"] });
      setInput("");
    },
    onError: (err: any) => toast({ title: "Error en chat", description: err?.message, variant: "destructive" }),
  });

  const clearMut = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", "/api/admin/stack-simulator/chat"); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stack-simulator/chat"] });
      toast({ title: "Chat limpiado" });
    },
  });

  const pendingMsg = sendMut.isPending ? sendMut.variables : null;
  const all = pendingMsg
    ? [...messages, { id: "__pending__", role: "user" as const, content: pendingMsg, toolCalls: null, createdAt: new Date().toISOString() }]
    : messages;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [all.length, sendMut.isPending]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMut.isPending) return;
    sendMut.mutate(msg);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <div>
            <div className="text-sm font-semibold">Chat IA del simulador</div>
            <div className="text-[10px] text-gray-500">Pregunta en lenguaje natural — consulta datos exactos del catálogo</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { if (confirm("¿Limpiar conversación?")) clearMut.mutate(); }}
            className="p-1.5 text-gray-400 hover:text-red-500"
            title="Limpiar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50/40">
        {isLoading ? (
          <p className="text-xs text-gray-400 text-center py-6">Cargando…</p>
        ) : all.length === 0 ? (
          <div className="py-4 space-y-3">
            <div className="text-center space-y-1.5">
              <Sparkles className="w-8 h-8 text-purple-300 mx-auto" />
              <p className="text-sm font-medium text-gray-700">¿Qué cliente o escenario quieres simular?</p>
              <p className="text-[11px] text-gray-400">Las respuestas usan los precios exactos del catálogo, no estimaciones.</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium px-1">Ejemplos</p>
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setInput(p)}
                  className="w-full text-left px-3 py-2 rounded-md bg-white border border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 text-xs text-gray-700 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          all.map(m => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-xl px-3.5 py-2 ${
                m.role === "user" ? "bg-purple-600 text-white" : "bg-white border border-gray-200 text-gray-800"
              }`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                    {m.toolCalls.map((tc, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-1">
                        <Check className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">{TOOL_LABELS[tc.tool] || tc.tool}</div>
                          <div className="text-emerald-600/80 truncate">{tc.summary}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {sendMut.isPending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Pensando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-200 p-2.5 bg-white">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="¿Cuánto cuesta…?"
            rows={2}
            className="resize-none text-sm"
            disabled={sendMut.isPending}
          />
          <Button onClick={handleSend} disabled={!input.trim() || sendMut.isPending} size="sm" className="bg-purple-600 hover:bg-purple-700 shrink-0">
            {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
