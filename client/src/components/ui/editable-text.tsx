import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Pencil, Sparkles, Check, X, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type EditableTextKind =
  | "phase-name"
  | "phase-description"
  | "task-title"
  | "task-description"
  | "deliverable-title"
  | "deliverable-description"
  | "project-name"
  | "project-description";

type Props = {
  value: string;
  onSave: (newValue: string) => void | Promise<void>;
  kind: EditableTextKind;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  /** When true, hides the AI ✨ button. Useful for short labels where refinement isn't valuable. */
  noAI?: boolean;
  /** Render hint to control the size of the displayed text. */
  size?: "sm" | "md" | "lg";
};

/**
 * Reusable inline text editor with optional AI refinement.
 *
 * Click ✏️ to edit (Enter saves, Escape cancels).
 * Click ✨ to ask Claude to refine the text in IM3 style — shows a preview
 * with Accept/Reject buttons before persisting.
 */
export function EditableText({ value, onSave, kind, multiline, placeholder, className, noAI, size = "md" }: Props) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [aiSuggestion, setAISuggestion] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    }
  }, [isEditing]);

  const startEdit = () => {
    setDraft(value);
    setAISuggestion(null);
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    setDraft(value);
    setAISuggestion(null);
  };

  const save = async (newValue: string) => {
    const trimmed = newValue.trim();
    if (!trimmed || trimmed === value) {
      cancel();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(trimmed);
      setIsEditing(false);
      setAISuggestion(null);
    } catch (err: any) {
      toast({ title: "Error guardando", description: err?.message || "No se pudo guardar el cambio", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const refineWithAI = async (sourceText: string) => {
    if (!sourceText.trim()) return;
    setIsRefining(true);
    try {
      const res = await apiRequest("POST", "/api/admin/ai/refine-text", { text: sourceText, kind });
      const data = await res.json() as { refined?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.refined) throw new Error("La IA no devolvió texto refinado");
      setAISuggestion(data.refined);
      // Si no estábamos editando aún, entrar a modo edit con el draft original visible
      if (!isEditing) {
        setDraft(sourceText);
        setIsEditing(true);
      }
    } catch (err: any) {
      toast({
        title: "No se pudo refinar con IA",
        description: err?.message || "Intenta de nuevo o edita manualmente",
        variant: "destructive",
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !multiline && !e.shiftKey) {
      e.preventDefault();
      save(draft);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && multiline) {
      e.preventDefault();
      save(draft);
    }
  };

  const sizeClass = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";

  // ─── Modo display (no editando) ───
  if (!isEditing) {
    return (
      <span className={`group inline-flex items-start gap-1.5 ${className || ""}`}>
        <span className={sizeClass}>{value || <em className="text-gray-400">{placeholder || "Sin texto"}</em>}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex gap-0.5 shrink-0">
          <button
            type="button"
            onClick={startEdit}
            className="p-0.5 rounded text-gray-300 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
            title="Editar"
          >
            <Pencil className="w-3 h-3" />
          </button>
          {!noAI && (
            <button
              type="button"
              onClick={() => refineWithAI(value)}
              disabled={isRefining || !value.trim()}
              className="p-0.5 rounded text-gray-300 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors disabled:opacity-30"
              title="Mejorar con IA"
            >
              {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            </button>
          )}
        </span>
      </span>
    );
  }

  // ─── Modo edit con sugerencia IA pendiente ───
  if (aiSuggestion !== null) {
    return (
      <div className={`space-y-2 border border-[#2FA4A9]/30 rounded-lg p-2 bg-[#2FA4A9]/5 ${className || ""}`}>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Original</p>
          <p className={`${sizeClass} text-gray-500 line-through`}>{value}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#2FA4A9] mb-0.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Sugerencia IA
          </p>
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={aiSuggestion}
              onChange={e => setAISuggestion(e.target.value)}
              onKeyDown={handleKey}
              rows={3}
              className="w-full text-sm border border-[#2FA4A9]/30 rounded px-2 py-1 focus:outline-none focus:border-[#2FA4A9]"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={aiSuggestion}
              onChange={e => setAISuggestion(e.target.value)}
              onKeyDown={handleKey}
              className="w-full text-sm border border-[#2FA4A9]/30 rounded px-2 py-1 focus:outline-none focus:border-[#2FA4A9]"
            />
          )}
        </div>
        <div className="flex items-center gap-1 justify-end">
          <button
            type="button"
            onClick={cancel}
            disabled={isSaving}
            className="px-2 py-1 rounded text-[11px] text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => refineWithAI(aiSuggestion)}
            disabled={isRefining || isSaving}
            className="p-1 rounded text-gray-500 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
            title="Refinar otra vez"
          >
            {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => save(aiSuggestion)}
            disabled={isSaving || !aiSuggestion.trim()}
            className="px-2 py-1 rounded text-[11px] bg-[#2FA4A9] text-white hover:bg-[#238b8f] transition-colors gap-1 inline-flex items-center"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Aplicar
          </button>
        </div>
      </div>
    );
  }

  // ─── Modo edit normal (sin IA) ───
  return (
    <span className={`inline-flex items-center gap-1 ${className || ""}`}>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => save(draft)}
          rows={2}
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#2FA4A9]"
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => save(draft)}
          className={`flex-1 ${sizeClass} border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:border-[#2FA4A9]`}
        />
      )}
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={cancel}
        disabled={isSaving}
        className="p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        title="Cancelar (Esc)"
      >
        <X className="w-3 h-3" />
      </button>
      {!noAI && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => refineWithAI(draft)}
          disabled={isRefining || isSaving || !draft.trim()}
          className="p-0.5 rounded text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors disabled:opacity-30"
          title="Refinar con IA"
        >
          {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        </button>
      )}
      {isSaving && <Loader2 className="w-3 h-3 animate-spin text-[#2FA4A9]" />}
    </span>
  );
}
