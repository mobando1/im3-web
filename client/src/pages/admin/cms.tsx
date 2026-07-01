import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Globe, Pencil, ExternalLink, UserPlus } from "lucide-react";

type CmsPageSummary = {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string | null;
};

type CmsSiteRow = {
  id: string;
  domain: string;
  name: string;
  status: string;
  accessToken: string;
  pages: CmsPageSummary[];
};

export default function AdminCms() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: sites, isLoading } = useQuery<CmsSiteRow[]>({
    queryKey: ["/api/admin/cms/sites"],
  });

  const [inviteSite, setInviteSite] = useState<CmsSiteRow | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const inviteMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/cms/sites/${inviteSite!.id}/invite`, { email: inviteEmail.trim() });
      return res.json();
    },
    onSuccess: (r: { url: string }) => {
      setInviteUrl(r.url);
      toast({ title: "Invitación creada", description: "Comparte el enlace con el cliente." });
    },
    onError: (e: any) => toast({ title: "No se pudo invitar", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Sitios web</h1>
          <p className="text-sm text-muted-foreground">
            Edita el contenido, las imágenes y el SEO de tus sitios. Nada sale en vivo hasta que publicas.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !sites || sites.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aún no hay sitios configurados.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sites.map((site) => (
            <Card key={site.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {site.name}
                    <Badge variant={site.status === "active" ? "default" : "secondary"}>{site.status}</Badge>
                  </CardTitle>
                  <a
                    href={`https://${site.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                  >
                    {site.domain} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => { setInviteSite(site); setInviteEmail(""); setInviteUrl(""); }}
                >
                  <UserPlus className="w-4 h-4 mr-1" /> Invitar cliente
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {site.pages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este sitio no tiene páginas.</p>
                ) : (
                  site.pages.map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{page.title}</span>
                          <Badge variant={page.status === "published" ? "default" : "secondary"} className="shrink-0">
                            {page.status === "published" ? "Publicado" : "Borrador"}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          /{page.slug} {page.publishedAt ? `· publicado ${new Date(page.publishedAt).toLocaleDateString("es-CO")}` : ""}
                        </span>
                      </div>
                      <Button size="sm" onClick={() => navigate(`/admin/cms/${page.id}`)}>
                        <Pencil className="w-4 h-4 mr-1" /> Editar
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!inviteSite} onOpenChange={(o) => { if (!o) setInviteSite(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Invitar cliente a editar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Genera un enlace mágico para que el cliente edite <strong>{inviteSite?.name}</strong> sin acceso al CRM.
              El sitio debe estar vinculado a un proyecto de cliente.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Email del cliente</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="cliente@empresa.com" />
            </div>
            {inviteUrl ? (
              <div className="space-y-1">
                <Label className="text-xs">Enlace de acceso (cópialo y compártelo)</Label>
                <Input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteSite(null)}>Cerrar</Button>
            <Button onClick={() => inviteMut.mutate()} disabled={!inviteEmail.trim() || inviteMut.isPending}>
              {inviteMut.isPending ? "Generando…" : "Generar enlace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
