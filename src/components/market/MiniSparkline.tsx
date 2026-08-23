"use client";

export function MiniSparkline({
  values,
  positive,
  width = 120,
  height = 36,
}: {
  values: number[];
  positive?: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="bloom-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={positive === false ? "#ff3d5a" : positive === true ? "#39ff14" : "#ffc107"}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}
