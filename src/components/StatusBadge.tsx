import { cn, labelize } from "@/lib/utils";

const toneMap: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  contacted: "bg-indigo-100 text-indigo-800",
  qualified: "bg-teal-100 text-teal-800",
  estimate: "bg-amber-100 text-amber-900",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-stone-200 text-stone-700",
  scheduled: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-900",
  on_hold: "bg-orange-100 text-orange-900",
  completed: "bg-emerald-100 text-emerald-800",
  invoiced: "bg-violet-100 text-violet-800",
  active: "bg-emerald-100 text-emerald-800",
  idle: "bg-stone-200 text-stone-700",
  maintenance: "bg-rose-100 text-rose-800",
  interested: "bg-teal-100 text-teal-800",
  appointment: "bg-emerald-100 text-emerald-800",
  not_home: "bg-stone-200 text-stone-700",
  not_interested: "bg-orange-100 text-orange-900",
  do_not_knock: "bg-rose-100 text-rose-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneMap[status] ?? "bg-stone-200 text-stone-700",
      )}
    >
      {labelize(status)}
    </span>
  );
}
