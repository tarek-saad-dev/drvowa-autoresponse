import { redirect } from "next/navigation";

/** Preserve legacy and onboarding links; QR and disconnect now live in settings. */
export default function WhatsAppPage() {
  redirect("/dashboard/settings?whatsapp=1");
}
