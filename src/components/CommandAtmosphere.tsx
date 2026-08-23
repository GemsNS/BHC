"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Pointer-reactive command atmosphere: spotlight follow, grid shear, click ripples.
 * Goes beyond static CSS loops so the shell feels "alive" under the cursor.
 */
export function CommandAtmosphere() {
  const rootRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: PointerEvent) => {
    const root = rootRef.current;
    const spot = spotRef.current;
    if (!root || !spot) return;
    const rect = root.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    root.style.setProperty("--ptr-x", `${x}%`);
    root.style.setProperty("--ptr-y", `${y}%`);
    root.style.setProperty("--ptr-nx", `${(x / 100 - 0.5) * 2}`);
    root.style.setProperty("--ptr-ny", `${(y / 100 - 0.5) * 2}`);
    spot.style.opacity = "1";
  }, []);

  const onLeave = useCallback(() => {
    const spot = spotRef.current;
    if (spot) spot.style.opacity = "0";
  }, []);

  const onClick = useCallback((e: PointerEvent) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "command-ripple";
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    root.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 900);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const parent = root.parentElement;
    if (!parent) return;
    parent.addEventListener("pointermove", onMove);
    parent.addEventListener("pointerleave", onLeave);
    parent.addEventListener("pointerdown", onClick);
    return () => {
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
      parent.removeEventListener("pointerdown", onClick);
    };
  }, [onMove, onLeave, onClick]);

  return (
    <div className="command-atmosphere-root" ref={rootRef} aria-hidden>
      <div className="command-atmosphere" />
      <div className="command-spotlight" ref={spotRef} />
      <div className="command-corners">
        <span className="command-corner command-corner-tl" />
        <span className="command-corner command-corner-tr" />
        <span className="command-corner command-corner-bl" />
        <span className="command-corner command-corner-br" />
      </div>
    </div>
  );
}
