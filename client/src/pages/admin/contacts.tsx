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
  lead: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  contacted: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  scheduled: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  converted: "bg-green-500/15 text-green-400 border-green-500/30",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  contacted: "Contactado",
  scheduled: "Agendado",
  converted: "Convertido",
};

const pipelineBorderColors: Record<string, string> = {
  lead: "border-t-blue-500",
  contacted: "border-t-yellow-500",
  scheduled: "border-t-orange-500",
  converted: "border-t-green-500",
};

const pipelineCountColors: Record<string, string> = {
  lead: "bg-blue-500/15 text-blue-400",
  contacted: "bg-yellow-500/15 text-yellow-400",
  scheduled: "bg-orange-500/15 text-orange-400",
  converted: "bg-green-500/15 text-green-400",
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
        <h2 className="text-2xl font-bold text-[hsl(var(--paper))]">Contactos</h2>
        <div className="flex rounded-lg border border-[hsl(var(--coal-light))] overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className={`rounded-none gap-2 ${
              view === "list"
                ? "bg-[hsl(var(--teal))]/15 text-[hsl(var(--teal))]"
                : "text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))]"
            }`}
          >
            <List className="w-4 h-4" />
            Lista
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("pipeline")}
            className={`rounded-none gap-2 border-l border-[hsl(var(--coal-light))] ${
              view === "pipeline"
                ? "bg-[hsl(var(--teal))]/15 text-[hsl(var(--teal))]"
                : "text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))]"
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
          className="max-w-sm bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] text-[hsl(var(--paper))] placeholder:text-[hsl(var(--paper-dark))]"
        />
        {view === "list" && (
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40 bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] text-[hsl(var(--paper))]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
              <SelectItem value="all" className="text-[hsl(var(--paper))]">Todos</SelectItem>
              <SelectItem value="lead" className="text-[hsl(var(--paper))]">Lead</SelectItem>
              <SelectItem value="contacted" className="text-[hsl(var(--paper))]">Contactado</SelectItem>
              <SelectItem value="scheduled" className="text-[hsl(var(--paper))]">Agendado</SelectItem>
              <SelectItem value="converted" className="text-[hsl(var(--paper))]">Convertido</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* List View */}
      {view === "list" && (
        <>
          <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--coal-light))] hover:bg-transparent">
                    <TableHead className="text-[hsl(var(--paper-dark))]">Nombre</TableHead>
                    <TableHead className="text-[hsl(var(--paper-dark))]">Empresa</TableHead>
                    <TableHead className="text-[hsl(var(--paper-dark))]">Email</TableHead>
                    <TableHead className="text-[hsl(var(--paper-dark))]">Status</TableHead>
                    <TableHead className="text-[hsl(var(--paper-dark))]">Emails</TableHead>
                    <TableHead className="text-[hsl(var(--paper-dark))]">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="border-[hsl(var(--coal-light))]">
                        {[...Array(6)].map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-[hsl(var(--ink))] rounded animate-pulse w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.contacts.length === 0 ? (
                    <TableRow className="border-[hsl(var(--coal-light))]">
                      <TableCell
                        colSpan={6}
                        className="text-center text-[hsl(var(--paper-dark))] py-8"
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
                          className="border-[hsl(var(--coal-light))] cursor-pointer hover:bg-[hsl(var(--ink))]/50"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[hsl(var(--teal))]/15 text-[hsl(var(--teal))] flex items-center justify-center text-xs font-medium shrink-0">
                                {getInitials(contact.nombre)}
                              </div>
                              <span className="text-[hsl(var(--paper))] font-medium">
                                {contact.nombre}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[hsl(var(--paper-dark))]">
                            {contact.empresa}
                          </TableCell>
                          <TableCell className="text-[hsl(var(--paper-dark))] text-sm">
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
                              <span className="text-[hsl(var(--paper))] text-sm font-medium">
                                {contact.emailsOpened}/{contact.emailsSent}
                              </span>
                              <div className="w-12 h-1.5 bg-[hsl(var(--ink))] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[hsl(var(--teal))] rounded-full transition-all"
                                  style={{ width: `${ratio}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-[hsl(var(--paper-dark))] text-sm">
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
              <p className="text-sm text-[hsl(var(--paper-dark))]">
                Mostrando {paginationStart}-{paginationEnd} de {data.pagination.total} contactos
              </p>
              {data.pagination.totalPages > 1 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="border-[hsl(var(--coal-light))] text-[hsl(var(--paper-dark))]"
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-[hsl(var(--paper-dark))] flex items-center px-2">
                    {page} / {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="border-[hsl(var(--coal-light))] text-[hsl(var(--paper-dark))]"
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
                  className={`border-t-2 ${pipelineBorderColors[status]} bg-[hsl(var(--coal))] border border-[hsl(var(--coal-light))] rounded-t-lg px-4 py-3 flex items-center justify-between`}
                >
                  <span className="text-sm font-medium text-[hsl(var(--paper))]">
                    {statusLabels[status]}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${pipelineCountColors[status]}`}
                  >
                    {contacts.length}
                  </span>
                </div>

                {/* Cards container */}
                <div className="flex-1 bg-[hsl(var(--ink))]/30 border border-t-0 border-[hsl(var(--coal-light))] rounded-b-lg p-2 space-y-2 overflow-y-auto max-h-[600px]">
                  {pipelineLoading ? (
                    [...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="bg-[hsl(var(--ink))] rounded-lg p-3 animate-pulse space-y-2"
                      >
                        <div className="h-4 bg-[hsl(var(--coal))] rounded w-3/4" />
                        <div className="h-3 bg-[hsl(var(--coal))] rounded w-1/2" />
                      </div>
                    ))
                  ) : contacts.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--paper-dark))] text-center py-4">
                      Sin contactos
                    </p>
                  ) : (
                    contacts.map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => navigate(`/admin/contacts/${contact.id}`)}
                        className="bg-[hsl(var(--ink))] border border-[hsl(var(--coal-light))] rounded-lg p-3 cursor-pointer transition-colors hover:border-[hsl(var(--teal))]/30"
                      >
                        <p className="text-sm font-medium text-[hsl(var(--paper))] truncate">
                          {contact.nombre}
                        </p>
                        <p className="text-xs text-[hsl(var(--paper-dark))] truncate mt-0.5">
                          {contact.empresa}
                        </p>
                        <p className="text-xs text-[hsl(var(--paper-dark))] truncate mt-0.5">
                          {contact.email}
                        </p>
                        <div className="mt-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-[hsl(var(--coal-light))] text-[hsl(var(--paper-dark))] gap-1"
                          >
                            <Mail className="w-3 h-3" />
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
