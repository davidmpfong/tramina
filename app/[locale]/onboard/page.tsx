"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabaseBrowser } from "@/lib/supabase/client";

type OnboardState = {
  industry: string;
  zip_code: string;
  years_in_business: string;
  employee_count: string;
  revenue_range: "under_50k" | "50k_100k" | "100k_250k" | "250k_500k" | "500k_plus" | "";
  is_artist: boolean | null;
};

const businessTypes = ["retail", "restaurant", "services", "construction", "health", "creative", "technology", "other"] as const;
const revenueOptions = [
  { key: "r1", value: "under_50k" },
  { key: "r2", value: "50k_100k" },
  { key: "r3", value: "100k_250k" },
  { key: "r4", value: "250k_500k" },
  { key: "r5", value: "500k_plus" }
] as const;

export default function OnboardPage() {
  const t = useTranslations("onboard");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<OnboardState>({
    industry: "",
    zip_code: "",
    years_in_business: "",
    employee_count: "",
    revenue_range: "",
    is_artist: null
  });

  const totalSteps = 6;
  const progress = ((step + 1) / totalSteps) * 100;

  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return Boolean(form.industry);
      case 1:
        return Boolean(form.zip_code);
      case 2:
        return Boolean(form.years_in_business);
      case 3:
        return Boolean(form.employee_count);
      case 4:
        return Boolean(form.revenue_range);
      case 5:
        return form.is_artist !== null;
      default:
        return false;
    }
  }, [form, step]);

  async function handleContinue() {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
      return;
    }

    setIsSaving(true);

    const {
      data: { session }
    } = await supabaseBrowser.auth.getSession();

    const response = await fetch("/api/onboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({
        business_name: "My Business",
        industry: form.industry,
        zip_code: form.zip_code,
        years_in_business: Number(form.years_in_business),
        employee_count: Number(form.employee_count),
        revenue_range: form.revenue_range,
        is_artist: Boolean(form.is_artist),
        locale
      })
    });

    setIsSaving(false);

    if (response.ok) {
      const ctx = encodeURIComponent(
        `El usuario tiene un negocio de tipo ${form.industry} con ${form.years_in_business} años de operación y ${form.employee_count} empleados.`
      );
      router.push(`/${locale}/chat?ctx=${ctx}`);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-10">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-6">
        <p className="mb-2 text-sm text-muted-foreground">{t("progress", { current: step + 1, total: totalSteps })}</p>
        <Progress value={progress} />
      </div>

      <section className="mt-8 rounded-xl border bg-white p-6 shadow-sm">
        {step === 0 && (
          <>
            <p className="text-lg font-medium">{t("businessType")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {businessTypes.map((type) => (
                <Button
                  key={type}
                  variant={form.industry === type ? "default" : "outline"}
                  onClick={() => setForm((prev) => ({ ...prev, industry: type }))}
                >
                  {t(`chips.${type}`)}
                </Button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-lg font-medium">{t("zipCode")}</p>
            <input
              className="mt-4 w-full rounded-md border px-3 py-2"
              value={form.zip_code}
              onChange={(e) => setForm((prev) => ({ ...prev, zip_code: e.target.value }))}
              placeholder="94107"
            />
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-lg font-medium">{t("years")}</p>
            <input
              type="number"
              className="mt-4 w-full rounded-md border px-3 py-2"
              value={form.years_in_business}
              onChange={(e) => setForm((prev) => ({ ...prev, years_in_business: e.target.value }))}
              min={0}
              max={100}
            />
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-lg font-medium">{t("employees")}</p>
            <input
              type="number"
              className="mt-4 w-full rounded-md border px-3 py-2"
              value={form.employee_count}
              onChange={(e) => setForm((prev) => ({ ...prev, employee_count: e.target.value }))}
              min={0}
            />
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-lg font-medium">{t("revenue")}</p>
            <div className="mt-4 grid gap-2">
              {revenueOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={form.revenue_range === option.value ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      revenue_range: option.value
                    }))
                  }
                >
                  {t(`revenueBuckets.${option.key}`)}
                </Button>
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <p className="text-lg font-medium">{t("artist")}</p>
            <div className="mt-4 flex gap-3">
              <Button
                variant={form.is_artist === true ? "default" : "outline"}
                onClick={() => setForm((prev) => ({ ...prev, is_artist: true }))}
              >
                {tc("yes")}
              </Button>
              <Button
                variant={form.is_artist === false ? "default" : "outline"}
                onClick={() => setForm((prev) => ({ ...prev, is_artist: false }))}
              >
                {tc("no")}
              </Button>
            </div>
          </>
        )}
      </section>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          {tc("back")}
        </Button>
        <Button onClick={handleContinue} disabled={!canContinue || isSaving}>
          {isSaving ? tc("saving") : tc("continue")}
        </Button>
      </div>
    </main>
  );
}
