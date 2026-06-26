import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useAdminTheme } from "@/hooks/useAdminTheme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { motion, MotionConfig } from "framer-motion";
import { pageVariants } from "@/lib/motion";
import { LayoutDashboard, Users, CalendarDays, CheckSquare, LogOut, Bell, Search, Briefcase, FileText, BookOpen, Columns3, FolderKanban, Mic, FileSignature, ClipboardCheck, Activity, Wrench, Layers, FileCheck, Newspaper, Stethoscope, Settings, KeyRound, Moon, Sun, Menu } from "lucide-react";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type NavItem = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  showBadge?: boolean;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Inicio",
    items: [
      { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
      { label: "Daily Brief", path: "/admin/daily-brief", icon: Newspaper },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Contactos", path: "/admin/contacts", icon: Users },
      { label: "Pipeline", path: "/admin/pipeline", icon: Columns3 },
      { label: "Calendario", path: "/admin/calendar", icon: CalendarDays },
      { label: "Tareas", path: "/admin/tasks", icon: CheckSquare, showBadge: true },
    ],
  },
  {
    label: "Entregables",
    items: [
      { label: "Proyectos", path: "/admin/projects", icon: FolderKanban },
      { label: "Propuestas", path: "/admin/proposals", icon: FileSignature },
      { label: "Contratos", path: "/admin/contracts", icon: FileCheck },
      { label: "Auditorías", path: "/admin/auditorias", icon: ClipboardCheck },
      { label: "Blog", path: "/admin/blog", icon: BookOpen },
    ],
  },
  {
    label: "Operación",
    items: [
      { label: "Acta", path: "/admin/sessions", icon: Mic },
      { label: "Stack & Costos", path: "/admin/stack-catalog", icon: Layers },
      { label: "Plantillas", path: "/admin/templates", icon: FileText },
      { label: "Herramientas", path: "/admin/tools", icon: Wrench },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Sistema", path: "/admin/agents", icon: Activity },
      { label: "Ingeniero IA", path: "/admin/engineering", icon: Stethoscope },
      { label: "Bóveda", path: "/admin/vault", icon: KeyRound },
      { label: "Configuración", path: "/admin/settings", icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { isDark, toggle: toggleTheme } = useAdminTheme();

  const queryClient = useQueryClient();
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: notifData } = useQuery<{ notifications: any[]; unreadCount: number }>({
    queryKey: ["/api/admin/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/admin/notifications/${id}/read`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/notifications/mark-all-read");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] }),
  });

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data: searchResults } = useQuery<{
    contacts: Array<{ id: string; nombre: string; empresa: string; email: string }>;
    deals: Array<{ id: string; title: string; contactId: string; contactName: string }>;
    tasks: Array<{ id: string; title: string; contactId: string; contactName: string }>;
  }>({
    queryKey: ["/api/admin/search", searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searchOpen && searchQuery.length >= 2,
  });

  // Close notifications on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: tasksList } = useQuery<any[]>({
    queryKey: ["/api/admin/tasks?status=pending"],
  });
  const pendingTaskCount = tasksList?.length || 0;

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : "AD";

  const handleNav = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  const runCommand = (fn: () => void) => {
    setSearchOpen(false);
    setSearchQuery("");
    fn();
  };

  // Contenido del sidebar — reutilizado en el aside estático (desktop) y el
  // drawer (móvil) para no duplicar markup.
  const sidebar = (
    <div className="flex h-full flex-col bg-card">
      <div className="h-16 px-5 flex items-center border-b border-border">
        <div className="flex items-center gap-3">
          <img src="/assets/im3-logo.png" alt="IM3" className="h-7 dark:brightness-0 dark:invert" />
          <span className="mono-tag text-muted-foreground">CRM</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="mono-tag text-muted-foreground/70 px-3 pb-1">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                location === item.path ||
                (item.path !== "/admin" && location.startsWith(item.path));

              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={`group relative w-full flex items-center gap-3 py-2 px-3 rounded-[var(--radius-control)] text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-accent-active text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" />
                  )}
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                    strokeWidth={1.5}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.showBadge && pendingTaskCount > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums bg-destructive text-destructive-foreground rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                      {pendingTaskCount > 9 ? "9+" : pendingTaskCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-[hsl(182_56%_34%)] flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary-foreground">{initials}</span>
          </div>
          <span className="text-sm text-foreground font-medium truncate flex-1">{user?.username}</span>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-[var(--radius-control)] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar estático (desktop) */}
        <aside className="hidden lg:flex w-60 shrink-0 border-r border-border">{sidebar}</aside>

        {/* Sidebar drawer (móvil) */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-60 p-0 border-border [&>button]:hidden">
            <SheetTitle className="sr-only">Navegación</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-30 h-16 flex items-center justify-between gap-2 px-4 sm:px-8 bg-background/80 backdrop-blur-md border-b border-border">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-[var(--radius-control)] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              title="Menú"
            >
              <Menu className="w-5 h-5" strokeWidth={1.5} />
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-[var(--radius-control)] border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                title="Buscar (⌘K)"
              >
                <Search className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-sm hidden sm:inline">Buscar…</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ⌘K
                </kbd>
              </button>

              <button
                onClick={toggleTheme}
                className="p-2 rounded-[var(--radius-control)] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                title={isDark ? "Tema claro" : "Tema oscuro"}
              >
                {isDark ? <Sun className="w-5 h-5" strokeWidth={1.5} /> : <Moon className="w-5 h-5" strokeWidth={1.5} />}
              </button>

              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-[var(--radius-control)] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  <Bell className="w-5 h-5" strokeWidth={1.5} />
                  {(notifData?.unreadCount || 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold tabular-nums rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                      {notifData!.unreadCount > 9 ? "9+" : notifData!.unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-popover text-popover-foreground rounded-[var(--radius-card)] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.55)] border border-border z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <p className="text-sm font-semibold text-foreground">Notificaciones</p>
                      {(notifData?.unreadCount || 0) > 0 && (
                        <button onClick={() => markAllReadMutation.mutate()} className="text-xs text-primary hover:underline">
                          Marcar todas leídas
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {(notifData?.notifications || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Sin notificaciones</p>
                      ) : (
                        <ul className="divide-y divide-border">
                          {(notifData?.notifications || []).slice(0, 15).map((n: any) => (
                            <li
                              key={n.id}
                              className={`px-4 py-3 hover:bg-surface-hover cursor-pointer transition-colors ${!n.isRead ? "bg-accent-active/40" : ""}`}
                              onClick={() => {
                                if (!n.isRead) markReadMutation.mutate(n.id);
                                if (n.contactId) navigate(`/admin/contacts/${n.contactId}`);
                                setShowNotifications(false);
                              }}
                            >
                              <p className={`text-sm ${!n.isRead ? "font-medium text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                              {n.description && <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>}
                              <p className="text-xs text-muted-foreground/70 mt-1 tabular-nums">{new Date(n.createdAt).toLocaleDateString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <motion.div
            key={location}
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            className="px-4 py-6 sm:px-8 sm:py-8 max-w-7xl"
          >
            {children}
          </motion.div>

          <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
            <CommandInput placeholder="Buscar o ejecutar una acción..." value={searchQuery} onValueChange={setSearchQuery} />
            <CommandList>
              <CommandEmpty>No se encontraron resultados.</CommandEmpty>
              <CommandGroup heading="Acciones rápidas">
                <CommandItem onSelect={() => runCommand(() => navigate("/admin/contacts"))}>
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" /> Crear contacto
                </CommandItem>
                <CommandItem onSelect={() => runCommand(() => navigate("/admin/pipeline"))}>
                  <Columns3 className="mr-2 h-4 w-4 text-muted-foreground" /> Crear deal
                </CommandItem>
                <CommandItem onSelect={() => runCommand(() => navigate("/admin/proposals"))}>
                  <FileSignature className="mr-2 h-4 w-4 text-muted-foreground" /> Generar propuesta
                </CommandItem>
                <CommandItem onSelect={() => runCommand(toggleTheme)}>
                  {isDark ? <Sun className="mr-2 h-4 w-4 text-muted-foreground" /> : <Moon className="mr-2 h-4 w-4 text-muted-foreground" />}
                  Cambiar a tema {isDark ? "claro" : "oscuro"}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Ir a">
                {navGroups.flatMap((g) => g.items).map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem key={item.path} onSelect={() => runCommand(() => navigate(item.path))}>
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" /> {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {searchResults?.contacts && searchResults.contacts.length > 0 && (
                <CommandGroup heading="Contactos">
                  {searchResults.contacts.map((c) => (
                    <CommandItem key={c.id} onSelect={() => { navigate(`/admin/contacts/${c.id}`); setSearchOpen(false); setSearchQuery(""); }}>
                      <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{c.nombre}</p>
                        <p className="text-xs text-muted-foreground">{c.empresa} — {c.email}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {searchResults?.deals && searchResults.deals.length > 0 && (
                <CommandGroup heading="Deals">
                  {searchResults.deals.map((d) => (
                    <CommandItem key={d.id} onSelect={() => { navigate(`/admin/contacts/${d.contactId}`); setSearchOpen(false); setSearchQuery(""); }}>
                      <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground">{d.contactName}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {searchResults?.tasks && searchResults.tasks.length > 0 && (
                <CommandGroup heading="Tareas">
                  {searchResults.tasks.map((t) => (
                    <CommandItem key={t.id} onSelect={() => { if (t.contactId) navigate(`/admin/contacts/${t.contactId}`); setSearchOpen(false); setSearchQuery(""); }}>
                      <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{t.title}</p>
                        {t.contactName && <p className="text-xs text-muted-foreground">{t.contactName}</p>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </CommandDialog>
        </main>
      </div>
    </MotionConfig>
  );
}
