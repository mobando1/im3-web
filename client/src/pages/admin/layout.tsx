import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Dashboard", path: "/admin", icon: "~" },
  { label: "Contactos", path: "/admin/contacts", icon: ">" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--ink))] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[hsl(var(--coal))] border-r border-[hsl(var(--coal-light))] flex flex-col">
        <div className="p-4 border-b border-[hsl(var(--coal-light))]">
          <h1 className="text-lg font-bold text-[hsl(var(--teal))]">IM3 Admin</h1>
          <p className="text-xs text-[hsl(var(--paper-dark))] mt-0.5">{user?.username}</p>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.path ||
              (item.path !== "/admin" && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-[hsl(var(--teal))]/15 text-[hsl(var(--teal))]"
                    : "text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))] hover:bg-[hsl(var(--ink))]/50"
                }`}
              >
                <span className="mr-2 font-mono">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[hsl(var(--coal-light))]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full text-[hsl(var(--paper-dark))] hover:text-red-400 hover:bg-red-400/10"
          >
            Cerrar sesion
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
