"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Suspense } from "react";

function CallbackContent() {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in URL hash immediately
    const hash = window.location.hash;
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.replace("#", ""));
      const errorCode = params.get("error_code") ?? params.get("error");
      const errorDescription = params.get("error_description")?.replace(/\+/g, " ");
      if (errorCode === "otp_expired" || errorCode === "access_denied") {
        setError(errorDescription ?? "Sign-in link expired. Please request a new one.");
        return;
      }
    }

    const next = searchParams.get("next");
    const destination = (next && next.startsWith("/")) ? next : `/${locale}/onboard`;

    // The Supabase browser client automatically exchanges hash tokens (implicit flow)
    // and PKCE codes. We just need to listen for the session to be established.
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          subscription.unsubscribe();
          router.push(destination as never);
        } else if (event === "TOKEN_REFRESHED") {
          subscription.unsubscribe();
          router.push(destination as never);
        } else if (event === "PASSWORD_RECOVERY") {
          subscription.unsubscribe();
          router.push(destination as never);
        }
      }
    );

    // Fallback: if no auth event fires within 3 seconds, check session manually
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (session) {
        router.push(destination as never);
      } else {
        setError("Sign-in link expired or invalid. Please request a new one.");
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [locale, router, searchParams]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-amber-50/40 px-4">
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm text-center">
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={() => window.location.href = `/${locale}/auth`}
            className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-medium text-amber-50"
          >
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-amber-50/40 px-4">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-900 mx-auto" />
        <p className="text-amber-900 text-sm font-medium">Signing you in...</p>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-amber-50/40">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-900" />
      </main>
    }>
      <CallbackContent />
    </Suspense>
  );
}
