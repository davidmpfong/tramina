import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
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

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.includes("/auth/callback")) {
    return intlMiddleware(request);
  }

  if (!isProtectedPath(pathname)) {
    return intlMiddleware(request);
  }
  // Properly validate the Supabase session using @supabase/ssr
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const locale = getLocaleFromPathname(pathname);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/auth`;
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Run intl middleware on the response for protected paths too
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(en|es|km)/:path*", "/((?!api|_next|.*\\..*).*)"]
};
