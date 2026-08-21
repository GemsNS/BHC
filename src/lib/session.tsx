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
import { loadAppData } from "./client-data";
import { isStaticDemo, withBasePath } from "./paths";

const SESSION_KEY = "bhc-auth-user-id";

type SessionCtx = {
  user: Employee | null;
  employees: Employee[];
  loading: boolean;
  authenticated: boolean;
  login: (loginName: string, pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
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

  const login = useCallback(
    async (loginName: string, pin: string) => {
      const normalized = loginName.trim().toLowerCase();
      const data = await loadAppData();
      const match = data.employees.find(
        (e) =>
          e.active &&
          (e.login.toLowerCase() === normalized ||
            e.email.toLowerCase() === normalized) &&
          e.pin === pin,
      );
      if (!match) {
        return { ok: false as const, error: "Invalid login or PIN" };
      }

      if (!isStaticDemo()) {
        try {
          await fetch(withBasePath("/api/auth/login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: normalized, pin }),
          });
        } catch {
          /* client-side auth is source of truth for demo */
        }
      }

      localStorage.setItem(SESSION_KEY, match.id);
      setEmployees(data.employees.filter((e) => e.active));
      setUserIdState(match.id);
      return { ok: true as const };
    },
    [],
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
      logout,
      can,
      homePath,
      refresh,
    }),
    [user, employees, loading, login, logout, can, homePath, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
