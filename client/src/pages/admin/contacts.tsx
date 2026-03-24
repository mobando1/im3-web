import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { List, LayoutGrid, Mail, Filter, Download, X, MessageCircle, Tag, UserX, Trash2 } from "lucide-react";

type Contact = {
  id: string;
  nombre: string;
  empresa: string;
  email: string;
  telefono: string | null;
  status: string;
  createdAt: string;
  leadScore: number;
  emailsSent: number;
  emailsOpened: number;
};

type ContactsResponse = {
  contacts: Contact[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type PipelineResponse = {
  lead: Contact[];
  contacted: Contact[];
  scheduled: Contact[];
  converted: Contact[];
};

const statusColors: Record<string, string> = {
  lead: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  scheduled: "bg-orange-50 text-orange-700 border-orange-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  contacted: "Contactado",
  scheduled: "Agendado",
  converted: "Convertido",
};

const pipelineBorderColors: Record<string, string> = {
  lead: "border-t-blue-500",
  contacted: "border-t-amber-500",
  scheduled: "border-t-orange-500",
  converted: "border-t-emerald-500",
};

const pipelineCountColors: Record<string, string> = {
  lead: "bg-blue-50 text-blue-600",
  contacted: "bg-amber-50 text-amber-600",
  scheduled: "bg-orange-50 text-orange-600",
  converted: "bg-emerald-50 text-emerald-600",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

export default function Contacts() {
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [substatusFilter, setSubstatusFilter] = useState("all");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [bulkStatus, setBulkStatus] = useState("contacted");
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contacts"] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (data: { ids: string[]; action: string; payload: any }) => {
      await apiRequest("POST", "/api/admin/contacts/bulk", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSelectedIds(new Set());
      setBulkTag("");
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (search) queryParams.set("search", search);
  if (minScore) queryParams.set("minScore", minScore);
  if (maxScore) queryParams.set("maxScore", maxScore);
  if (substatusFilter !== "all") queryParams.set("substatus", substatusFilter);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    if (minScore) params.set("minScore", minScore);
    if (maxScore) params.set("maxScore", maxScore);
    if (substatusFilter !== "all") params.set("substatus", substatusFilter);
    window.open(`/api/admin/contacts/export?${params.toString()}`, "_blank");
  };

  const hasActiveFilters = minScore !== "" || maxScore !== "" || substatusFilter !== "all";
  const clearFilters = () => {
    setMinScore("");
    setMaxScore("");
    setSubstatusFilter("all");
    setStatusFilter("all");
    setSearch("");
    setPage(1);
  };

  const { data, isLoading, error } = useQuery<ContactsResponse>({
    queryKey: [`/api/admin/contacts?${queryParams.toString()}`],
    enabled: view === "list",
  });

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery<PipelineResponse>({
    queryKey: ["/api/admin/contacts/pipeline", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/contacts/pipeline?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch pipeline`);
      return res.json();
    },
    enabled: view === "pipeline",
  });

  const toggleSelectAll = () => {
    if (!data?.contacts) return;
    if (selectedIds.size === data.contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.contacts.map(c => c.id)));
    }
  };

  const paginationStart = data ? (data.pagination.page - 1) * data.pagination.limit + 1 : 0;
  const paginationEnd = data
    ? Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Contactos</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className={`rounded-none gap-2 ${
              view === "list"
                ? "bg-[#2FA4A9]/10 text-[#2FA4A9]"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <List className="w-4 h-4" />
            Lista
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("pipeline")}
            className={`rounded-none gap-2 border-l border-gray-200 ${
              view === "pipeline"
                ? "bg-[#2FA4A9]/10 text-[#2FA4A9]"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Pipeline
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar nombre, empresa o email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
        />
        {view === "list" && (
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40 bg-white border-gray-200 text-gray-700">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="contacted">Contactado</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="converted">Convertido</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className={`gap-1.5 border-gray-200 ${hasActiveFilters ? "text-[#2FA4A9] border-[#2FA4A9]/30 bg-[#2FA4A9]/5" : "text-gray-500"}`}>
          <Filter className="w-4 h-4" />
          Filtros
          {hasActiveFilters && <span className="text-xs bg-[#2FA4A9] text-white rounded-full w-4 h-4 flex items-center justify-center">!</span>}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 border-gray-200 text-gray-500 hover:text-gray-900">
          <Download className="w-4 h-4" />
          CSV
        </Button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Filtros avanzados</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Lead Score minimo</label>
              <Input type="number" placeholder="0" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1); }} className="bg-gray-50 border-gray-200 text-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Lead Score maximo</label>
              <Input type="number" placeholder="100" value={maxScore} onChange={(e) => { setMaxScore(e.target.value); setPage(1); }} className="bg-gray-50 border-gray-200 text-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Substatus</label>
              <Select value={substatusFilter} onValueChange={(v) => { setSubstatusFilter(v); setPage(1); }}>
                <SelectTrigger className="bg-gray-50 border-gray-200 text-gray-700">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="warm">Caliente</SelectItem>
                  <SelectItem value="cold">Frio</SelectItem>
                  <SelectItem value="interested">Interesado</SelectItem>
                  <SelectItem value="no_response">Sin respuesta</SelectItem>
                  <SelectItem value="proposal_sent">Propuesta enviada</SelectItem>
                  <SelectItem value="delivering">En entrega</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* List View */}
      {view === "list" && (
        <>
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 hover:bg-transparent">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={data?.contacts ? selectedIds.size === data.contacts.length && data.contacts.length > 0 : false}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-[#2FA4A9] focus:ring-[#2FA4A9]"
                      />
                    </TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Nombre</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Empresa</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Email</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Score</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Status</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Emails</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Fecha</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="border-gray-100">
                        {[...Array(9)].map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-gray-100 rounded animate-pulse w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : error ? (
                    <TableRow className="border-gray-100">
                      <TableCell
                        colSpan={9}
                        className="text-center text-red-400 py-8"
                      >
                        {error.message?.includes("401")
                          ? "Sesión expirada — recarga la página e inicia sesión"
                          : "Error al cargar contactos. Verifica la conexión al servidor."}
                      </TableCell>
                    </TableRow>
                  ) : data?.contacts.length === 0 ? (
                    <TableRow className="border-gray-100">
                      <TableCell
                        colSpan={9}
                        className="text-center text-gray-400 py-8"
                      >
                        No hay contactos aún. Aparecerán cuando alguien se suscriba al newsletter o complete un diagnóstico.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.contacts.map((contact) => {
                      const total = contact.emailsSent + contact.emailsOpened;
                      const ratio = total > 0 ? (contact.emailsOpened / total) * 100 : 0;
                      return (
                        <TableRow
                          key={contact.id}
                          onClick={() => navigate(`/admin/contacts/${contact.id}`)}
                          className="border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(contact.id)}
                              onChange={() => toggleSelect(contact.id)}
                              className="rounded border-gray-300 text-[#2FA4A9] focus:ring-[#2FA4A9]"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2FA4A9]/20 to-[#2FA4A9]/5 text-[#2FA4A9] flex items-center justify-center text-xs font-semibold shrink-0">
                                {getInitials(contact.nombre)}
                              </div>
                              <span className="text-gray-900 font-medium">
                                {contact.nombre}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {contact.empresa}
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">
                            {contact.email}
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full cursor-default ${
                                  contact.leadScore > 60 ? "bg-red-50 text-red-600" :
                                  contact.leadScore > 30 ? "bg-amber-50 text-amber-600" :
                                  "bg-gray-100 text-gray-500"
                                }`}>
                                  {contact.leadScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Lead Score: {contact.leadScore} — {contact.leadScore > 60 ? "Caliente" : contact.leadScore > 30 ? "Tibio" : "Frio"}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusColors[contact.status] || ""}
                            >
                              {statusLabels[contact.status] || contact.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 cursor-default">
                                  <span className="text-gray-700 text-sm font-medium">
                                    {contact.emailsOpened}/{contact.emailsSent}
                                  </span>
                                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#2FA4A9] rounded-full transition-all"
                                      style={{ width: `${ratio}%` }}
                                    />
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {contact.emailsOpened} de {contact.emailsSent} emails abiertos ({Math.round(ratio)}%)
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">
                            {new Date(contact.createdAt).toLocaleDateString("es-CO")}
                          </TableCell>
                          <TableCell className="w-20">
                            <div className="flex items-center gap-1">
                              {contact.telefono && (
                                <a
                                  href={`https://wa.me/${contact.telefono.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-gray-300 hover:text-green-600 transition-colors"
                                  title="WhatsApp"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(contact);
                                }}
                                className="text-gray-300 hover:text-red-600 transition-colors"
                                title="Eliminar contacto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {paginationStart}-{paginationEnd} de {data.pagination.total} contactos
              </p>
              {data.pagination.totalPages > 1 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="border-gray-200 text-gray-600"
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-gray-500 flex items-center px-2">
                    {page} / {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="border-gray-200 text-gray-600"
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 px-6 py-3 flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">
                {selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""}
              </span>
              <div className="h-6 w-px bg-gray-200" />
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="w-36 h-8 text-xs bg-white border-gray-200">
                  <SelectValue placeholder="Cambiar status" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
                  <SelectItem value="scheduled">Agendado</SelectItem>
                  <SelectItem value="converted">Convertido</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => bulkMutation.mutate({ ids: Array.from(selectedIds), action: "change_status", payload: { status: bulkStatus } })}
                disabled={bulkMutation.isPending}
                className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white text-xs h-8"
              >
                Aplicar
              </Button>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="Tag..."
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                  className="w-24 h-8 text-xs bg-white border-gray-200"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkTag.trim() && bulkMutation.mutate({ ids: Array.from(selectedIds), action: "add_tag", payload: { tag: bulkTag } })}
                  disabled={!bulkTag.trim() || bulkMutation.isPending}
                  className="h-8 text-xs border-gray-200 gap-1"
                >
                  <Tag className="w-3 h-3" />
                  Tag
                </Button>
              </div>
              <div className="h-6 w-px bg-gray-200" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkMutation.mutate({ ids: Array.from(selectedIds), action: "opt_out", payload: {} })}
                disabled={bulkMutation.isPending}
                className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1"
              >
                <UserX className="w-3 h-3" />
                Opt Out
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-gray-400 hover:text-gray-700 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Pipeline / Kanban View */}
      {view === "pipeline" && (
        <div className="grid grid-cols-4 gap-4">
          {(["lead", "contacted", "scheduled", "converted"] as const).map((status) => {
            const contacts = pipelineData?.[status] ?? [];
            return (
              <div key={status} className="flex flex-col min-h-[400px]">
                {/* Column header */}
                <div
                  className={`border-t-[3px] ${pipelineBorderColors[status]} bg-white border border-gray-200 rounded-t-lg px-4 py-3 flex items-center justify-between shadow-sm`}
                >
                  <span className="text-sm font-medium text-gray-700">
                    {statusLabels[status]}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pipelineCountColors[status]}`}
                  >
                    {contacts.length}
                  </span>
                </div>

                {/* Cards container */}
                <div className="flex-1 bg-gray-50 border border-t-0 border-gray-200 rounded-b-lg p-2 space-y-2 overflow-y-auto max-h-[600px]">
                  {pipelineLoading ? (
                    [...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="bg-white border border-gray-200 rounded-lg p-3 animate-pulse space-y-2"
                      >
                        <div className="h-4 bg-gray-100 rounded w-3/4" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                      </div>
                    ))
                  ) : contacts.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      Sin contactos
                    </p>
                  ) : (
                    contacts.map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => navigate(`/admin/contacts/${contact.id}`)}
                        className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#2FA4A9]/40 hover:-translate-y-0.5"
                      >
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2FA4A9]/20 to-[#2FA4A9]/5 text-[#2FA4A9] flex items-center justify-center text-[10px] font-semibold shrink-0">
                            {getInitials(contact.nombre)}
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {contact.nombre}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {contact.empresa}
                        </p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {contact.email}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-gray-200 text-gray-500 gap-1"
                          >
                            <Mail className="w-2.5 h-2.5" />
                            {contact.emailsSent}
                          </Badge>
                          {contact.leadScore > 0 && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0 rounded-full ${
                              contact.leadScore > 60 ? "bg-red-50 text-red-600" :
                              contact.leadScore > 30 ? "bg-amber-50 text-amber-600" :
                              "bg-gray-50 text-gray-500"
                            }`}>
                              {contact.leadScore}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmName("");
          }
        }}
      >
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este contacto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán todos los emails, notas, tareas, deals y actividad asociada a <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm text-gray-600 mb-1.5 block">
              Escribe <strong>{deleteTarget?.nombre}</strong> para confirmar:
            </label>
            <Input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={deleteTarget?.nombre || ""}
              className="border-gray-300"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteContactMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
                setDeleteConfirmName("");
              }}
              disabled={!deleteTarget || deleteConfirmName.trim().toLowerCase() !== deleteTarget.nombre.trim().toLowerCase() || deleteContactMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteContactMutation.isPending ? "Eliminando..." : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
