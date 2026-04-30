import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

type ClientUser = { id: string; email: string; name: string | null };

export function useClientAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<ClientUser | null>({
    queryKey: ["/api/portal/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/portal/auth/login", credentials);
      const data = await res.json();
      queryClient.setQueryData(["/api/portal/auth/me"], data);
      return data;
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/portal/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/portal/auth/me"], null);
      queryClient.removeQueries({ queryKey: ["/api/portal/projects"] });
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    loginError: loginMutation.error?.message,
    isLoggingIn: loginMutation.isPending,
  };
}
