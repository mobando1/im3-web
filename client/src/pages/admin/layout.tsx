import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, CalendarDays, LogOut } from "lucide-react";

const navItems = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Contactos", path: "/admin/contacts", icon: Users },
  { label: "Calendario", path: "/admin/calendar", icon: CalendarDays },
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
                {item.label}
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
        <div className="p-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
