"use client";

import type { DeckEdge, DeckNode } from "@/lib/command-deck";
import { DECK_TONE_STROKE } from "@/lib/command-deck";

function edgePath(
  from: DeckNode,
  to: DeckNode,
  curved: boolean,
): string {
  if (!curved) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
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
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <svg
      className="hud-graph"
      viewBox="0 0 100 80"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Operations graph"
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
        return (
          <path
            key={`${edge.from}-${edge.to}-${i}`}
            d={edgePath(from, to, chaotic || edge.curved === true)}
            fill="none"
            stroke={stroke}
            strokeWidth={chaotic ? 0.35 : 0.25}
            strokeOpacity={0.85}
            className="hud-edge-animate"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        );
      })}
      {nodes.map((node) => {
        const stroke = DECK_TONE_STROKE[node.tone] ?? "#ff2a2a";
        return (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`} filter="url(#hud-glow)">
            <circle
              r={node.id === "root" ? 3.2 : 2.4}
              fill="rgba(0,0,0,0.6)"
              stroke={stroke}
              strokeWidth={0.35}
            />
            <text
              y={-4}
              textAnchor="middle"
              className="hud-node-label"
              fill={stroke}
            >
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
