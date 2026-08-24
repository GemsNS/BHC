"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MetricStrip, PageFrame, Panel } from "@/components/cc";
import { useSession } from "@/lib/session";
import {
  allRoles,
  modulesByCategory,
  modulesForRole,
  orderedPathModules,
  walkthroughForRole,
  type TutorialModule,
} from "@/lib/tutorials";
import { ROLE_LABELS, type EmployeeRole } from "@/lib/types";
import { cn } from "@/lib/utils";

function ModuleCard({
  module,
  open,
  onToggle,
  focus,
}: {
  module: TutorialModule;
  open: boolean;
  onToggle: () => void;
  focus?: boolean;
}) {
  return (
    <article className={cn("tutorial-card", open && "tutorial-card-open", focus && "tutorial-card-focus")}>
      <button type="button" className="tutorial-card-head" onClick={onToggle} aria-expanded={open}>
        <div>
          <p className="tutorial-card-kicker">{focus ? "On your path" : "Walkthrough"}</p>
          <h3 className="tutorial-card-title">{module.title}</h3>
          <p className="tutorial-card-summary">{module.summary}</p>
        </div>
        <span className={cn("tutorial-chevron", open && "tutorial-chevron-open")} aria-hidden />
      </button>
      {open ? (
        <div className="tutorial-card-body">
          <ol className="tutorial-steps">
            {module.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {module.tips?.length ? (
            <ul className="tutorial-tips">
              {module.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
          <div className="tutorial-card-actions">
            <Link href={module.href} className="tutorial-open-btn">
              Open {module.title}
            </Link>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function TutorialsGuide({ mode }: { mode: "admin" | "apps" }) {
  const { user, can } = useSession();
  const myRole = (user?.role ?? "admin") as EmployeeRole;
  const [previewRole, setPreviewRole] = useState<EmployeeRole>(myRole);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const walk = walkthroughForRole(previewRole);
  const pathModules = orderedPathModules(previewRole);
  const accessible = modulesForRole(previewRole);
  const focusIds = useMemo(() => new Set(walk.path), [walk.path]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = showAll ? accessible : pathModules;
    if (!q) return base;
    return accessible.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.steps.some((s) => s.toLowerCase().includes(q)),
    );
  }, [accessible, pathModules, query, showAll]);

  const groups = modulesByCategory(showAll || query ? filtered : []);

  const metrics = [
    { label: "Viewing as", value: ROLE_LABELS[previewRole] },
    { label: "Modules you can use", value: accessible.length },
    { label: "Start-here steps", value: pathModules.length },
    {
      label: "Surface",
      value: mode === "admin" ? "Ops" : "Field",
    },
  ];

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <PageFrame
      context={mode === "admin" ? "Administration" : "Field mode"}
      title="Tutorials"
      subtitle="Role-based walkthroughs for every part of BH Contracting Co. — only modules your role can open are listed."
      actions={
        mode === "admin" && can("apps") ? (
          <Link href="/apps/tutorials" className="cc-topbar-link">
            Field copy
          </Link>
        ) : mode === "apps" && can("dashboard") ? (
          <Link href="/admin/tutorials" className="cc-topbar-link">
            Ops copy
          </Link>
        ) : null
      }
    >
      <MetricStrip items={metrics} />

      <Panel title="Choose a role path">
        <p className="tutorial-lead">
          Defaults to <strong>{ROLE_LABELS[myRole]}</strong>
          {user?.name ? ` (${user.name})` : ""}. Preview another role to see their
          recommended path — useful when training new hires.
        </p>
        <div className="tutorial-role-row" role="tablist" aria-label="Role walkthrough">
          {allRoles().map((role) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-current={previewRole === role ? "true" : undefined}
              className={cn(
                "tutorial-role-chip",
                previewRole === role && "tutorial-role-chip-on",
                role === myRole && "tutorial-role-chip-mine",
              )}
              onClick={() => {
                setPreviewRole(role);
                setOpenId(null);
                setShowAll(false);
                setQuery("");
              }}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
        <p className="tutorial-role-blurb">{walk.blurb}</p>
        {walk.demo ? (
          <p className="tutorial-demo">
            Demo login: <code>{walk.demo.login}</code> / <code>{walk.demo.pin}</code>
          </p>
        ) : (
          <p className="tutorial-demo">No dedicated demo chip — use an admin account to create this role.</p>
        )}
      </Panel>

      <Panel
        title={`Start here — ${ROLE_LABELS[previewRole]}`}
        action={
          <button
            type="button"
            className="tutorial-toggle-all"
            onClick={() => {
              setShowAll((v) => !v);
              setQuery("");
            }}
          >
            {showAll ? "Show start path only" : "Browse all modules"}
          </button>
        }
      >
        {!showAll && !query ? (
          <div className="tutorial-stack">
            {pathModules.map((module, i) => (
              <div key={module.id} className="tutorial-path-item">
                <span className="tutorial-path-num">{i + 1}</span>
                <ModuleCard
                  module={module}
                  focus
                  open={openId === module.id}
                  onToggle={() => toggle(module.id)}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="tutorial-search-row">
          <label className="sr-only" htmlFor="tutorial-search">
            Search tutorials
          </label>
          <input
            id="tutorial-search"
            className="tutorial-search"
            placeholder="Search any module, step, or keyword…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value) setShowAll(true);
            }}
          />
        </div>

        {(showAll || query) &&
          groups.map((group) => (
            <section key={group.category} className="tutorial-group">
              <h3 className="tutorial-group-title">{group.label}</h3>
              <div className="tutorial-stack">
                {group.items.map((module) => (
                  <ModuleCard
                    key={module.id}
                    module={module}
                    focus={focusIds.has(module.id)}
                    open={openId === module.id}
                    onToggle={() => toggle(module.id)}
                  />
                ))}
              </div>
            </section>
          ))}

        {(showAll || query) && filtered.length === 0 ? (
          <p className="cc-empty">No modules match that search for this role.</p>
        ) : null}
      </Panel>

      <Panel title="Permission cheat sheet">
        <CheatSheet role={previewRole} modules={accessible} />
      </Panel>
    </PageFrame>
  );
}

function CheatSheet({
  role,
  modules,
}: {
  role: EmployeeRole;
  modules: TutorialModule[];
}) {
  return (
    <div className="tutorial-cheat">
      <p className="tutorial-lead">
        {ROLE_LABELS[role]} can open {modules.length} tutorial modules. Links below
        jump straight into the live screen.
      </p>
      <ul className="tutorial-cheat-list">
        {modules.map((m) => (
          <li key={m.id}>
            <Link href={m.href}>{m.title}</Link>
            <span>{m.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
