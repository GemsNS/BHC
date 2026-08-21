"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Employee, EmployeeRole } from "./types";
import { ROLE_PERMISSIONS } from "./types";
import { loadAppData } from "./client-data";

const SESSION_KEY = "bhc-current-user-id";

type SessionCtx = {
  user: Employee | null;
  employees: Employee[];
  loading: boolean;
  setUserId: (id: string) => void;
  can: (perm: (typeof ROLE_PERMISSIONS)[EmployeeRole][number]) => boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userId, setUserIdState] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await loadAppData();
    setEmployees(data.employees.filter((e) => e.active));
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    const fallback =
      data.employees.find((e) => e.role === "admin")?.id ||
      data.employees[0]?.id ||
      "";
    setUserIdState(stored && data.employees.some((e) => e.id === stored) ? stored : fallback);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setUserId = useCallback((id: string) => {
    setUserIdState(id);
    localStorage.setItem(SESSION_KEY, id);
  }, []);

  const user = useMemo(
    () => employees.find((e) => e.id === userId) || null,
    [employees, userId],
  );

  const can = useCallback(
    (perm: (typeof ROLE_PERMISSIONS)[EmployeeRole][number]) => {
      if (!user) return false;
      return ROLE_PERMISSIONS[user.role]?.includes(perm) ?? false;
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, employees, loading, setUserId, can, refresh }),
    [user, employees, loading, setUserId, can, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
