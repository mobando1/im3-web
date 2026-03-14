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
    <div className="min-h-screen bg-[#0c1220] flex">
      {/* Sidebar */}
      <aside className="w-60 bg-[#111827] border-r border-[#1e293b] flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-7" />
            <span className="text-xs font-medium tracking-widest uppercase text-slate-400">
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
                    ? "border-l-2 border-[#2FA4A9] bg-[#2FA4A9]/10 text-[#2FA4A9]"
                    : "border-l-2 border-transparent text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-[#1e293b]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#2FA4A9] to-[#238b8f] flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">
                {initials}
              </span>
            </div>
            <span className="text-sm text-white truncate flex-1">
              {user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
