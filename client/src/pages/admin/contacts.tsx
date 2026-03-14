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
      </div>

      {/* List View */}
      {view === "list" && (
        <>
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 hover:bg-transparent">
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Nombre</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Empresa</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Email</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Score</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Status</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Emails</TableHead>
                    <TableHead className="text-gray-500 uppercase text-xs font-medium">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="border-gray-100">
                        {[...Array(7)].map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-gray-100 rounded animate-pulse w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.contacts.length === 0 ? (
                    <TableRow className="border-gray-100">
                      <TableCell
                        colSpan={7}
                        className="text-center text-gray-400 py-8"
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
                          className="border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                        >
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
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              contact.leadScore > 60 ? "bg-red-50 text-red-600" :
                              contact.leadScore > 30 ? "bg-amber-50 text-amber-600" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              {contact.leadScore}
                            </span>
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
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">
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
                        className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer transition-all hover:shadow-md hover:border-[#2FA4A9]/40"
                      >
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {contact.nombre}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
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
    </div>
  );
}
