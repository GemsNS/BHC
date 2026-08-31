import { createHash } from "crypto";

export const DEFAULT_STAFF_PIN = "0000";

export function hashPassword(password: string): string {
  return createHash("sha256").update(password.trim()).digest("hex");
}

export function verifyStaffSecret(
  employee: { pin: string; passwordHash?: string | null; mustChangePassword?: boolean },
  secret: string,
): boolean {
  const value = secret.trim();
  if (!value) return false;
  if (employee.passwordHash) {
    return employee.passwordHash === hashPassword(value);
  }
  return employee.pin === value;
}

export function needsPasswordSetup(employee: {
  mustChangePassword?: boolean;
  passwordHash?: string | null;
}): boolean {
  return Boolean(employee.mustChangePassword) || !employee.passwordHash;
}

/** Browser-safe SHA-256 for client-side auth on static demo */
export async function hashPasswordBrowser(password: string): Promise<string> {
  const data = new TextEncoder().encode(password.trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyStaffSecretBrowser(
  employee: { pin: string; passwordHash?: string | null },
  secret: string,
): Promise<boolean> {
  const value = secret.trim();
  if (!value) return false;
  if (employee.passwordHash) {
    return employee.passwordHash === (await hashPasswordBrowser(value));
  }
  return employee.pin === value;
}
