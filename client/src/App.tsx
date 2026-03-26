import { lazy, Suspense, Component, type ReactNode } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-gray-600 text-lg">Algo salió mal al cargar la página.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#2FA4A9] text-white rounded-lg hover:bg-[#238b8f] transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="h-8 w-8 border-4 border-gray-200 border-t-[#2FA4A9] rounded-full animate-spin" />
    </div>
  );
}

const Home = lazy(() => import("@/pages/home"));
const Booking = lazy(() => import("@/pages/booking"));
const Confirmed = lazy(() => import("@/pages/confirmed"));
const Reschedule = lazy(() => import("@/pages/reschedule"));
const AdminLogin = lazy(() => import("@/pages/admin/login"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminContacts = lazy(() => import("@/pages/admin/contacts"));
const AdminContactDetail = lazy(() => import("@/pages/admin/contact-detail"));
const AdminCalendar = lazy(() => import("@/pages/admin/calendar"));
const AdminTasks = lazy(() => import("@/pages/admin/tasks"));
const AdminTemplates = lazy(() => import("@/pages/admin/templates"));
const AdminPipeline = lazy(() => import("@/pages/admin/pipeline"));
const AdminProjects = lazy(() => import("@/pages/admin/projects"));
const AdminProjectDetail = lazy(() => import("@/pages/admin/project-detail"));
const AdminSessions = lazy(() => import("@/pages/admin/sessions"));
const AdminBlog = lazy(() => import("@/pages/admin/blog"));
const AdminBlogEditor = lazy(() => import("@/pages/admin/blog-editor"));
const Blog = lazy(() => import("@/pages/blog"));
const BlogPost = lazy(() => import("@/pages/blog-post"));
const Portal = lazy(() => import("@/pages/portal"));
const AdminLayout = lazy(() => import("@/pages/admin/layout"));

function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
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
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/booking" component={Booking} />
        <Route path="/confirmed" component={Confirmed} />
        <Route path="/reschedule/:contactId" component={Reschedule} />
        <Route path="/portal/:token" component={Portal} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/blog" component={Blog} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/blog/new">
          <ProtectedAdmin>
            <AdminBlogEditor />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin/blog/:id/edit">
          {() => (
            <ProtectedAdmin>
              <AdminBlogEditor />
            </ProtectedAdmin>
          )}
        </Route>
        <Route path="/admin/blog">
          <ProtectedAdmin>
            <AdminBlog />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin/contacts/:id">
          {(params) => (
            <ProtectedAdmin>
              <AdminContactDetail />
            </ProtectedAdmin>
          )}
        </Route>
        <Route path="/admin/tasks">
          <ProtectedAdmin>
            <AdminTasks />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin/calendar">
          <ProtectedAdmin>
            <AdminCalendar />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin/sessions">
          <ProtectedAdmin>
            <AdminSessions />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin/projects/:id">
          {() => (
            <ProtectedAdmin>
              <AdminProjectDetail />
            </ProtectedAdmin>
          )}
        </Route>
        <Route path="/admin/projects">
          <ProtectedAdmin>
            <AdminProjects />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin/pipeline">
          <ProtectedAdmin>
            <AdminPipeline />
          </ProtectedAdmin>
        </Route>
        <Route path="/admin/templates">
          <ProtectedAdmin>
            <AdminTemplates />
          </ProtectedAdmin>
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
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
