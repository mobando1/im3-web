import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Send, Sparkles, Loader2, Check, Trash2, Paperclip, FileText, Image as ImageIcon, FileType, Undo2, Mic, MicOff } from "lucide-react";

type ToolCall = { tool: string; section?: string; summary: string };

type Attachment = { name: string; mime: string; size: number };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[] | null;
  attachments: Attachment[] | null;
  createdAt: string;
};

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileType;
  return FileText;
}

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolCall[]>([]);
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/admin/proposals/${proposalId}/chat`],
    enabled: open,
  });

  const sendMutation = useMutation({
    mutationFn: async ({ message, files }: { message: string; files: File[] }) => {
      const formData = new FormData();
      formData.append("message", message);
      for (const f of files) formData.append("files", f);

      const res = await fetch(`/api/admin/proposals/${proposalId}/chat/stream`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error en chat");
      }

      // Lectura SSE con timeout — si el proxy buffea y nunca llega "done",
      // a los 90s sin eventos bailamos out: invalidamos queries (así el user
      // ve la respuesta que sí se guardó server-side) y resolvemos limpio.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const STALL_TIMEOUT_MS = 90_000;

      const processBuffer = () => {
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const event = JSON.parse(data);
            if (event.type === "text_delta") {
              setStreamingText(prev => prev + event.text);
            } else if (event.type === "tool_call") {
              setStreamingTools(prev => [...prev, { tool: event.toolName, section: event.section, summary: event.summary }]);
            } else if (event.type === "error") {
              throw new Error(event.error);
            } else if (event.type === "done") {
              return { done: true, payload: { assistantMessage: event.assistantMessage, toolCalls: event.toolCalls } };
            }
          } catch (e: any) {
            if (e?.message && /^Error/.test(e.message)) throw e;
            // ignorar parse errors
          }
        }
        return { done: false };
      };

      while (true) {
        const readPromise = reader.read();
        const timeoutPromise = new Promise<{ value: undefined; done: true; timedOut: true }>(resolve =>
          setTimeout(() => resolve({ value: undefined, done: true, timedOut: true }), STALL_TIMEOUT_MS)
        );
        const result = await Promise.race([readPromise, timeoutPromise]) as { value?: Uint8Array; done: boolean; timedOut?: boolean };

        if (result.timedOut) {
          // Stream colgado — el server probablemente sí terminó. Cancela la lectura.
          reader.cancel().catch(() => {});
          break;
        }
        if (result.done) break;
        if (!result.value) continue;
        buffer += decoder.decode(result.value, { stream: true });
        const r = processBuffer();
        if (r.done && r.payload) return r.payload;
      }

      // Procesar lo que pueda quedar en buffer (por si "done" llegó sin \n\n final)
      if (buffer.trim()) {
        buffer += "\n\n";
        const r = processBuffer();
        if (r.done && r.payload) return r.payload;
      }
      // Si llegamos aquí: stream terminó sin "done" claro. Confiar en invalidación.
      return { assistantMessage: "", toolCalls: [] };
    },
    onMutate: () => {
      setStreaming(true);
      setStreamingText("");
      setStreamingTools([]);
    },
    onSettled: () => {
      setStreaming(false);
      setStreamingText("");
      setStreamingTools([]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/chat`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/snapshots`] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/proposals/${proposalId}/chat`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error limpiando chat");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/chat`] });
    },
  });

  const { data: snapshots = [] } = useQuery<Array<{
    id: string;
    changeSummary: string | null;
    sectionKey: string | null;
    createdAt: string;
  }>>({
    queryKey: [`/api/admin/proposals/${proposalId}/snapshots`],
    enabled: open,
  });

  const undoMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await fetch(`/api/admin/proposals/${proposalId}/snapshots/${snapshotId}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error restaurando");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}/snapshots`] });
    },
  });

  // ── Voice input (Whisper) ──
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "" });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (audioBlob.size === 0) return;
        setIsTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", audioBlob, "voice.webm");
          const resp = await fetch("/api/admin/transcribe", {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            alert(err.error || "Error transcribiendo");
            return;
          }
          const data = await resp.json() as { text?: string };
          if (data.text) {
            setInput(prev => (prev ? prev + " " : "") + data.text);
            textareaRef.current?.focus();
          }
        } catch (err) {
          alert("Error transcribiendo: " + (err as Error).message);
        } finally {
          setIsTranscribing(false);
        }
      };
      mr.start();
      setIsRecording(true);
    } catch (err) {
      alert("No se pudo acceder al micrófono: " + (err as Error).message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => {
      if (f.size > MAX_FILE_SIZE) {
        alert(`"${f.name}" excede el límite de 10 MB`);
        return false;
      }
      return true;
    });
    setPendingFiles(prev => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        alert(`Máximo ${MAX_FILES} archivos por mensaje`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

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
    if ((!trimmed && pendingFiles.length === 0) || streaming) return;
    setInput("");
    const files = pendingFiles;
    setPendingFiles([]);
    sendMutation.mutate({ message: trimmed, files });
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
            {snapshots.length > 0 && (
              <button
                onClick={() => {
                  const last = snapshots[0];
                  const summary = last.changeSummary || "último cambio";
                  if (confirm(`¿Deshacer el último cambio del chat?\n"${summary}"`)) {
                    undoMutation.mutate(last.id);
                  }
                }}
                disabled={undoMutation.isPending}
                className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                title="Deshacer último cambio del chat"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            )}
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
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {m.attachments.map((a, i) => {
                        const Icon = getFileIcon(a.mime);
                        return (
                          <div key={i} className={`flex items-center gap-1.5 text-[11px] rounded px-2 py-1 ${
                            m.role === "user" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
                          }`}>
                            <Icon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{a.name}</span>
                            <span className="opacity-60">({formatFileSize(a.size)})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
              <div className="max-w-[85%] bg-white border border-gray-200 rounded-2xl px-4 py-2.5">
                {streamingText ? (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-800">{streamingText}<span className="inline-block w-1.5 h-3.5 bg-purple-400 ml-0.5 animate-pulse" /></p>
                ) : (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
                    <span className="text-xs text-gray-500">Pensando...</span>
                  </div>
                )}
                {streamingTools.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                    {streamingTools.map((tc, i) => (
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
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-3 bg-white">
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingFiles.map((f, i) => {
                const Icon = getFileIcon(f.type);
                return (
                  <div key={i} className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-md px-2 py-1 text-[11px] text-purple-800">
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[140px]">{f.name}</span>
                    <span className="opacity-60">({formatFileSize(f.size)})</span>
                    <button
                      onClick={() => removeFile(i)}
                      className="ml-1 text-purple-400 hover:text-red-500"
                      title="Quitar archivo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || pendingFiles.length >= MAX_FILES}
              size="sm"
              variant="outline"
              className="h-auto py-2.5 px-2.5"
              title="Adjuntar archivo (imágenes, PDF, texto)"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={streaming || isTranscribing}
              size="sm"
              variant="outline"
              className={`h-auto py-2.5 px-2.5 ${isRecording ? "bg-red-50 border-red-300 text-red-600" : ""}`}
              title={isRecording ? "Detener grabación" : "Grabar voz (Whisper)"}
            >
              {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe o adjunta archivos..."
              rows={2}
              disabled={streaming}
              className="flex-1 resize-none text-sm"
            />
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && pendingFiles.length === 0) || streaming}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 h-auto py-2.5"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">⏎ enviar · ⇧⏎ nueva línea · imágenes/PDFs hasta 10MB</p>
        </div>
      </div>
    </>
  );
}
