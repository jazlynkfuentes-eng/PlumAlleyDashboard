import { NextResponse, NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // No authentication – simply continue to the requested route
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
