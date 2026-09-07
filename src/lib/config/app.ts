import { APP_DESCRIPTION, APP_NAME, APP_SERVICE_ID } from "@/constants/app";

/**
 * Application-level defaults.
 * Host/port for production bind come from environment variables, not hard-coded values.
 */
export const appConfig = {
  name: APP_NAME,
  service: APP_SERVICE_ID,
  description: APP_DESCRIPTION,
} as const;
