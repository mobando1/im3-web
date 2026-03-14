import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { List, LayoutGrid, Mail } from "lucide-react";

type Contact = {
  id: string;
  nombre: string;
  empresa: string;
  email: string;
  status: string;
  createdAt: string;
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
  lead: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  contacted: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  scheduled: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  converted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
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
  lead: "bg-blue-500/15 text-blue-400",
  contacted: "bg-amber-500/15 text-amber-400",
  scheduled: "bg-orange-500/15 text-orange-400",
  converted: "bg-emerald-500/15 text-emerald-400",
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
  const [, navigate] = useLocation();

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (search) queryParams.set("search", search);

  const { data, isLoading } = useQuery<ContactsResponse>({
    queryKey: [`/api/admin/contacts?${queryParams.toString()}`],
    enabled: view === "list",
  });

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery<PipelineResponse>({
    queryKey: ["/api/admin/contacts/pipeline", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/contacts/pipeline?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch pipeline");
      return res.json();
    },
    enabled: view === "pipeline",
  });

  const paginationStart = data ? (data.pagination.page - 1) * data.pagination.limit + 1 : 0;
  const paginationEnd = data
    ? Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Contactos</h2>
        <div className="flex rounded-lg border border-[#1e293b] overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className={`rounded-none gap-2 ${
              view === "list"
                ? "bg-[#2FA4A9]/15 text-[#2FA4A9] border-[#2FA4A9]/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <List className="w-4 h-4" />
            Lista
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("pipeline")}
            className={`rounded-none gap-2 border-l border-[#1e293b] ${
              view === "pipeline"
                ? "bg-[#2FA4A9]/15 text-[#2FA4A9] border-[#2FA4A9]/30"
                : "text-slate-400 hover:text-white"
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
          className="max-w-sm bg-[#0c1220] border-[#1e293b] text-white placeholder:text-slate-500"
        />
        {view === "list" && (
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40 bg-[#0c1220] border-[#1e293b] text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#111827] border-[#1e293b]">
              <SelectItem value="all" className="text-white">Todos</SelectItem>
              <SelectItem value="lead" className="text-white">Lead</SelectItem>
              <SelectItem value="contacted" className="text-white">Contactado</SelectItem>
              <SelectItem value="scheduled" className="text-white">Agendado</SelectItem>
              <SelectItem value="converted" className="text-white">Convertido</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* List View */}
      {view === "list" && (
        <>
          <Card className="bg-[#111827]/80 border border-[#1e293b]">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e293b] hover:bg-transparent">
                    <TableHead className="text-slate-500 uppercase text-xs">Nombre</TableHead>
                    <TableHead className="text-slate-500 uppercase text-xs">Empresa</TableHead>
                    <TableHead className="text-slate-500 uppercase text-xs">Email</TableHead>
                    <TableHead className="text-slate-500 uppercase text-xs">Status</TableHead>
                    <TableHead className="text-slate-500 uppercase text-xs">Emails</TableHead>
                    <TableHead className="text-slate-500 uppercase text-xs">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="border-[#1e293b]">
                        {[...Array(6)].map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-[#1e293b] rounded animate-pulse w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.contacts.length === 0 ? (
                    <TableRow className="border-[#1e293b]">
                      <TableCell
                        colSpan={6}
                        className="text-center text-slate-500 py-8"
                      >
                        No se encontraron contactos
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
                          className="border-[#1e293b] cursor-pointer hover:bg-white/[0.03]"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2FA4A9]/20 to-[#2FA4A9]/5 text-[#2FA4A9] flex items-center justify-center text-xs font-semibold shrink-0">
                                {getInitials(contact.nombre)}
                              </div>
                              <span className="text-white font-medium">
                                {contact.nombre}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {contact.empresa}
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {contact.email}
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
                            <div className="flex items-center gap-2">
                              <span className="text-white text-sm font-medium">
                                {contact.emailsOpened}/{contact.emailsSent}
                              </span>
                              <div className="w-16 h-2 bg-[#1e293b] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#2FA4A9] rounded-full transition-all"
                                  style={{ width: `${ratio}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {new Date(contact.createdAt).toLocaleDateString("es-CO")}
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
              <p className="text-sm text-slate-400">
                Mostrando {paginationStart}-{paginationEnd} de {data.pagination.total} contactos
              </p>
              {data.pagination.totalPages > 1 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="border-[#1e293b] text-slate-400"
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-slate-400 flex items-center px-2">
                    {page} / {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="border-[#1e293b] text-slate-400"
                  >
                    Siguiente
                  </Button>
                </div>
              )}
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
                  className={`border-t-[3px] ${pipelineBorderColors[status]} bg-[#111827] border border-[#1e293b] rounded-t-lg px-4 py-3 flex items-center justify-between`}
                >
                  <span className="text-sm font-medium text-white">
                    {statusLabels[status]}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${pipelineCountColors[status]}`}
                  >
                    {contacts.length}
                  </span>
                </div>

                {/* Cards container */}
                <div className="flex-1 bg-[#0c1220]/50 border border-t-0 border-[#1e293b] rounded-b-lg p-2 space-y-2 overflow-y-auto max-h-[600px]">
                  {pipelineLoading ? (
                    [...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="bg-[#0c1220] border border-[#1e293b] rounded-lg p-3 animate-pulse space-y-2"
                      >
                        <div className="h-4 bg-[#1e293b] rounded w-3/4" />
                        <div className="h-3 bg-[#1e293b] rounded w-1/2" />
                      </div>
                    ))
                  ) : contacts.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">
                      Sin contactos
                    </p>
                  ) : (
                    contacts.map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => navigate(`/admin/contacts/${contact.id}`)}
                        className="bg-[#0c1220] border border-[#1e293b] rounded-lg p-3 cursor-pointer transition-colors hover:border-[#2FA4A9]/40"
                      >
                        <p className="text-sm font-medium text-white truncate">
                          {contact.nombre}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {contact.empresa}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {contact.email}
                        </p>
                        <div className="mt-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-[#1e293b] text-slate-500 gap-1"
                          >
                            <Mail className="w-2.5 h-2.5" />
                            {contact.emailsSent}
                          </Badge>
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
    </div>
  );
}
