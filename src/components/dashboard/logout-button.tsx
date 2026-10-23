"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LogoutButton({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={logout}
      disabled={loggingOut}
    >
      {loggingOut ? "جارٍ الخروج..." : "تسجيل الخروج"}
    </Button>
  );
}
