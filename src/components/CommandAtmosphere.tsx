"use client";

/** Subtle global command-center atmosphere — grid pulse + corner brackets */
export function CommandAtmosphere() {
  return (
    <>
      <div className="command-atmosphere" aria-hidden />
      <div className="command-corners" aria-hidden>
        <span className="command-corner command-corner-tl" />
        <span className="command-corner command-corner-tr" />
        <span className="command-corner command-corner-bl" />
        <span className="command-corner command-corner-br" />
      </div>
    </>
  );
}
