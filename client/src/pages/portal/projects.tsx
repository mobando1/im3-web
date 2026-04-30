import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { LogOut, ArrowRight } from "lucide-react";

type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  estimatedEndDate: string | null;
  healthStatus: string | null;
};

export default function PortalProjects() {
  const { user, isAuthenticated, isLoading, logout } = useClientAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/portal/login");
  }, [isLoading, isAuthenticated, navigate]);

  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectListItem[]>({
    queryKey: ["/api/portal/projects"],
    enabled: isAuthenticated,
  });

  // Auto-redirect if exactly 1 project
  useEffect(() => {
    if (projects && projects.length === 1) {
      navigate(`/portal/projects/${projects[0].id}`);
    }
  }, [projects, navigate]);

  if (isLoading || projectsLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-[#2FA4A9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-8" />
            <div>
              <h1 className="text-sm font-bold text-gray-900">Portal del cliente</h1>
              <p className="text-xs text-gray-500">{user?.name || user?.email}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => logout().then(() => navigate("/portal/login"))}>
            <LogOut className="w-4 h-4 mr-1.5" /> Salir
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Tus proyectos</h2>

        {projects && projects.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-gray-500">No tienes proyectos asignados todavía.</p>
            <p className="text-gray-400 text-sm mt-2">Contacta al equipo de IM3 si crees que esto es un error.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects?.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/portal/projects/${p.id}`)}
                className="text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-[#2FA4A9] hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 group-hover:text-[#2FA4A9] transition-colors">{p.name}</h3>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#2FA4A9] transition-colors" />
                </div>
                {p.description && <p className="text-sm text-gray-500 line-clamp-2">{p.description}</p>}
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.status}</span>
                  {p.healthStatus && (
                    <span className={`px-2 py-0.5 rounded-full ${
                      p.healthStatus === "on_track" ? "bg-emerald-50 text-emerald-700" :
                      p.healthStatus === "at_risk" ? "bg-amber-50 text-amber-700" :
                      "bg-red-50 text-red-700"
                    }`}>
                      {p.healthStatus === "on_track" ? "En curso" : p.healthStatus === "at_risk" ? "En riesgo" : "Bloqueado"}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
