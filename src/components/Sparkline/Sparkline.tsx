type SparklineProps = {
  /** Data points (oldest to newest). Needs at least 2 values. */
  data: number[];
  width?: number;
  height?: number;
  /** Stroke colour for the line. */
  color?: string;
  /** If true, fills the area under the line with a semi-transparent version of color. */
  fill?: boolean;
};

/**
 * Minimal SVG sparkline — no dependencies.
 * Renders a polyline (and optional fill area) from an array of numbers.
 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "#4AE292",
  fill = true,
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padY = 2; // vertical padding so the line isn't clipped

  const toX = (i: number) => (i / (data.length - 1)) * width;
  const toY = (v: number) =>
    padY + ((1 - (v - min) / range) * (height - padY * 2));

  const points = data.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");

  // Close the fill path along the bottom edge.
  const fillPath =
    `M${toX(0)},${toY(data[0])} ` +
    data.map((v, i) => `L${toX(i)},${toY(v)}`).join(" ") +
    ` L${toX(data.length - 1)},${height} L${toX(0)},${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {fill && (
        <path
          d={fillPath}
          fill={color}
          fillOpacity={0.12}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Highlight the latest data point */}
      <circle
        cx={toX(data.length - 1)}
        cy={toY(data[data.length - 1])}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}
