import { getCurrentSession } from "@/modules/auth/service";

import { AuthError } from "./errors";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  fullName: string;
  sessionId: string;
  activeBusinessId: string | null;
};

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await getCurrentSession();
  if (!session) {
    throw new AuthError();
  }

  return {
    userId: session.userId,
    email: session.email,
    fullName: session.fullName,
    sessionId: session.sessionId,
    activeBusinessId: session.activeBusinessId,
  };
}
