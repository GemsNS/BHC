export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-[rgba(255,255,255,0.45)]">
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--foam)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[rgba(255,255,255,0.4)]">{hint}</p>
      ) : null}
    </div>
  );
}
