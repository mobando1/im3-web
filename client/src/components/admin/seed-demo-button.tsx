import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Database, Sparkles, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Control de datos de ejemplo para demos. Cargar/Limpiar es idempotente y SEGURO:
// el endpoint inserta directo en la DB (no manda emails/WhatsApp, no abre PRs, no
// toca datos reales — solo filas marcadas "Ejemplo"). Ver POST /api/admin/seed-demo.
export function SeedDemoButton({
  label = "Datos de ejemplo",
  variant = "outline",
  size = "sm",
}: {
  label?: string;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const seed = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/seed-demo")).json(),
    onSuccess: (d: { contacts: number; deals: number }) => {
      qc.invalidateQueries();
      toast({ title: "Datos de ejemplo cargados", description: `${d.contacts} contactos · ${d.deals} deals` });
      setOpen(false);
    },
    onError: () => toast({ title: "Error cargando ejemplos", variant: "destructive" }),
  });

  const clear = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/seed-demo/clear")).json(),
    onSuccess: (d: { removed: number }) => {
      qc.invalidateQueries();
      toast({ title: "Ejemplos eliminados", description: `${d.removed} contactos` });
      setOpen(false);
    },
    onError: () => toast({ title: "Error limpiando ejemplos", variant: "destructive" }),
  });

  const busy = seed.isPending || clear.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          <Database className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Datos de ejemplo</DialogTitle>
          <DialogDescription>
            Llena el CRM con contactos, deals, actividad y tareas LATAM realistas para demostraciones.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-surface p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <span>
            Seguro: <strong className="text-foreground">no</strong> envía emails ni WhatsApp,{" "}
            <strong className="text-foreground">no</strong> abre PRs y{" "}
            <strong className="text-foreground">no</strong> toca tus datos reales. Solo crea o borra filas marcadas como “Ejemplo”. Es idempotente.
          </span>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 gap-2" disabled={busy} onClick={() => seed.mutate()}>
            {seed.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Cargar ejemplos
          </Button>
          <Button variant="outline" className="gap-2" disabled={busy} onClick={() => clear.mutate()}>
            {clear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Limpiar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
