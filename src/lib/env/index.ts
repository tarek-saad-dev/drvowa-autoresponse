/**
 * Environment variable access foundation.
 * Database and third-party clients are intentionally not configured yet.
 */
export type AppEnv = {
  nodeEnv: string;
  host: string | undefined;
  port: string | undefined;
};

export function getAppEnv(): AppEnv {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    host: process.env.HOST,
    port: process.env.PORT,
  };
}
