import { cn, labelize } from "@/lib/utils";

const toneMap: Record<string, string> = {
  new: "bg-sky-500/20 text-sky-200",
  contacted: "bg-indigo-500/20 text-indigo-200",
  qualified: "bg-teal-500/20 text-teal-200",
  estimate: "bg-amber-500/20 text-amber-200",
  won: "bg-emerald-500/20 text-emerald-200",
  lost: "bg-stone-500/30 text-stone-300",
  scheduled: "bg-sky-500/20 text-sky-200",
  in_progress: "bg-amber-500/20 text-amber-200",
  on_hold: "bg-orange-500/20 text-orange-200",
  completed: "bg-emerald-500/20 text-emerald-200",
  invoiced: "bg-violet-500/20 text-violet-200",
  active: "bg-emerald-500/20 text-emerald-200",
  idle: "bg-stone-500/30 text-stone-300",
  maintenance: "bg-rose-500/20 text-rose-200",
  interested: "bg-teal-500/20 text-teal-200",
  appointment: "bg-emerald-500/20 text-emerald-200",
  not_home: "bg-stone-500/30 text-stone-300",
  not_interested: "bg-orange-500/20 text-orange-200",
  do_not_knock: "bg-rose-500/20 text-rose-200",
  open: "bg-sky-500/20 text-sky-200",
  paused: "bg-orange-500/20 text-orange-200",
  admin: "bg-stone-500/30 text-stone-200",
  manager: "bg-teal-500/20 text-teal-200",
  knocker: "bg-amber-500/20 text-amber-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneMap[status] ?? "bg-stone-500/30 text-stone-300",
      )}
    >
      {labelize(status)}
    </span>
  );
}
