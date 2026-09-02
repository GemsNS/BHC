const SESSION_HEADER = "x-bhc-user-id";

export function sessionHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const id = localStorage.getItem("bhc-auth-user-id");
  return id ? { [SESSION_HEADER]: id } : {};
}

export const BHC_SESSION_HEADER = SESSION_HEADER;
