/**
 * Process-level AI worker liveness — independent of per-job lease heartbeats.
 * Idle workers must still refresh this signal on every poll tick.
 */

import { query, sql } from "@/lib/db";

export const AI_WORKER_LIVENESS_KEY = "primary";

/** Stale after this age → worker treated as unavailable. */
export const AI_WORKER_LIVENESS_STALE_MS = 60_000;

export type AiWorkerLiveness = {
  available: boolean | null;
  lastHeartbeatAtUtc: Date | null;
  ageMs: number | null;
  workerId: string | null;
};

export async function touchAiWorkerLiveness(params: {
  workerId: string;
  livenessKey?: string;
}): Promise<void> {
  const key = params.livenessKey ?? AI_WORKER_LIVENESS_KEY;
  await query(
    `MERGE dbo.TblAiWorkerLiveness WITH (HOLDLOCK) AS target
     USING (SELECT @key AS LivenessKey) AS source
     ON target.LivenessKey = source.LivenessKey
     WHEN MATCHED THEN UPDATE SET
       WorkerId = @workerId,
       LastHeartbeatAtUtc = SYSUTCDATETIME(),
       UpdatedAtUtc = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (LivenessKey, WorkerId, LastHeartbeatAtUtc, UpdatedAtUtc)
       VALUES (@key, @workerId, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    [
      { name: "key", type: sql.NVarChar(32), value: key },
      { name: "workerId", type: sql.NVarChar(128), value: params.workerId.slice(0, 128) },
    ],
  );
}

export async function getAiWorkerLiveness(params?: {
  livenessKey?: string;
  now?: Date;
  staleMs?: number;
}): Promise<AiWorkerLiveness> {
  const key = params?.livenessKey ?? AI_WORKER_LIVENESS_KEY;
  const staleMs = params?.staleMs ?? AI_WORKER_LIVENESS_STALE_MS;
  const now = params?.now ?? new Date();

  try {
    const result = await query<{
      WorkerId: string;
      LastHeartbeatAtUtc: Date;
    }>(
      `SELECT TOP (1) WorkerId, LastHeartbeatAtUtc
       FROM dbo.TblAiWorkerLiveness
       WHERE LivenessKey = @key`,
      [{ name: "key", type: sql.NVarChar(32), value: key }],
    );

    const row = result.recordset[0];
    if (!row?.LastHeartbeatAtUtc) {
      return {
        available: false,
        lastHeartbeatAtUtc: null,
        ageMs: null,
        workerId: null,
      };
    }

    const at = new Date(row.LastHeartbeatAtUtc);
    const ageMs = Math.max(0, now.getTime() - at.getTime());
    return {
      available: ageMs <= staleMs,
      lastHeartbeatAtUtc: at,
      ageMs,
      workerId: row.WorkerId ?? null,
    };
  } catch {
    // Missing table / transient DB → unknown (never fake healthy).
    return {
      available: null,
      lastHeartbeatAtUtc: null,
      ageMs: null,
      workerId: null,
    };
  }
}
