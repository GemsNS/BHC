"use client";

import { useCallback, useMemo, useState } from "react";
import type { DeckEdge, DeckNode } from "@/lib/command-deck";
import { DECK_TONE_STROKE } from "@/lib/command-deck";
import { emitJarvisFocus, insightIdForDeckNode } from "@/lib/jarvis-briefing";

function edgePath(from: DeckNode, to: DeckNode, curved: boolean): string {
  if (!curved) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - 8;
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

export function DeckGraph({
  nodes,
  edges,
  chaotic = false,
}: {
  nodes: DeckNode[];
  edges: DeckEdge[];
  chaotic?: boolean;
}) {
  const nodeMap = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n])),
    [nodes],
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);

  const related = useMemo(() => {
    if (!focusId) return new Set<string>();
    const ids = new Set<string>([focusId]);
    for (const e of edges) {
      if (e.from === focusId) ids.add(e.to);
      if (e.to === focusId) ids.add(e.from);
    }
    return ids;
  }, [edges, focusId]);

  const onNodeActivate = useCallback((id: string) => {
    setFocusId((prev) => (prev === id ? null : id));
    setPulseId(id);
    window.setTimeout(() => setPulseId(null), 600);
    const insightId = insightIdForDeckNode(id);
    if (insightId) emitJarvisFocus(insightId);
  }, []);

  return (
    <svg
      className="hud-graph hud-graph-interactive"
      viewBox="0 0 100 80"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Operations graph — click nodes to inspect links"
    >
      <defs>
        <filter id="hud-glow">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {edges.map((edge, i) => {
        const from = nodeMap[edge.from];
        const to = nodeMap[edge.to];
        if (!from || !to) return null;
        const stroke = DECK_TONE_STROKE[edge.tone] ?? "#ff2a2a";
        const lit = !focusId || related.has(edge.from) || related.has(edge.to);
        return (
          <path
            key={`${edge.from}-${edge.to}-${i}`}
            d={edgePath(from, to, chaotic || edge.curved === true)}
            fill="none"
            stroke={stroke}
            strokeWidth={lit && focusId ? 0.45 : chaotic ? 0.35 : 0.25}
            strokeOpacity={lit ? 0.95 : 0.18}
            className="hud-edge-animate"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        );
      })}
      {nodes.map((node) => {
        const stroke = DECK_TONE_STROKE[node.tone] ?? "#ff2a2a";
        const lit = !focusId || related.has(node.id);
        const pulsing = pulseId === node.id;
        const r = node.id === "root" || node.id === "sales" ? 3.2 : 2.4;
        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            filter="url(#hud-glow)"
            className="hud-node-hit"
            opacity={lit ? 1 : 0.28}
            style={{ cursor: "pointer" }}
            onClick={() => onNodeActivate(node.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNodeActivate(node.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Inspect ${node.label}`}
            aria-pressed={focusId === node.id}
          >
            {pulsing ? (
              <circle
                r={r + 2.5}
                fill="none"
                stroke={stroke}
                strokeWidth={0.25}
                className="hud-node-ring"
              />
            ) : null}
            <circle
              r={r}
              fill="rgba(0,0,0,0.6)"
              stroke={stroke}
              strokeWidth={focusId === node.id ? 0.55 : 0.35}
            />
            <text y={-4} textAnchor="middle" className="hud-node-label" fill={stroke}>
              {node.label}
            </text>
            {node.sub ? (
              <text y={6} textAnchor="middle" className="hud-node-sub" fill="#888">
                {node.sub}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
