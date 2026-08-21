import { redirect } from "next/navigation";

/** Prefer dashboard when allowed; otherwise clients land via login homeForRole */
export default function AdminIndex() {
  redirect("/admin/dashboard");
}
