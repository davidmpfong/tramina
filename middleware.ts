import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { defaultLocale, locales } from "./i18n";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always"
});

const PROTECTED_SEGMENTS = ["/onboard", "/chat"];

function getLocaleFromPathname(pathname: string): string {
  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      return locale;
    }
  }
  return defaultLocale;
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_SEGMENTS.some((seg) => pathname.includes(seg));
}

function hasSupabaseSession(request: NextRequest): boolean {
  // Supabase stores auth in cookies with these patterns
  const cookies = request.cookies;
  // Check for any supabase auth cookie (sb-*-auth-token or supabase-auth-token)
  for (const [name] of cookies) {
    if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
      return true;
    }
    if (name === "supabase-auth-token") {
      return true;
    }
  }
  return false;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname) && !hasSupabaseSession(request)) {
    const locale = getLocaleFromPathname(pathname);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/auth`;
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(en|es|km)/:path*", "/((?!api|_next|.*\..*).*)"]
};
