"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function AdminLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={logout}
      disabled={pending}
      className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800 hover:text-white"
    >
      {pending ? "..." : "تسجيل الخروج"}
    </Button>
  );
}
