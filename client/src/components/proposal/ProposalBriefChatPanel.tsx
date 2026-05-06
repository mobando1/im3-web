import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X, Send, BookOpen, Loader2, Check, Trash2 } from "lucide-react";

type ToolCall = { tool: string; module?: string; summary: string };

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

const QUICK_SUGGESTIONS = [
  "Audita el brief y dime qué módulos están cortos",
  "Profundiza el módulo más importante con más ejemplos del cliente",
  "Genera 5 FAQs basadas en lo que el cliente típicamente pregunta",
  "Revisa si el brief contradice algo de la propuesta inicial",
  "Agrega un glosario con los términos técnicos clave",
];

const TOOL_LABELS: Record<string, string> = {
  view_brief: "Leyó el brief completo",
  view_module: "Leyó un módulo",
  update_module: "Actualizó módulo",
  update_intro: "Actualizó introducción",
  update_faqs: "Actualizó FAQs",
  update_glossary: "Actualizó glosario",
  add_module: "Agregó módulo",
  remove_module: "Eliminó módulo",
  audit_brief: "Auditoría del brief",
  list_drive_folder: "Listó archivos de Drive",
  read_drive_file: "Leyó archivo de Drive",
};

export function ProposalBriefChatPanel({ proposalId, open, onClose }: Props) {
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/admin/proposals/${proposalId}/brief/chat`],
    enabled: open,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${proposalId}/brief/chat`, { message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/brief/chat`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/brief`] });
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
    onError: (err: any) => {
      toast({ title: "Error en el chat", description: err?.message || "Revisa la consola", variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/proposals/${proposalId}/brief/chat`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/brief/chat`] });
      toast({ title: "Chat limpiado" });
    },
  });

  // Optimistic local message mientras se procesa la mutación
  const pendingMessage = sendMutation.isPending ? sendMutation.variables : null;
  const allMessages = pendingMessage
    ? [...messages, { id: "__pending__", role: "user" as const, content: pendingMessage, toolCalls: null, createdAt: new Date().toISOString() }]
    : messages;

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length, sendMutation.isPending, open]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  if (!open) return null;

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMutation.isPending) return;
    sendMutation.mutate(msg);
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-700" />
            <div>
              <h3 className="text-sm font-bold text-gray-900">Asistente del Brief</h3>
              <p className="text-[11px] text-gray-500">Refina el brief conversacionalmente</p>
            </div>
          </div>
          <div className="flex gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => { if (confirm("¿Limpiar todo el chat del brief?")) clearMutation.mutate(); }}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Limpiar chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
          {isLoading ? (
            <p className="text-center text-xs text-gray-400 py-8">Cargando…</p>
          ) : allMessages.length === 0 ? (
            <div className="space-y-3 py-4">
              <div className="text-center space-y-2">
                <BookOpen className="w-10 h-10 text-amber-300 mx-auto" />
                <p className="text-sm text-gray-600 font-medium">¿Cómo refinamos el brief?</p>
                <p className="text-xs text-gray-400">Pide profundizar módulos, generar FAQs, auditar coherencia, etc.</p>
              </div>
              <div className="space-y-1.5 mt-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium px-1">Sugerencias</p>
                {QUICK_SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-xs text-gray-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            allMessages.map(m => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  m.role === "user" ? "bg-amber-700 text-white" : "bg-white border border-gray-200 text-gray-800"
                }`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                      {m.toolCalls.map((tc, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                          <Check className="w-3 h-3 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium">{TOOL_LABELS[tc.tool] || tc.tool}{tc.module ? ` · ${tc.module}` : ""}</div>
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
          {sendMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando…
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Pídele al asistente que ajuste el brief…"
              rows={2}
              className="resize-none text-sm"
              disabled={sendMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              size="sm"
              className="bg-amber-700 hover:bg-amber-800 shrink-0"
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </>
  );
}
