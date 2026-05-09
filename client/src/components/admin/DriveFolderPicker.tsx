import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Folder, Loader2, Plus, Search, X } from "lucide-react";

export interface DriveFolderSelection {
  id: string;
  name: string;
  path: string;
}

interface DriveFolderListing {
  parentId: string;
  parentName: string;
  breadcrumbs: Array<{ id: string; name: string }>;
  folders: Array<{ id: string; name: string; modifiedTime: string }>;
}

interface DriveFolderSearchResponse {
  folders: Array<{ id: string; name: string; modifiedTime: string; parents: string[] }>;
  truncated: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (folder: DriveFolderSelection) => void;
  initialFolderId?: string | null;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function DriveFolderPicker({ open, onClose, onSelect, initialFolderId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(initialFolderId || undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSearch("");
      setCreating(false);
      setNewFolderName("");
      setCurrentFolderId(initialFolderId || undefined);
    }
  }, [open, initialFolderId]);

  const folderUrl = `/api/admin/drive/folders${currentFolderId ? `?parentId=${encodeURIComponent(currentFolderId)}` : ""}`;
  const searchUrl = `/api/admin/drive/search?q=${encodeURIComponent(debouncedSearch)}`;
  const useSearch = debouncedSearch.length >= 2;

  const listingQuery = useQuery<DriveFolderListing>({
    queryKey: [folderUrl],
    enabled: open && !useSearch,
  });

  const searchQuery = useQuery<DriveFolderSearchResponse>({
    queryKey: [searchUrl],
    enabled: open && useSearch,
  });

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/admin/drive/folders", { parentId: currentFolderId, name });
      return res.json() as Promise<{ id: string; name: string; path: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [folderUrl] });
      setCreating(false);
      setNewFolderName("");
      toast({ title: "Carpeta creada" });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "No se pudo crear la carpeta", variant: "destructive" });
    },
  });

  const handleSelect = (folder: { id: string; name: string }) => {
    if (useSearch) {
      onSelect({ id: folder.id, name: folder.name, path: folder.name });
      onClose();
      return;
    }
    const breadcrumbs = listingQuery.data?.breadcrumbs || [];
    const path = [...breadcrumbs.map(b => b.name), folder.name].join(" > ");
    onSelect({ id: folder.id, name: folder.name, path });
    onClose();
  };

  const breadcrumbs = listingQuery.data?.breadcrumbs || [];
  const folders = useSearch ? (searchQuery.data?.folders || []) : (listingQuery.data?.folders || []);
  const isLoading = useSearch ? searchQuery.isLoading : listingQuery.isLoading;
  const errorObj = useSearch ? searchQuery.error : listingQuery.error;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl flex flex-col h-[85vh] sm:h-[600px] p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>Selecciona una carpeta de Drive</DialogTitle>
        </DialogHeader>

        {!useSearch && breadcrumbs.length > 0 && (
          <div className="px-4 py-2 border-b flex items-center gap-1 text-sm overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setCurrentFolderId(undefined)}
              className="text-[#2FA4A9] hover:underline"
            >
              Mi unidad
            </button>
            {breadcrumbs.map((b, i) => (
              <Fragment key={b.id}>
                <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                <button
                  onClick={() => setCurrentFolderId(b.id)}
                  className="text-[#2FA4A9] hover:underline"
                >
                  {b.name}
                </button>
              </Fragment>
            ))}
          </div>
        )}

        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>
          {useSearch && searchQuery.data?.truncated && (
            <p className="text-[10px] text-gray-400 mt-1">Mostrando primeros 50 resultados — refina la búsqueda.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : errorObj ? (
            <p className="text-sm text-red-600 text-center py-8">{(errorObj as Error).message}</p>
          ) : folders.length === 0 ? (
            <p className="text-gray-400 text-sm py-12 text-center">
              {useSearch ? "Sin resultados" : "Carpeta vacía"}
            </p>
          ) : (
            folders.map(f => (
              <div
                key={f.id}
                onClick={() => setSelectedId(f.id)}
                onDoubleClick={() => {
                  if (useSearch) {
                    handleSelect(f);
                  } else {
                    setCurrentFolderId(f.id);
                    setSelectedId(null);
                  }
                }}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left cursor-pointer transition-colors ${
                  selectedId === f.id
                    ? "bg-[#2FA4A9]/10 ring-1 ring-[#2FA4A9]"
                    : "hover:bg-gray-50"
                }`}
              >
                <Folder className="w-4 h-4 text-[#2FA4A9] shrink-0" />
                <span className="text-sm text-gray-800 flex-1 truncate">{f.name}</span>
                {!useSearch && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentFolderId(f.id);
                      setSelectedId(null);
                    }}
                    className="text-gray-400 hover:text-[#2FA4A9] p-1 -m-1"
                    title="Entrar"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {!useSearch && (
          <div className="px-4 py-2 border-t bg-gray-50">
            {creating ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Nombre de la carpeta"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newFolderName.trim()) createMut.mutate(newFolderName.trim());
                    if (e.key === "Escape") { setCreating(false); setNewFolderName(""); }
                  }}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  disabled={!newFolderName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate(newFolderName.trim())}
                  className="bg-[#2FA4A9] hover:bg-[#238b8f]"
                >
                  {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Crear"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNewFolderName(""); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="text-xs text-[#2FA4A9] flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear nueva carpeta aquí
              </button>
            )}
          </div>
        )}

        <div className="px-4 py-3 border-t flex justify-end gap-2 bg-white">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!selectedId}
            onClick={() => {
              const sel = folders.find(f => f.id === selectedId);
              if (sel) handleSelect(sel);
            }}
            className="bg-[#2FA4A9] hover:bg-[#238b8f]"
          >
            Seleccionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
