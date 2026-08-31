"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMustChangePassword, useSession } from "@/lib/session";
import type { Permission } from "@/lib/types";

export function RequireAuth({
  children,
  perm,
}: {
  children: React.ReactNode;
  perm?: Permission | Permission[];
}) {
  const { authenticated, loading, can, homePath } = useSession();
  const mustChangePassword = useMustChangePassword();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!authenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (mustChangePassword && !pathname.startsWith("/login/set-password")) {
      router.replace(`/login/set-password?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (perm) {
      const list = Array.isArray(perm) ? perm : [perm];
      const allowed = list.some((p) => can(p));
      if (!allowed) router.replace(homePath);
    }
  }, [loading, authenticated, mustChangePassword, perm, can, router, pathname, homePath]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--muted)]">
        Checking access…
      </div>
    );
  }
  if (!authenticated) return null;
  if (mustChangePassword && !pathname.startsWith("/login/set-password")) return null;
  if (perm) {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => can(p))) return null;
  }
  return <>{children}</>;
}
