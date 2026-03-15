"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type AuthMode = "signIn" | "signUp";

function AuthContent() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const redirectPath = useMemo(() => {
    const redirect = searchParams.get("redirect");

    if (redirect && redirect.startsWith("/")) {
      return redirect;
    }

    return `/${locale}/onboard`;
  }, [locale, searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setMagicLinkSent(false);

    if (!email) {
      setError(t("error"));
      return;
    }

    if (mode === "signUp" && password.length < 8) {
      setError(t("passwordHint"));
      return;
    }

    setIsSubmitting(true);

    const { error: authError } =
      mode === "signIn"
        ? await supabaseBrowser.auth.signInWithPassword({ email, password })
        : await supabaseBrowser.auth.signUp({ email, password });

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message || t("error"));
      return;
    }

    const {
      data: { session }
    } = await supabaseBrowser.auth.getSession();

    if (!session) {
      // signUp succeeded but email confirmation is required
      setSuccessMessage("Account created! Please check your email to confirm your account, then sign in.");
      return;
    }

    router.push(redirectPath as never);
  }

  async function handleMagicLink() {
    setError(null);
    setMagicLinkSent(false);

    if (!email) {
      setError(t("error"));
      return;
    }

    setIsMagicLoading(true);

    const { error: otpError } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(redirectPath)}&locale=${locale}`
      }
    });

    setIsMagicLoading(false);

    if (otpError) {
      setError(otpError.message || t("error"));
      return;
    }

    setMagicLinkSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-amber-50/40 px-4 py-10">
      <section className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm">
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-amber-50 p-1">
          <button
            type="button"
            onClick={() => setMode("signIn")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === "signIn" ? "bg-amber-900 text-amber-50" : "text-amber-900 hover:bg-amber-100"
            }`}
          >
            {t("signIn")}
          </button>
          <button
            type="button"
            onClick={() => setMode("signUp")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === "signUp" ? "bg-amber-900 text-amber-50" : "text-amber-900 hover:bg-amber-100"
            }`}
          >
            {t("signUp")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-amber-900">{t("email")}</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm outline-none ring-amber-300 focus:ring"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-900">{t("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={mode === "signUp" ? 8 : undefined}
              className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm outline-none ring-amber-300 focus:ring"
              required
            />
            {mode === "signUp" && <p className="mt-1 text-xs text-amber-700">{t("passwordHint")}</p>}
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {successMessage && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>
          )}
          {magicLinkSent && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t("magicLinkSent")}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isMagicLoading}
            className="w-full rounded-xl bg-amber-900 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t("loading") : t("submit")}
          </button>
        </form>

        <div className="my-4 h-px bg-amber-100" />

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={isSubmitting || isMagicLoading}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isMagicLoading ? t("loading") : t("magicLink")}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((prev) => (prev === "signIn" ? "signUp" : "signIn"));
            setError(null);
            setMagicLinkSent(false);
          }}
          className="mt-4 w-full text-center text-sm text-amber-800 underline-offset-2 hover:underline"
        >
          {mode === "signIn" ? t("switchToSignUp") : t("switchToSignIn")}
        </button>
      </section>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-amber-50/40 px-4 py-10">
          <div className="text-amber-900">Cargando...</div>
        </main>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
