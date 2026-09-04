"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Employee, Permission } from "./types";
import { ROLE_PERMISSIONS, homeForRole } from "./types";
import { loadAppData, mutateAppData } from "./client-data";
import { isStaticDemo, withBasePath } from "./paths";
import {
  hashPasswordBrowser,
  needsPasswordSetup,
  verifyStaffSecretBrowser,
} from "./auth-credentials";

const SESSION_KEY = "bhc-auth-user-id";

type LoginResult =
  | { ok: true; mustChangePassword?: boolean }
  | { ok: false; error: string };

type SessionCtx = {
  user: Employee | null;
  employees: Employee[];
  loading: boolean;
  authenticated: boolean;
  login: (loginName: string, password: string) => Promise<LoginResult>;
  setPassword: (currentPassword: string, newPassword: string) => Promise<LoginResult>;
  logout: () => void;
  can: (perm: Permission) => boolean;
  homePath: string;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userId, setUserIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await loadAppData();
    const active = data.employees.filter((e) => e.active);
    setEmployees(active);
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    if (stored && active.some((e) => e.id === stored)) {
      setUserIdState(stored);
    } else {
      setUserIdState(null);
      if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (loginName: string, password: string): Promise<LoginResult> => {
    const normalized = loginName.trim().toLowerCase();

    if (!isStaticDemo()) {
      try {
        const res = await fetch(withBasePath("/api/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login: normalized, password }),
        });
        const json = (await res.json()) as {
          employee?: Employee;
          mustChangePassword?: boolean;
          error?: string;
        };
        if (!res.ok || !json.employee) {
          return { ok: false, error: json.error ?? "Invalid login or password" };
        }
        localStorage.setItem(SESSION_KEY, json.employee.id);
        setUserIdState(json.employee.id);
        await refresh();
        return { ok: true, mustChangePassword: json.mustChangePassword };
      } catch {
        return { ok: false, error: "Could not reach server" };
      }
    }

    const data = await loadAppData();
    const match = data.employees.find(
      (e) =>
        e.active &&
        (e.login.toLowerCase() === normalized || e.email.toLowerCase() === normalized),
    );
    if (!match || !(await verifyStaffSecretBrowser(match, password))) {
      return { ok: false, error: "Invalid login or password" };
    }
    localStorage.setItem(SESSION_KEY, match.id);
    setUserIdState(match.id);
    setEmployees(data.employees.filter((e) => e.active));
    return { ok: true, mustChangePassword: needsPasswordSetup(match) };
  }, [refresh]);

  const setPassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<LoginResult> => {
      const id = userId ?? localStorage.getItem(SESSION_KEY);
      if (!id) return { ok: false, error: "Not signed in" };

      if (newPassword.trim().length < 6) {
        return { ok: false, error: "Password must be at least 6 characters" };
      }

      if (!isStaticDemo()) {
        const res = await fetch(withBasePath("/api/auth/login"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: id,
            currentPassword,
            newPassword,
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) return { ok: false, error: json.error ?? "Could not update password" };
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, mustChangePassword: false, hasPassword: true } : e,
          ),
        );
        await refresh();
        return { ok: true };
      }

      const hash = await hashPasswordBrowser(newPassword);
      let ok = false;
      await mutateAppData(async (data) => {
        const emp = data.employees.find((e) => e.id === id);
        if (!emp || !(await verifyStaffSecretBrowser(emp, currentPassword))) return;
        emp.passwordHash = hash;
        emp.mustChangePassword = false;
        ok = true;
      });
      if (!ok) return { ok: false, error: "Current password is incorrect" };
      await refresh();
      return { ok: true };
    },
    [refresh, userId],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUserIdState(null);
  }, []);

  const user = useMemo(
    () => employees.find((e) => e.id === userId) || null,
    [employees, userId],
  );

  const can = useCallback(
    (perm: Permission) => {
      if (!user) return false;
      return ROLE_PERMISSIONS[user.role]?.includes(perm) ?? false;
    },
    [user],
  );

  const homePath = user ? homeForRole(user.role) : "/login";

  const value = useMemo(
    () => ({
      user,
      employees,
      loading,
      authenticated: !!user,
      login,
      setPassword,
      logout,
      can,
      homePath,
      refresh,
    }),
    [user, employees, loading, login, setPassword, logout, can, homePath, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function useMustChangePassword(): boolean {
  const { user } = useSession();
  if (!user) return false;
  return needsPasswordSetup(user);
}
