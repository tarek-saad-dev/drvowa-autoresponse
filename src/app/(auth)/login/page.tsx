import { redirect } from "next/navigation";

import { listBusinessesForUser } from "@/modules/businesses/service";
import { getCurrentSession } from "@/modules/auth/service";
import { resolvePostLoginPath } from "@/modules/auth/post-login-redirect";
import { isPlatformAdminUser } from "@/modules/platform-admin/service";

import LoginForm from "./login-form";

/**
 * Keep authenticated users out of the login screen.
 * A valid session (persistent or browser-session) is always authoritative.
 */
export default async function LoginPage() {
  const session = await getCurrentSession();

  if (session) {
    const [isPlatformAdmin, businesses] = await Promise.all([
      isPlatformAdminUser(session.userId),
      listBusinessesForUser(session.userId),
    ]);

    redirect(resolvePostLoginPath({
      isPlatformAdmin,
      hasBusiness: businesses.length > 0,
    }));
  }

  return <LoginForm />;
}
