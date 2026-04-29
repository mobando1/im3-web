import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wand2, Check, X, Loader2 } from "lucide-react";

type AiFieldHelperProps = {
  value: string;
  onChange: (newValue: string) => void;
  context?: string;
  children: React.ReactNode;
};

/**
 * Wraps any input/textarea field with a ✨ AI rewrite button.
 * Click the button → inline input for instruction → Claude rewrites just that field.
 */
export function AiFieldHelper({ value, onChange, context, children }: AiFieldHelperProps) {
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const rewriteMut = useMutation({
    mutationFn: async (inst: string) => {
      const res = await apiRequest("POST", "/api/admin/ai/rewrite", {
        text: value,
        instruction: inst,
        context: context || "",
      });
      return res.json() as Promise<{ text: string }>;
    },
    onSuccess: (data) => {
      setPreview(data.text);
    },
  });

  const accept = () => {
    if (preview) {
      onChange(preview);
      setPreview(null);
      setShowInput(false);
      setInstruction("");
    }
  };

  const cancel = () => {
    setShowInput(false);
    setPreview(null);
    setInstruction("");
  };

  return (
    <div className="relative group">
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">{children}</div>
        {!showInput && value && (
          <button
            onClick={() => setShowInput(true)}
            className="shrink-0 mt-1 p-1 rounded text-gray-300 hover:text-purple-600 hover:bg-purple-50 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Reescribir con IA"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showInput && (
        <div className="mt-1.5 bg-purple-50 border border-purple-200 rounded-lg p-2.5 space-y-2">
          {!preview ? (
            <>
              <div className="flex gap-1.5">
                <Input
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  placeholder="Ej: hazlo más corto, más específico, agrega que es en 24h..."
                  className="text-xs h-7 bg-white"
                  onKeyDown={e => e.key === "Enter" && instruction.trim() && rewriteMut.mutate(instruction.trim())}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => instruction.trim() && rewriteMut.mutate(instruction.trim())}
                  disabled={!instruction.trim() || rewriteMut.isPending}
                  className="h-7 px-2 bg-purple-600 hover:bg-purple-700 text-xs shrink-0"
                >
                  {rewriteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel} className="h-7 px-1.5 shrink-0">
                  <X className="w-3 h-3" />
                </Button>
              </div>
              {rewriteMut.isError && (
                <p className="text-[10px] text-red-600">Error: {(rewriteMut.error as Error)?.message}</p>
              )}
            </>
          ) : (
            <>
              <div className="bg-white border border-purple-200 rounded p-2">
                <p className="text-xs text-gray-500 mb-0.5">Sugerencia de Claude:</p>
                <p className="text-sm text-gray-900">{preview}</p>
              </div>
              <div className="flex gap-1.5 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)} className="h-6 text-[10px] px-2">
                  Otra versión
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel} className="h-6 text-[10px] px-2">
                  Cancelar
                </Button>
                <Button size="sm" onClick={accept} className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 gap-1">
                  <Check className="w-3 h-3" /> Aceptar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
