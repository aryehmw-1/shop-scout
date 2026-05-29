"use client";

interface PriceHistoryMiniChartProps {
  points: number[];
  current: number;
  width?: number;
  height?: number;
}

export function PriceHistoryMiniChart({
  points,
  current,
  width = 120,
  height = 44,
}: PriceHistoryMiniChartProps) {
  const all = [...points, current];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const pad = 4;

  const coords = all.map((p, i) => {
    const x = pad + (i / Math.max(all.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((p - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const last = all[all.length - 1]!;
  const lastX = pad + ((all.length - 1) / Math.max(all.length - 1, 1)) * (width - pad * 2);
  const lastY = height - pad - ((last - min) / range) * (height - pad * 2);

  return (
    <svg width={width} height={height} className="text-sage-600" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
        opacity={0.85}
      />
      <circle cx={lastX} cy={lastY} r="3" fill="currentColor" />
    </svg>
  );
}
