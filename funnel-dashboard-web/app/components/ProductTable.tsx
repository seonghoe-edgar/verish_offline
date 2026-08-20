"use client";

import { useMemo, useState } from "react";
import type { ProductRow } from "../lib/data";

type SortKey = keyof Pick<
  ProductRow,
  "productName" | "views" | "addCartCount" | "addCartRate" | "qtySold" | "revenue" | "purchaseRate"
>;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "productName", label: "상품명" },
  { key: "views", label: "조회수" },
  { key: "addCartCount", label: "장바구니담기" },
  { key: "addCartRate", label: "담기율%" },
  { key: "qtySold", label: "판매수량" },
  { key: "revenue", label: "매출" },
  { key: "purchaseRate", label: "구매전환율%" },
];

function fmtNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default function ProductTable({ products }: { products: ProductRow[] }) {
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const filtered = useMemo(() => {
    let rows = products;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (p) => p.productName.toLowerCase().includes(q) || String(p.productNo).includes(q)
      );
    }
    if (onlyFlagged) {
      rows = rows.filter((p) => p.flag === "below_avg");
    }
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * sortDir;
      }
      return ((av as number) - (bv as number)) * sortDir;
    });
  }, [products, query, onlyFlagged, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="상품명·상품번호 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={onlyFlagged ? "flagged" : "all"} onChange={(e) => setOnlyFlagged(e.target.value === "flagged")}>
          <option value="all">전체</option>
          <option value="flagged">평균 대비 저조한 상품만</option>
        </select>
        <span style={{ alignSelf: "center", color: "var(--text-dim)", fontSize: 12 }}>
          {filtered.length} / {products.length}개 상품
        </span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.key === sortKey ? "active" : ""} onClick={() => toggleSort(c.key)}>
                  {c.label}
                  {c.key === sortKey ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.productNo} className={p.flag === "below_avg" ? "flagged" : ""}>
                <td>
                  {p.productName}
                  {p.flag === "below_avg" && (
                    <>
                      {" "}
                      <span className="badge">평균 대비 저조</span>
                    </>
                  )}
                </td>
                <td>{fmtNumber(p.views)}</td>
                <td>{fmtNumber(p.addCartCount)}</td>
                <td>{p.addCartRate}%</td>
                <td>{fmtNumber(p.qtySold)}</td>
                <td>₩{fmtNumber(p.revenue)}</td>
                <td>{p.purchaseRate}%</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty">
                  조건에 맞는 상품이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
