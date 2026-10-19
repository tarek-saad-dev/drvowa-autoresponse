"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      rememberMe: form.has("rememberMe"),
    };

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(data.error ?? data.message ?? "تعذر تسجيل الدخول");
        return;
      }

      // Server computes redirectTo from TblPlatformAdmin + businesses (not client-trusted).
      const redirectTo =
        data.redirectTo === "/admin"
        || data.redirectTo === "/dashboard"
        || data.redirectTo === "/choose-plan"
          ? data.redirectTo
          : "/dashboard";

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال. حاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تسجيل الدخول</CardTitle>
        <CardDescription>ادخل إلى مساحة عملك في DRVO AutoRespond</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <div>
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              dir="ltr"
              className="text-start"
            />
          </div>
          <div>
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              dir="ltr"
              className="text-start"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="rememberMe" className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              تذكرني
            </label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              نسيت كلمة المرور؟
            </Link>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "جارٍ الدخول..." : "دخول"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="font-medium text-primary">
            إنشاء حساب
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
