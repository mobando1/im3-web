import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoggingIn, loginError, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (isAuthenticated) {
    navigate("/admin");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ username, password });
      navigate("/admin");
    } catch {
      // Error handled by loginError
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--ink))] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[hsl(var(--paper))]">
            IM3 Admin
          </CardTitle>
          <p className="text-sm text-[hsl(var(--paper-dark))]">
            Ingresa tus credenciales
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-[hsl(var(--paper-dark))]">
                Usuario
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-[hsl(var(--ink))] border-[hsl(var(--coal-light))] text-[hsl(var(--paper))]"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[hsl(var(--paper-dark))]">
                Contrasena
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[hsl(var(--ink))] border-[hsl(var(--coal-light))] text-[hsl(var(--paper))]"
                autoComplete="current-password"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-400 text-sm">{loginError.replace(/^\d+:\s*/, "")}</p>
            )}
            <Button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-[hsl(var(--teal))] hover:bg-[hsl(var(--teal-dark))] text-white"
            >
              {isLoggingIn ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
