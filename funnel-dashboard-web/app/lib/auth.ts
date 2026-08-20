import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "funnel_auth";

// 미들웨어(Edge Runtime) 대신 페이지 서버 컴포넌트에서 직접 쿠키를 확인한다.
// Vercel의 Edge Runtime에서 이 프로젝트의 미들웨어가 "__dirname is not defined"로
// 계속 크래시해서(Next.js 15 + Vercel 조합 이슈로 보임, Node.js 런타임 지정도 무시됨)
// Edge를 아예 안 타는 이 방식으로 우회했다.
export async function requireAuth() {
  const passcode = process.env.DASHBOARD_PASSCODE;
  if (!passcode) return;

  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (value !== passcode) {
    redirect("/login");
  }
}
