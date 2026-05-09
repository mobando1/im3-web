import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ExternalLink, Folder, Loader2, RefreshCw } from "lucide-react";
import { DriveFolderPicker, DriveFolderSelection } from "./DriveFolderPicker";

interface Contact {
  id: string;
  driveFolderId?: string | null;
}

interface Props {
  contact: Contact;
}

export function ContactDriveFolderBanner({ contact }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const pathQuery = useQuery<{ id: string; path: string }>({
    queryKey: [`/api/admin/drive/folders/${contact.driveFolderId}/path`],
    enabled: !!contact.driveFolderId,
  });

  const linkMut = useMutation({
    mutationFn: async (folderId: string | null) => {
      const res = await apiRequest("PATCH", `/api/admin/contacts/${contact.id}`, { driveFolderId: folderId });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/admin/contacts/${contact.id}`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contacts"] });
      toast({ title: "Carpeta vinculada" });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Error vinculando carpeta", variant: "destructive" });
    },
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/contacts/${contact.id}/sync-drive`);
      return res.json() as Promise<{ message: string; synced: number; total: number; skipped: number }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [`/api/admin/contacts/${contact.id}/files`] });
      toast({ title: result.message });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Error sincronizando", variant: "destructive" });
    },
  });

  const handleSelect = (folder: DriveFolderSelection) => {
    linkMut.mutate(folder.id);
  };

  if (!contact.driveFolderId) {
    return (
      <>
        <div className="flex items-center gap-3 p-3 mb-3 rounded-lg border border-amber-200 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm text-amber-900">
            Este contacto no tiene carpeta de Google Drive vinculada — los archivos no se sincronizarán automáticamente.
          </div>
          <Button
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Vincular ahora
          </Button>
        </div>
        <DriveFolderPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelect}
        />
      </>
    );
  }

  const path = pathQuery.data?.path || "Cargando ruta...";
  const folderUrl = `https://drive.google.com/drive/folders/${contact.driveFolderId}`;

  return (
    <>
      <div className="flex items-center gap-3 p-3 mb-3 rounded-lg border border-gray-200 bg-gray-50">
        <Folder className="w-4 h-4 text-[#2FA4A9] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500">Carpeta vinculada</div>
          <div className="text-sm text-gray-800 truncate" title={path}>{path}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            title="Sincronizar archivos desde Drive"
          >
            {syncMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </Button>
          <a href={folderUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" title="Abrir en Drive">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            disabled={linkMut.isPending}
          >
            Cambiar
          </Button>
        </div>
      </div>
      <DriveFolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
        initialFolderId={contact.driveFolderId}
      />
    </>
  );
}
