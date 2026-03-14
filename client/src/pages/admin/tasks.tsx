import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Calendar,
  User,
  AlertTriangle,
} from "lucide-react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  contactId: string | null;
  contactName: string | null;
  completedAt: string | null;
  createdAt: string;
};

const priorityColors: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};

const priorityLabels: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return `hace ${Math.abs(diffDays)} dias`;
  if (diffDays === -1) return "ayer";
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "manana";
  if (diffDays < 7) return `en ${diffDays} dias`;
  return d.toLocaleDateString("es-CO");
}

export default function TasksPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", dueDate: "", priority: "medium" });

  const queryParams = new URLSearchParams();
  if (filter === "pending") queryParams.set("status", "pending");
  if (filter === "completed") queryParams.set("status", "completed");
  if (filter === "overdue") queryParams.set("filter", "overdue");
  if (filter === "today") queryParams.set("filter", "today");
  if (filter === "week") queryParams.set("filter", "week");

  const { data: tasksList = [], isLoading } = useQuery<Task[]>({
    queryKey: [`/api/admin/tasks?${queryParams.toString()}`],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; dueDate: string; priority: string }) => {
      await apiRequest("POST", "/api/admin/tasks", {
        ...data,
        dueDate: data.dueDate || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      setNewTask({ title: "", description: "", dueDate: "", priority: "medium" });
      setShowForm(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/tasks/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
    },
  });

  const pendingTasks = tasksList.filter(t => t.status === "pending");
  const completedTasks = tasksList.filter(t => t.status === "completed");
  const overdueTasks = pendingTasks.filter(t => isOverdue(t.dueDate));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tareas</h2>
          <p className="text-sm text-gray-500 mt-1">
            {pendingTasks.length} pendientes
            {overdueTasks.length > 0 && (
              <span className="text-red-500"> ({overdueTasks.length} vencidas)</span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Nueva Tarea
        </Button>
      </div>

      {/* Create task form */}
      {showForm && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Input
                  placeholder="Titulo de la tarea..."
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="bg-white border-gray-200"
                />
              </div>
              <Input
                placeholder="Descripcion (opcional)"
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                className="bg-white border-gray-200"
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  className="bg-white border-gray-200 flex-1"
                />
                <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v })}>
                  <SelectTrigger className="w-28 bg-white border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="low">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => newTask.title.trim() && createMutation.mutate(newTask)}
                disabled={!newTask.title.trim() || createMutation.isPending}
                className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white"
              >
                {createMutation.isPending ? "Creando..." : "Crear"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)} className="border-gray-200">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "Todas" },
          { key: "pending", label: "Pendientes" },
          { key: "overdue", label: "Vencidas" },
          { key: "today", label: "Hoy" },
          { key: "week", label: "Esta semana" },
          { key: "completed", label: "Completadas" },
        ].map((f) => (
          <Button
            key={f.key}
            variant="outline"
            size="sm"
            onClick={() => setFilter(f.key)}
            className={`${
              filter === f.key
                ? "bg-[#2FA4A9]/10 text-[#2FA4A9] border-[#2FA4A9]/30"
                : "border-gray-200 text-gray-600 hover:text-gray-900"
            }`}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Tasks list */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : tasksList.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <CheckSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay tareas</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tasksList.map((task) => {
                const overdue = task.status === "pending" && isOverdue(task.dueDate);
                const isCompleted = task.status === "completed";

                return (
                  <li
                    key={task.id}
                    className={`flex items-start gap-3 px-5 py-3.5 group hover:bg-gray-50 transition-colors ${
                      isCompleted ? "opacity-60" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() =>
                        toggleMutation.mutate({
                          id: task.id,
                          status: isCompleted ? "pending" : "completed",
                        })
                      }
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-[#2FA4A9] transition-colors"
                    >
                      {isCompleted ? (
                        <CheckSquare className="w-5 h-5 text-[#2FA4A9]" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isCompleted ? "line-through text-gray-400" : "text-gray-900"}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {task.dueDate && (
                          <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-500" : "text-gray-400"}`}>
                            {overdue && <AlertTriangle className="w-3 h-3" />}
                            <Calendar className="w-3 h-3" />
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                        {task.contactName && (
                          <button
                            onClick={() => navigate(`/admin/contacts/${task.contactId}`)}
                            className="text-xs text-[#2FA4A9] hover:underline flex items-center gap-1"
                          >
                            <User className="w-3 h-3" />
                            {task.contactName}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Priority + Delete */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-[10px] ${priorityColors[task.priority] || ""}`}>
                        {priorityLabels[task.priority] || task.priority}
                      </Badge>
                      <button
                        onClick={() => deleteMutation.mutate(task.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
