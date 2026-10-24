import { redirect } from "next/navigation";

/** Preserve historical usage links while using one canonical subscription page. */
export default function UsagePage() {
  redirect("/dashboard/billing");
}
