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

export default function Contacts() {
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
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[hsl(var(--paper))]">Contactos</h2>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar nombre, empresa o email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] text-[hsl(var(--paper))] placeholder:text-[hsl(var(--paper-dark))]"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
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
      </div>

      {/* Table */}
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
                  <TableCell colSpan={6} className="text-center text-[hsl(var(--paper-dark))] py-8">
                    No se encontraron contactos
                  </TableCell>
                </TableRow>
              ) : (
                data?.contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    onClick={() => navigate(`/admin/contacts/${contact.id}`)}
                    className="border-[hsl(var(--coal-light))] cursor-pointer hover:bg-[hsl(var(--ink))]/50"
                  >
                    <TableCell className="text-[hsl(var(--paper))] font-medium">
                      {contact.nombre}
                    </TableCell>
                    <TableCell className="text-[hsl(var(--paper-dark))]">
                      {contact.empresa}
                    </TableCell>
                    <TableCell className="text-[hsl(var(--paper-dark))] text-sm">
                      {contact.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[contact.status] || ""}>
                        {statusLabels[contact.status] || contact.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[hsl(var(--paper-dark))] text-sm">
                      {contact.emailsSent} enviados
                      {contact.emailsOpened > 0 && (
                        <span className="text-green-400 ml-1">({contact.emailsOpened} abiertos)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[hsl(var(--paper-dark))] text-sm">
                      {new Date(contact.createdAt).toLocaleDateString("es-CO")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[hsl(var(--paper-dark))]">
            {data.pagination.total} contactos total
          </p>
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
        </div>
      )}
    </div>
  );
}
