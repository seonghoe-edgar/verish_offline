import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verish 퍼널 대시보드",
  description: "카페24 상품별 조회수 · 장바구니담기율 · 구매전환율 주간 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
