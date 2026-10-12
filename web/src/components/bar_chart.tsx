"use client";

import { fmtNumber } from "@/lib/format";

export interface BarDatum {
  label: string;
  value: number;
}

/** Minimal dependency-free bar chart (SVG) with hover titles. */
export function BarChart({ data, height = 160, unit = "" }: { data: BarDatum[]; height?: number; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="bar chart">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2="100" y1={height * f} y2={height * f} stroke="var(--border)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          return (
            <rect key={i} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx="0.6" fill="var(--accent)" opacity={d.value ? 0.9 : 0.15}>
              <title>{`${d.label}: ${fmtNumber(d.value)}${unit}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{data[0]?.label}</span>
        <span>
          最大 {fmtNumber(max)}
          {unit}
        </span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
