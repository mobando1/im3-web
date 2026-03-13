import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stats = {
  contacts: { total: number; lead: number; contacted: number; scheduled: number; converted: number };
  emails: { sentToday: number; sentWeek: number; totalSent: number; openRate: number };
  abandonedLeads: number;
  newsletterSubscribers: number;
};

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/admin/stats"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[hsl(var(--paper))]">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] animate-pulse">
              <CardContent className="p-6 h-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Total Contactos", value: stats.contacts.total, color: "text-[hsl(var(--paper))]" },
    { label: "Leads", value: stats.contacts.lead, color: "text-blue-400" },
    { label: "Contactados", value: stats.contacts.contacted, color: "text-yellow-400" },
    { label: "Convertidos", value: stats.contacts.converted, color: "text-green-400" },
    { label: "Emails Hoy", value: stats.emails.sentToday, color: "text-[hsl(var(--teal))]" },
    { label: "Emails Semana", value: stats.emails.sentWeek, color: "text-[hsl(var(--teal))]" },
    { label: "Tasa Apertura", value: `${stats.emails.openRate}%`, color: "text-purple-400" },
    { label: "Newsletter", value: stats.newsletterSubscribers, color: "text-[hsl(var(--paper-dark))]" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[hsl(var(--paper))]">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-[hsl(var(--paper-dark))] uppercase tracking-wider">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline summary */}
      <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-[hsl(var(--paper-dark))] uppercase tracking-wider">
            Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {[
              { label: "Lead", count: stats.contacts.lead, color: "bg-blue-500" },
              { label: "Contactado", count: stats.contacts.contacted, color: "bg-yellow-500" },
              { label: "Agendado", count: stats.contacts.scheduled, color: "bg-orange-500" },
              { label: "Convertido", count: stats.contacts.converted, color: "bg-green-500" },
            ].map((stage) => {
              const width = stats.contacts.total > 0
                ? Math.max(5, (stage.count / stats.contacts.total) * 100)
                : 25;
              return (
                <div key={stage.label} className="flex-1" style={{ flex: width }}>
                  <div className={`${stage.color} rounded-md h-8 flex items-center justify-center`}>
                    <span className="text-xs font-medium text-white">
                      {stage.count}
                    </span>
                  </div>
                  <p className="text-xs text-[hsl(var(--paper-dark))] mt-1 text-center">{stage.label}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {stats.abandonedLeads > 0 && (
        <Card className="bg-[hsl(var(--coal))] border-yellow-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="text-yellow-400 text-lg">!</span>
            <p className="text-sm text-[hsl(var(--paper-dark))]">
              <span className="text-yellow-400 font-medium">{stats.abandonedLeads}</span> leads abandonados sin email de rescate
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
