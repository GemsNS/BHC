"use client";

type WinProps = {
  left?: string;
  right?: string;
  top: string;
  frameColor: string;
  glassColor: string;
};

function Win({ left, right, top, frameColor, glassColor }: WinProps) {
  return (
    <div
      className="absolute h-[22%] w-[28%] rounded-sm shadow-inner"
      style={{
        left,
        right,
        top,
        backgroundColor: glassColor,
        borderColor: frameColor,
        borderWidth: 2,
        borderStyle: "solid",
      }}
    />
  );
}

export type SidingPattern = string;

type HousePreviewProps = {
  sidingColor: string;
  sidingPattern: SidingPattern;
  roofTrimColor: string;
  windowFrameColor: string;
  windowGlassColor: string;
  doorColor: string;
};

export function HousePreview({
  sidingColor,
  sidingPattern,
  roofTrimColor,
  windowFrameColor,
  windowGlassColor,
  doorColor,
}: HousePreviewProps) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-base-black/5 bg-base-white p-6 shadow-sm sm:p-8">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-base-black/45">
        Live preview
      </p>
      <p className="mt-1 text-center text-[11px] text-base-black/40">
        Simplified elevation — not construction drawings.
      </p>
      <div className="relative mx-auto mt-5 aspect-[5/6] max-h-[400px] w-full max-w-[min(100%,340px)]">
        <div className="absolute inset-x-0 top-0 h-[38%] rounded-t-lg bg-gradient-to-b from-primary-aqua/20 to-neutral-offwhite" />
        <div
          className="absolute left-[12%] right-[12%] top-[18%] z-[1] h-[22%]"
          style={{
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            backgroundColor: roofTrimColor,
            boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.08)",
          }}
        />
        <div
          className="absolute bottom-0 left-[10%] right-[10%] top-[calc(18%+22%-2px)] z-[2] overflow-hidden rounded-b-lg"
          style={{
            backgroundColor: sidingColor,
            backgroundImage: sidingPattern,
          }}
        >
          <Win left="12%" top="18%" frameColor={windowFrameColor} glassColor={windowGlassColor} />
          <Win right="12%" top="18%" frameColor={windowFrameColor} glassColor={windowGlassColor} />
          <Win left="12%" top="48%" frameColor={windowFrameColor} glassColor={windowGlassColor} />
          <Win right="12%" top="48%" frameColor={windowFrameColor} glassColor={windowGlassColor} />
          <div
            className="absolute bottom-0 left-1/2 h-[28%] w-[24%] -translate-x-1/2 rounded-t-md shadow-inner"
            style={{
              backgroundColor: doorColor,
              borderColor: windowFrameColor,
              borderWidth: 2,
              borderStyle: "solid",
            }}
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[6%] rounded-b-lg bg-base-black/10" />
      </div>
    </div>
  );
}
