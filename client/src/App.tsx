import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";

const Home = lazy(() => import("@/pages/home"));
const Booking = lazy(() => import("@/pages/booking"));
const Confirmed = lazy(() => import("@/pages/confirmed"));
const AdminLogin = lazy(() => import("@/pages/admin/login"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminContacts = lazy(() => import("@/pages/admin/contacts"));
const AdminContactDetail = lazy(() => import("@/pages/admin/contact-detail"));
const AdminLayout = lazy(() => import("@/pages/admin/layout"));

function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-[hsl(var(--ink))]" />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/admin/login" />;
  }

  return (
    <AdminLayout>
      {children}
    </AdminLayout>
  );
}

function Router() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/booking" component={Booking} />
        <Route path="/confirmed" component={Confirmed} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/contacts/:id">
          {(params) => (
            <ProtectedAdmin>
              <AdminContactDetail />
            </ProtectedAdmin>
          )}
        </Route>
        <Route path="/admin/contacts">
          <ProtectedAdmin>
            <AdminContacts />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin">
          <ProtectedAdmin>
            <AdminDashboard />
          </ProtectedAdmin>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
