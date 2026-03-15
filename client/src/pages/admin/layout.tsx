import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LayoutDashboard, Users, CalendarDays, CheckSquare, LogOut, Bell, Search, Briefcase, FileText, BookOpen, Columns3 } from "lucide-react";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

const navItems = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Contactos", path: "/admin/contacts", icon: Users },
  { label: "Pipeline", path: "/admin/pipeline", icon: Columns3 },
  { label: "Blog", path: "/admin/blog", icon: BookOpen },
  { label: "Tareas", path: "/admin/tasks", icon: CheckSquare, showBadge: true },
  { label: "Calendario", path: "/admin/calendar", icon: CalendarDays },
  { label: "Plantillas", path: "/admin/templates", icon: FileText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();

  const queryClient = useQueryClient();
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Close on outside click
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

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "AD";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-7" />
            <span className="text-xs font-semibold tracking-widest uppercase text-gray-400">
              CRM
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location === item.path ||
              (item.path !== "/admin" && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#2FA4A9]/10 text-[#2FA4A9]"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-[#2FA4A9]" : ""}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {(item as any).showBadge && pendingTaskCount > 0 && (
                  <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingTaskCount > 9 ? "9+" : pendingTaskCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#2FA4A9] to-[#238b8f] flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">
                {initials}
              </span>
            </div>
            <span className="text-sm text-gray-700 font-medium truncate flex-1">
              {user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Cerrar sesion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar with notifications */}
        <div className="flex items-center justify-end px-8 pt-4 pb-0 gap-1">
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Buscar (⌘K)"
          >
            <Search className="w-5 h-5" />
          </button>
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Bell className="w-5 h-5" />
              {(notifData?.unreadCount || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 min-w-[18px] h-[18px] flex items-center justify-center">
                  {notifData!.unreadCount > 9 ? "9+" : notifData!.unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">Notificaciones</p>
                  {(notifData?.unreadCount || 0) > 0 && (
                    <button onClick={() => markAllReadMutation.mutate()} className="text-xs text-[#2FA4A9] hover:underline">
                      Marcar todas leidas
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {(notifData?.notifications || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Sin notificaciones</p>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {(notifData?.notifications || []).slice(0, 15).map((n: any) => (
                        <li
                          key={n.id}
                          className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${!n.isRead ? "bg-blue-50/50" : ""}`}
                          onClick={() => {
                            if (!n.isRead) markReadMutation.mutate(n.id);
                            if (n.contactId) navigate(`/admin/contacts/${n.contactId}`);
                            setShowNotifications(false);
                          }}
                        >
                          <p className={`text-sm ${!n.isRead ? "font-medium text-gray-900" : "text-gray-600"}`}>{n.title}</p>
                          {n.description && <p className="text-xs text-gray-400 mt-0.5">{n.description}</p>}
                          <p className="text-xs text-gray-300 mt-1">{new Date(n.createdAt).toLocaleDateString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-8 pb-8 max-w-7xl">{children}</div>
        <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
          <CommandInput placeholder="Buscar contactos, deals, tareas..." value={searchQuery} onValueChange={setSearchQuery} />
          <CommandList>
            <CommandEmpty>No se encontraron resultados.</CommandEmpty>
            {searchResults?.contacts && searchResults.contacts.length > 0 && (
              <CommandGroup heading="Contactos">
                {searchResults.contacts.map((c) => (
                  <CommandItem key={c.id} onSelect={() => { navigate(`/admin/contacts/${c.id}`); setSearchOpen(false); setSearchQuery(""); }}>
                    <Users className="mr-2 h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">{c.nombre}</p>
                      <p className="text-xs text-gray-400">{c.empresa} — {c.email}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {searchResults?.deals && searchResults.deals.length > 0 && (
              <CommandGroup heading="Deals">
                {searchResults.deals.map((d) => (
                  <CommandItem key={d.id} onSelect={() => { navigate(`/admin/contacts/${d.contactId}`); setSearchOpen(false); setSearchQuery(""); }}>
                    <Briefcase className="mr-2 h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-gray-400">{d.contactName}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {searchResults?.tasks && searchResults.tasks.length > 0 && (
              <CommandGroup heading="Tareas">
                {searchResults.tasks.map((t) => (
                  <CommandItem key={t.id} onSelect={() => { if (t.contactId) navigate(`/admin/contacts/${t.contactId}`); setSearchOpen(false); setSearchQuery(""); }}>
                    <CheckSquare className="mr-2 h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">{t.title}</p>
                      {t.contactName && <p className="text-xs text-gray-400">{t.contactName}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </CommandDialog>
      </main>
    </div>
  );
}
