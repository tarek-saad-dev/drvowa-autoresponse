import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { APP_NAME } from "@/constants/app";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-8 text-center">
          <Link href="/" aria-label={APP_NAME} className="inline-block">
            <BrandLogo priority className="mx-auto h-11" />
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            منصة موظف الاستقبال الذكي
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
