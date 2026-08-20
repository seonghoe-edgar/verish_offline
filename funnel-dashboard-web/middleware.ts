import { NextRequest, NextResponse } from "next/server";

// 계정 시스템 없이 팀 전체가 공유하는 비밀번호 한 개로만 접근을 막는다.
// (verish_offline/src/shopify-web/server.ts의 requirePasscode와 같은 철학, Next.js 미들웨어 버전)
const COOKIE_NAME = "funnel_auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const passcode = process.env.DASHBOARD_PASSCODE;
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!passcode || cookie === passcode) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
