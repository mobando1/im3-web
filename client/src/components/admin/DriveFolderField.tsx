import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Folder, Link2, Loader2, Plus, X } from "lucide-react";
import { DriveFolderPicker, DriveFolderSelection } from "./DriveFolderPicker";

interface Props {
  value: string | null;
  path: string | null;
  onChange: (selection: { id: string; path: string } | null) => void;
  autoCreateName?: string;
  contextHint?: string;
  label?: string;
}

export function DriveFolderField({ value, path, onChange, autoCreateName, contextHint, label }: Props) {
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!autoCreateName) throw new Error("Nombre auto vacío");
      const res = await apiRequest("POST", "/api/admin/drive/folders", { name: autoCreateName });
      return res.json() as Promise<{ id: string; name: string; path: string }>;
    },
    onSuccess: (folder) => {
      onChange({ id: folder.id, path: folder.path });
      toast({ title: "Carpeta creada en Drive", description: folder.path });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "No se pudo crear la carpeta", variant: "destructive" });
    },
  });

  const handlePickerSelect = (folder: DriveFolderSelection) => {
    onChange({ id: folder.id, path: folder.path });
  };

  return (
    <div className="space-y-1.5">
      {label !== "" && (
        <Label>
          {label || "Carpeta de Google Drive"}
          {contextHint && <span className="text-gray-400 font-normal ml-1">({contextHint})</span>}
        </Label>
      )}

      {value ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
          <Folder className="w-4 h-4 text-[#2FA4A9] shrink-0" />
          <span className="text-sm text-gray-800 flex-1 truncate" title={path || value}>
            {path || value}
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs text-[#2FA4A9] hover:underline px-1.5"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-red-500 p-1 -m-1"
            title="Desvincular"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!autoCreateName?.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Crear nueva
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
          >
            <Link2 className="w-3.5 h-3.5 mr-1.5" />
            Vincular existente
          </Button>
        </div>
      )}

      <DriveFolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        initialFolderId={value}
      />
    </div>
  );
}
