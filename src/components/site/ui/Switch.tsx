"use client";

type SwitchProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-labelledby"?: string;
};

export function Switch({ id, checked, onCheckedChange, "aria-labelledby": labelledBy }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-aqua focus-visible:ring-offset-2 ${
        checked ? "bg-primary-aqua" : "bg-base-black/20"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 translate-y-px rounded-full bg-base-white shadow ring-0 transition-transform duration-200 ease-out ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
