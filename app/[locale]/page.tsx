"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";

const languageMap = {
  en: "English",
  es: "Español",
  km: "ខ្មែរ"
} as const;

type SupportedLocale = keyof typeof languageMap;

export default function LocaleSelectionPage() {
  const t = useTranslations("language");
  const locale = useLocale() as SupportedLocale;
  const router = useRouter();
  const [detectedLocale, setDetectedLocale] = useState<SupportedLocale>(locale || "en");

  useEffect(() => {
    const browserLocale = navigator.language.split("-")[0] as SupportedLocale;
    if (browserLocale in languageMap) {
      setDetectedLocale(browserLocale);
    }
  }, []);

  const choices = useMemo(
    () => [
      { locale: "es" as const, label: t("spanish") },
      { locale: "km" as const, label: t("khmer") },
      { locale: "en" as const, label: t("english") }
    ],
    [t]
  );

  async function handleSelect(nextLocale: SupportedLocale) {
    localStorage.setItem("navigateai.locale", nextLocale);

    const {
      data: { user }
    } = await supabaseBrowser.auth.getUser();

    if (user) {
      await supabaseBrowser.from("users").upsert({
        id: user.id,
        email: user.email,
        language_preference: nextLocale
      });
    }

    router.push(`/${nextLocale}/onboard`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("detected", { locale: detectedLocale })}</p>

      <div className="mt-10 grid w-full gap-4 sm:grid-cols-3">
        {choices.map((choice) => (
          <Button
            key={choice.locale}
            size="lg"
            variant={choice.locale === detectedLocale ? "default" : "outline"}
            className="h-20 text-lg"
            onClick={() => handleSelect(choice.locale)}
          >
            {choice.label}
          </Button>
        ))}
      </div>
    </main>
  );
}
