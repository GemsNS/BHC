"use client";

import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  title,
  action,
  pulse,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <section className={cn("cc-panel", pulse && "cc-panel-pulse", className)}>
      {title || action ? (
        <header className="cc-panel-head">
          {title ? <h2 className="cc-panel-title">{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PageFrame({
  title,
  subtitle,
  context,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  context?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("cc-page", className)}>
      <header className="cc-page-header">
        <div>
          {context ? <p className="cc-page-context">{context}</p> : null}
          <h1 className="cc-page-title">{title}</h1>
          {subtitle ? <p className="cc-page-sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="cc-page-actions">{actions}</div> : null}
      </header>
      <div className="cc-page-body">{children}</div>
    </div>
  );
}

export type MetricItem = {
  label: string;
  value: string | number;
  hint?: string;
  signal?: boolean;
};

export function MetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <div className="cc-metric-strip">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("cc-metric", item.signal && "cc-metric-signal")}
        >
          <p className="cc-metric-label">{item.label}</p>
          <p className="cc-metric-value">{item.value}</p>
          {item.hint ? <p className="cc-metric-hint">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export type FeedItemData = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "knock" | "clock" | "lead" | "job" | "alert";
};

export function ActivityFeed({ items }: { items: FeedItemData[] }) {
  if (!items.length) {
    return <p className="cc-empty">No recent activity.</p>;
  }
  return (
    <ul className="cc-feed">
      {items.map((item) => (
        <li key={item.id} className={cn("cc-feed-item", `kind-${item.kind}`)}>
          <span className="cc-feed-dot" aria-hidden />
          <div className="cc-feed-body">
            <p className="cc-feed-title">{item.title}</p>
            <p className="cc-feed-detail">{item.detail}</p>
          </div>
          <time className="cc-feed-time">{item.time}</time>
        </li>
      ))}
    </ul>
  );
}

export type AlertItem = {
  id: string;
  label: string;
  detail: string;
  href?: string;
  level?: "warn" | "info" | "critical";
};

export function AlertRail({
  items,
  linkAs,
}: {
  items: AlertItem[];
  linkAs?: (href: string, children: React.ReactNode) => React.ReactNode;
}) {
  if (!items.length) {
    return <p className="cc-empty">All clear — no active alerts.</p>;
  }
  return (
    <ul className="cc-alerts">
      {items.map((item) => {
        const inner = (
          <>
            <span className={cn("cc-alert-chip", item.level || "warn")}>
              {item.label}
            </span>
            <p className="cc-alert-detail">{item.detail}</p>
          </>
        );
        return (
          <li key={item.id} className="cc-alert">
            {item.href && linkAs ? linkAs(item.href, inner) : inner}
          </li>
        );
      })}
    </ul>
  );
}
