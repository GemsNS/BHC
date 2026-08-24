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
  pitched: "bg-blue-500/20 text-blue-200",
  sold: "bg-yellow-500/20 text-yellow-200",
  callback: "bg-orange-500/20 text-orange-200",
  open: "bg-sky-500/20 text-sky-200",
  paused: "bg-orange-500/20 text-orange-200",
  admin: "bg-stone-500/30 text-stone-200",
  manager: "bg-teal-500/20 text-teal-200",
  knocker: "bg-amber-500/20 text-amber-200",
  available: "bg-emerald-500/20 text-emerald-200",
  checked_out: "bg-amber-500/20 text-amber-200",
  damaged: "bg-rose-500/20 text-rose-200",
  retired: "bg-stone-500/30 text-stone-300",
  low: "bg-sky-500/20 text-sky-200",
  medium: "bg-amber-500/20 text-amber-200",
  high: "bg-orange-500/20 text-orange-200",
  critical: "bg-rose-500/20 text-rose-200",
  invoice: "bg-sky-500/20 text-sky-200",
  full_report: "bg-teal-500/20 text-teal-200",
  draft: "bg-stone-500/30 text-stone-300",
  sent: "bg-indigo-500/20 text-indigo-200",
  paid: "bg-emerald-500/20 text-emerald-200",
  void: "bg-rose-500/20 text-rose-200",
  open_pool: "bg-emerald-500/20 text-emerald-200",
  claimed: "bg-violet-500/20 text-violet-200",
  overtime: "bg-amber-500/20 text-amber-200",
  pending_approval: "bg-amber-500/20 text-amber-200",
  approved: "bg-teal-500/20 text-teal-200",
  cancelled: "bg-stone-500/30 text-stone-300",
  closed: "bg-stone-500/30 text-stone-300",
  enabled: "bg-emerald-500/20 text-emerald-200",
  disabled: "bg-stone-500/30 text-stone-300",
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
