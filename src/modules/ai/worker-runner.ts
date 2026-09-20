/**
 * Testable AI worker lifecycle: claim loop, heartbeats, graceful drain.
 */

import { closePool as defaultClosePool } from "@/lib/db";
import { processAiReplyJob, type AiJobLeaseContext } from "./orchestrator";
import {
  claimNextJob,
  extendLease as extendJobLease,
} from "./jobs-repository";
import {
  createAiWorkerId,
  resolveHeartbeatMs,
  resolveLeaseSeconds,
  resolveShutdownDeadlineMs,
} from "./lease";
import type { AiReplyJob } from "@/types/domain";

export type WorkerRunnerDeps = {
  claimNextJob?: typeof claimNextJob;
  processJob?: typeof processAiReplyJob;
  extendLease?: typeof extendJobLease;
  closePool?: () => Promise<void>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: {
    info: (...a: unknown[]) => void;
    warn: (...a: unknown[]) => void;
  };
  workerId?: string;
  concurrency?: number;
  pollMs?: number;
  leaseSeconds?: number;
  heartbeatMs?: number;
  shutdownDeadlineMs?: number;
};

type ActiveTask = {
  jobId: string;
  businessId: string;
  leaseToken: string;
  promise: Promise<void>;
  lost: boolean;
  heartbeat: ReturnType<typeof setInterval> | null;
};

export type WorkerRunnerResult = {
  reason: "clean" | "deadline_exceeded";
  activeAtExit: number;
  activeJobIds: string[];
};

export function createAiWorkerRunner(deps: WorkerRunnerDeps = {}) {
  const logger = deps.logger ?? console;
  const workerId = deps.workerId ?? createAiWorkerId();
  const concurrency = Math.max(1, Math.min(deps.concurrency ?? 2, 8));
  const pollMs = deps.pollMs ?? 250;
  const leaseSeconds = deps.leaseSeconds ?? resolveLeaseSeconds();
  const heartbeatMs = deps.heartbeatMs ?? resolveHeartbeatMs();
  const shutdownDeadlineMs = deps.shutdownDeadlineMs ?? resolveShutdownDeadlineMs();
  const claim = deps.claimNextJob ?? claimNextJob;
  const processJob = deps.processJob ?? processAiReplyJob;
  const extend = deps.extendLease ?? extendJobLease;
  const closePoolFn = deps.closePool ?? defaultClosePool;
  const sleep = deps.sleep
    ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;

  let stopping = false;
  let pollStopped = false;
  const active = new Map<string, ActiveTask>();
  let started = false;

  function stopHeartbeat(task: ActiveTask) {
    if (task.heartbeat) {
      clearInterval(task.heartbeat);
      task.heartbeat = null;
    }
  }

  function startHeartbeat(task: ActiveTask) {
    stopHeartbeat(task);
    task.heartbeat = setInterval(() => {
      void (async () => {
        if (task.lost) {
          stopHeartbeat(task);
          return;
        }
        try {
          const ok = await extend({
            businessId: task.businessId,
            jobId: task.jobId,
            leaseToken: task.leaseToken,
            leaseSeconds,
          });
          if (!ok) {
            task.lost = true;
            stopHeartbeat(task);
            logger.warn("[ai-worker] lease_lost", {
              jobId: task.jobId,
              phase: "heartbeat",
            });
          }
        } catch {
          task.lost = true;
          stopHeartbeat(task);
          logger.warn("[ai-worker] lease_lost", {
            jobId: task.jobId,
            phase: "heartbeat_error",
          });
        }
      })();
    }, heartbeatMs);
    if (typeof task.heartbeat.unref === "function") {
      task.heartbeat.unref();
    }
  }

  function requestShutdown() {
    if (stopping) return;
    stopping = true;
    logger.info("[ai-worker] shutting_down", {
      active: active.size,
    });
  }

  function runOne(job: AiReplyJob): void {
    const token = job.leaseToken;
    if (!token) {
      logger.warn("[ai-worker] claim_missing_lease_token", {
        jobId: job.aiReplyJobId,
      });
      return;
    }

    const task: ActiveTask = {
      jobId: job.aiReplyJobId,
      businessId: job.businessId,
      leaseToken: token,
      promise: Promise.resolve(),
      lost: false,
      heartbeat: null,
    };

    // Register before processJob so a synchronous throw cannot create a ghost task
    // (finally must not run delete-before-set).
    active.set(job.aiReplyJobId, task);

    const lease: AiJobLeaseContext = {
      token,
      isLost: () => task.lost,
      markLost: () => {
        task.lost = true;
        stopHeartbeat(task);
      },
    };

    startHeartbeat(task);

    const work = (async () => {
      try {
        await processJob({ job, lease, logger });
      } catch (error) {
        logger.warn("[ai-worker] failed", {
          jobId: job.aiReplyJobId,
          errorCode:
            error && typeof error === "object" && "code" in error
              ? String((error as { code: unknown }).code)
              : "WORKER_ERROR",
        });
      } finally {
        stopHeartbeat(task);
        active.delete(job.aiReplyJobId);
      }
    })();

    task.promise = work;
  }

  async function loop(): Promise<WorkerRunnerResult> {
    if (started) {
      throw new Error("AI worker runner already started");
    }
    started = true;
    logger.info("[ai-worker] started", {
      concurrency,
      pollMs,
      leaseSeconds,
      heartbeatMs,
      workerIdLength: workerId.length,
    });

    while (!stopping) {
      try {
        while (active.size < concurrency && !stopping) {
          const job = await claim({
            workerId,
            leaseSeconds,
          });
          if (!job) break;
          runOne(job);
        }
      } catch (error) {
        logger.warn("[ai-worker] loop_error", {
          errorCode: error instanceof Error ? error.name : "LOOP_ERROR",
        });
      }
      if (stopping) break;
      await sleep(pollMs);
    }

    pollStopped = true;

    // Drain: heartbeats continue for active owned tasks until each settles.
    const deadline = now() + shutdownDeadlineMs;
    while (active.size > 0 && now() < deadline) {
      await Promise.race([
        Promise.allSettled([...active.values()].map((t) => t.promise)),
        sleep(Math.min(100, Math.max(10, deadline - now()))),
      ]);
    }

    if (active.size === 0) {
      await closePoolFn();
      logger.info("[ai-worker] stopped_clean");
      return { reason: "clean", activeAtExit: 0, activeJobIds: [] };
    }

    const activeJobIds = [...active.keys()];
    logger.warn("[ai-worker] shutdown_deadline_reached", {
      active: active.size,
      jobIds: activeJobIds,
    });
    // Do not mark jobs FAILED / clear PROCESSING. Caller may force-exit.
    return {
      reason: "deadline_exceeded",
      activeAtExit: active.size,
      activeJobIds,
    };
  }

  return {
    workerId,
    requestShutdown,
    loop,
    getActiveCount: () => active.size,
    isStopping: () => stopping,
    isPollStopped: () => pollStopped,
  };
}
