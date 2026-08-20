import { getLatestProducts, getWeeklySummary } from "./lib/data";
import { requireAuth } from "./lib/auth";
import TrendChart from "./components/TrendChart";
import ProductTable from "./components/ProductTable";

function fmtWon(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export default async function Home() {
  await requireAuth();
  const weeks = getWeeklySummary();
  const latest = getLatestProducts();
  const current = weeks[weeks.length - 1];
  const prev = weeks.length > 1 ? weeks[weeks.length - 2] : undefined;

  function delta(curr: number, prev: number | undefined): string | null {
    if (prev === undefined || prev === 0) return null;
    const d = ((curr - prev) / prev) * 100;
    const sign = d >= 0 ? "+" : "";
    return `전주 대비 ${sign}${d.toFixed(1)}%`;
  }

  return (
    <div className="page">
      <header className="top">
        <h1>Verish 자사몰 퍼널 대시보드</h1>
        <p>
          {current ? `${current.weekStart} ~ ${current.weekEnd} (최근 완료 주)` : "데이터 없음 — 스냅샷 스크립트를 먼저 실행하세요."}
        </p>
      </header>

      {current && (
        <section className="kpi-grid">
          <div className="kpi-card">
            <div className="label">세션수</div>
            <div className="value">{current.sessions.toLocaleString("ko-KR")}</div>
            {delta(current.sessions, prev?.sessions) && <div className="sub">{delta(current.sessions, prev?.sessions)}</div>}
          </div>
          <div className="kpi-card">
            <div className="label">유효 주문수</div>
            <div className="value">{current.validOrders.toLocaleString("ko-KR")}</div>
            {delta(current.validOrders, prev?.validOrders) && (
              <div className="sub">{delta(current.validOrders, prev?.validOrders)}</div>
            )}
          </div>
          <div className="kpi-card">
            <div className="label">전체 전환율</div>
            <div className="value">{current.conversionRate}%</div>
            {delta(current.conversionRate, prev?.conversionRate) && (
              <div className="sub">{delta(current.conversionRate, prev?.conversionRate)}</div>
            )}
          </div>
          <div className="kpi-card">
            <div className="label">매출</div>
            <div className="value">{fmtWon(current.revenue)}</div>
            {delta(current.revenue, prev?.revenue) && <div className="sub">{delta(current.revenue, prev?.revenue)}</div>}
          </div>
          <div className="kpi-card">
            <div className="label">객단가</div>
            <div className="value">{fmtWon(current.aov)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">평균 담기율 / 구매전환율</div>
            <div className="value">
              {current.avgAddCartRate}% / {current.avgPurchaseRate}%
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>주간 전환율 추이</h2>
        <p className="panel-sub">
          유효 주문(취소 제외) / 세션수 기준. 이 선이 전반적으로 떨어지면 &quot;전체 전환율&quot; 이슈, 안정적인데 특정
          상품만 아래 표에서 저조하면 &quot;상품 개별&quot; 이슈일 가능성이 높습니다.
        </p>
        <TrendChart weeks={weeks} />
      </section>

      <section className="panel">
        <h2>상품별 퍼널 ({latest ? `${latest.weekStart} ~ ${latest.weekEnd}` : "-"})</h2>
        <p className="panel-sub">
          사이트 평균 담기율 {latest?.avgAddCartRate.toFixed(2)}% / 평균 구매전환율 {latest?.avgPurchaseRate.toFixed(2)}%
          대비 70% 미만인 상품에 &quot;평균 대비 저조&quot; 표시.
        </p>
        {latest ? <ProductTable products={latest.products} /> : <div className="empty">상품 데이터가 없습니다.</div>}
      </section>
    </div>
  );
}
