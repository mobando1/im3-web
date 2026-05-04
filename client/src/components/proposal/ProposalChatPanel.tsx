import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Send, Sparkles, Loader2, Check, Trash2 } from "lucide-react";

type ToolCall = { tool: string; section?: string; summary: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[] | null;
  createdAt: string;
};

type Props = {
  proposalId: string;
  open: boolean;
  onClose: () => void;
};

const SECTION_LABELS: Record<string, string> = {
  meta: "Metadatos",
  hero: "Hero (Portada)",
  summary: "Resumen Ejecutivo",
  problem: "El Problema",
  solution: "Nuestra Solución",
  tech: "Cómo Funciona",
  timeline: "Cronograma",
  roi: "Retorno de Inversión",
  authority: "Sobre IM3 Systems",
  pricing: "Inversión",
  hardware: "Hardware",
  operationalCosts: "Costos Operativos",
  cta: "Próximos Pasos",
};

const QUICK_SUGGESTIONS = [
  "Hazme la solución más técnica",
  "Ajusta el pricing — el cliente tiene presupuesto limitado",
  "Reescribe el problema enfocándote en logística",
  "Mejora el ROI con métricas más concretas",
  "Hazme el resumen ejecutivo más persuasivo",
];

export function ProposalChatPanel({ proposalId, open, onClose }: Props) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/admin/proposals/${proposalId}/chat`],
    enabled: open,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${proposalId}/chat`, { message });
      return res.json();
    },
    onMutate: () => setStreaming(true),
    onSettled: () => setStreaming(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/chat`] });
      // Refetch the proposal so the editor sees the changes
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}`] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/proposals/${proposalId}/chat`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/chat`] });
    },
  });

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, open, streaming]);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [open]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput("");
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <div>
              <h3 className="text-sm font-bold text-gray-900">Asistente IA</h3>
              <p className="text-[11px] text-gray-500">Refina la propuesta conversacionalmente</p>
            </div>
          </div>
          <div className="flex gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => { if (confirm("¿Limpiar todo el chat?")) clearMutation.mutate(); }}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Limpiar chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
          {isLoading ? (
            <p className="text-center text-xs text-gray-400 py-8">Cargando...</p>
          ) : messages.length === 0 ? (
            <div className="space-y-3 py-4">
              <div className="text-center space-y-2">
                <Sparkles className="w-10 h-10 text-purple-300 mx-auto" />
                <p className="text-sm text-gray-600 font-medium">¿Cómo refinamos la propuesta?</p>
                <p className="text-xs text-gray-400">Pídele al asistente que ajuste cualquier sección</p>
              </div>
              <div className="space-y-1.5 mt-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium px-1">Sugerencias</p>
                {QUICK_SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 transition-colors text-xs text-gray-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  m.role === "user"
                    ? "bg-[#2FA4A9] text-white"
                    : "bg-white border border-gray-200 text-gray-800"
                }`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                      {m.toolCalls.map((tc, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                          <Check className="w-3 h-3 mt-0.5 shrink-0" />
                          <div>
                            {tc.section && <span className="font-medium">{SECTION_LABELS[tc.section] || tc.section}: </span>}
                            <span>{tc.summary}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className={`text-[10px] mt-1 ${m.role === "user" ? "text-white/60" : "text-gray-400"}`}>
                    {new Date(m.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))
          )}
          {streaming && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
                <span className="text-xs text-gray-500">Pensando...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-3 bg-white">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe lo que quieres ajustar..."
              rows={2}
              disabled={streaming}
              className="flex-1 resize-none text-sm"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 h-auto py-2.5"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">⏎ enviar · ⇧⏎ nueva línea</p>
        </div>
      </div>
    </>
  );
}
