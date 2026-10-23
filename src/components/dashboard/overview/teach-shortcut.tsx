import Link from "next/link";

export function TeachShortcut() {
  return (
    <p className="text-sm text-muted-foreground">
      عايز تعلّم الموظف حاجة جديدة؟{" "}
      <Link
        href="/dashboard/knowledge"
        className="font-black text-primary transition hover:text-primary-hover"
      >
        علّمه معلومة
      </Link>
    </p>
  );
}
