"use client";

import Link from "next/link";
import {
  JARVIS_CATEGORY_LABELS,
  type JarvisInsight,
  type JarvisTone,
} from "@/lib/jarvis-briefing";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<JarvisTone, string> = {
  neutral: "jarvis-tone-neutral",
  action: "jarvis-tone-action",
  success: "jarvis-tone-success",
  warn: "jarvis-tone-warn",
};

export function JarvisDetailPanel({
  insight,
  onClose,
}: {
  insight: JarvisInsight;
  onClose: () => void;
}) {
  const primary = insight.primaryAction ?? (insight.href ? { label: "Open", href: insight.href, kind: "primary" as const } : null);

  return (
    <div
      className="jarvis-detail-panel jarvis-detail-enter"
      role="region"
      aria-label={`${insight.title} details`}
    >
      <div className="jarvis-detail-header">
        <div className="jarvis-detail-heading">
          <span className={cn("jarvis-category-chip", TONE_CLASS[insight.tone])}>
            {JARVIS_CATEGORY_LABELS[insight.category]}
          </span>
          <h3 className="jarvis-detail-title">{insight.title}</h3>
          <p className="jarvis-detail-summary">{insight.text}</p>
        </div>
        {insight.metric ? (
          <div className={cn("jarvis-detail-metric", TONE_CLASS[insight.tone])}>
            <span className="jarvis-detail-metric-value">{insight.metric.value}</span>
            <span className="jarvis-detail-metric-label">{insight.metric.label}</span>
          </div>
        ) : null}
      </div>

      {insight.details.length > 0 ? (
        <dl className="jarvis-detail-grid">
          {insight.details.map((row) => (
            <div key={`${row.label}-${row.value}`} className="jarvis-detail-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {insight.entities && insight.entities.length > 0 ? (
        <ul className="jarvis-detail-entities">
          {insight.entities.map((entity) => (
            <li key={`${entity.label}-${entity.meta ?? ""}`}>
              <span className="jarvis-detail-entity-label">{entity.label}</span>
              {entity.meta ? (
                <span className="jarvis-detail-entity-meta">{entity.meta}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="jarvis-detail-actions">
        {primary?.href ? (
          <Link href={primary.href} className="jarvis-detail-btn jarvis-detail-btn-primary">
            {primary.label}
          </Link>
        ) : null}
        {insight.secondaryActions?.map((action) =>
          action.href ? (
            <Link
              key={action.label}
              href={action.href}
              className="jarvis-detail-btn jarvis-detail-btn-secondary"
            >
              {action.label}
            </Link>
          ) : (
            <span key={action.label} className="jarvis-detail-hint">
              {action.label}
            </span>
          ),
        )}
        <button
          type="button"
          className="jarvis-detail-btn jarvis-detail-btn-ghost"
          onClick={onClose}
        >
          Collapse
        </button>
      </div>
    </div>
  );
}
