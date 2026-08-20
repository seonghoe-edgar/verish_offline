import type { WeeklySummary } from "../lib/data";

const WIDTH = 900;
const HEIGHT = 260;
const PAD = { top: 20, right: 20, bottom: 30, left: 44 };

function fmtWeek(weekStart: string): string {
  const [, m, d] = weekStart.split("-");
  return `${m}/${d}`;
}

export default function TrendChart({ weeks }: { weeks: WeeklySummary[] }) {
  if (weeks.length === 0) {
    return <div className="empty">아직 저장된 주간 데이터가 없습니다.</div>;
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const maxRate = Math.max(...weeks.map((w) => w.conversionRate), 0.1) * 1.2;

  const stepX = weeks.length > 1 ? innerW / (weeks.length - 1) : 0;
  const points = weeks.map((w, i) => {
    const x = PAD.left + (weeks.length > 1 ? i * stepX : innerW / 2);
    const y = PAD.top + innerH - (w.conversionRate / maxRate) * innerH;
    return { x, y, w };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => PAD.top + innerH * (1 - frac));

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="주간 전환율 추이">
      {gridLines.map((y, i) => (
        <line key={i} x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="#eef0f3" strokeWidth={1} />
      ))}
      <text x={4} y={gridLines[0] + 4} fontSize={10} fill="#9aa1ad">
        {maxRate.toFixed(1)}%
      </text>
      <text x={4} y={gridLines[gridLines.length - 1] + 4} fontSize={10} fill="#9aa1ad">
        0%
      </text>

      <path d={linePath} fill="none" stroke="#2563eb" strokeWidth={2} />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="#2563eb" />
          <text x={p.x} y={HEIGHT - PAD.bottom + 16} fontSize={10} fill="#6b7280" textAnchor="middle">
            {fmtWeek(p.w.weekStart)}
          </text>
          <title>
            {p.w.weekStart} ~ {p.w.weekEnd}: 전환율 {p.w.conversionRate}% (주문 {p.w.validOrders} / 세션 {p.w.sessions})
          </title>
        </g>
      ))}
    </svg>
  );
}
