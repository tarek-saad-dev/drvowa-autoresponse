"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "تعذر إرسال الطلب");
        return;
      }
      setDone(true);
    } catch {
      setError("حدث خطأ في الاتصال. حاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>استعادة كلمة المرور</CardTitle>
        <CardDescription>
          أدخل بريدك وسنرسل رابط إعادة التعيين إن وُجد حساب مرتبط به.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-4">
            <Alert variant="success">
              إن وُجد حساب بهذا البريد، ستصل تعليمات إعادة التعيين قريباً.
            </Alert>
            <p className="text-center text-sm">
              <Link href="/login" className="font-medium text-primary">
                العودة لتسجيل الدخول
              </Link>
            </p>
          </div>
        ) : (
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
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary">
                العودة لتسجيل الدخول
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
