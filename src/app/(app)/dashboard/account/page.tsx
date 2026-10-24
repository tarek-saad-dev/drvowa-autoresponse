import { redirect } from "next/navigation";

/** Account is now part of settings; preserve old bookmarked URL. */
export default function AccountPage() {
  redirect("/dashboard/settings?tab=account");
}
