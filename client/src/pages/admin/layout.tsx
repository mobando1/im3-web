import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, LogOut } from "lucide-react";

const navItems = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Contactos", path: "/admin/contacts", icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "AD";

  return (
    <div className="min-h-screen bg-[hsl(var(--ink))] flex">
      {/* Sidebar */}
      <aside className="w-60 bg-[hsl(var(--coal))] border-r border-[hsl(var(--coal-light))] flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-[hsl(var(--coal-light))]">
          <div className="flex items-center gap-3">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-7" />
            <span className="text-xs font-medium tracking-widest uppercase text-[hsl(var(--paper-dark))]">
              CRM
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location === item.path ||
              (item.path !== "/admin" && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "border-l-2 border-[hsl(var(--teal))] bg-[hsl(var(--teal))]/10 text-[hsl(var(--teal))]"
                    : "border-l-2 border-transparent text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))] hover:bg-[hsl(var(--ink))]/50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-[hsl(var(--coal-light))]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[hsl(var(--teal))] flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-[hsl(var(--ink))]">
                {initials}
              </span>
            </div>
            <span className="text-sm text-[hsl(var(--paper))] truncate flex-1">
              {user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-[hsl(var(--paper-dark))] hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Cerrar sesion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
