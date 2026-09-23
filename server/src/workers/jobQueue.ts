import { Job, IJob, JobType } from '../models/Job';
import { logger } from '../utils/logger';

export interface JobHandler {
  (job: IJob): Promise<void>;
}

export class JobQueue {
  private handlers = new Map<JobType, JobHandler>();
  private isRunning = false;
  private workerId: string;
  private intervalTimer?: NodeJS.Timeout;

  constructor(workerId = `worker_${process.pid}_${Math.random().toString(36).slice(2, 6)}`) {
    this.workerId = workerId;
  }

  registerHandler(type: JobType, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  async start(pollIntervalMs = 1000) {
    if (this.isRunning) return;
    this.isRunning = true;

    // Server Restart Safety: Recover stale locked jobs (lockedAt > 5 mins ago)
    await this.recoverStaleJobs();

    logger.info('JOB_QUEUE_STARTED', `Queue worker ${this.workerId} started`);

    this.intervalTimer = setInterval(() => {
      this.processNextJob().catch((err) => {
        logger.error('JOB_PROCESS_ERROR', err.message);
      });
    }, pollIntervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    logger.info('JOB_QUEUE_STOPPED', `Queue worker ${this.workerId} stopped`);
  }

  async recoverStaleJobs() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await Job.updateMany(
      {
        status: 'PROCESSING',
        lockedAt: { $lt: fiveMinutesAgo }
      },
      {
        $set: {
          status: 'QUEUED',
          lockedAt: null,
          lockedBy: null
        }
      }
    );

    if (result.modifiedCount > 0) {
      logger.warn('STALE_JOBS_RECOVERED', `Recovered ${result.modifiedCount} abandoned jobs on startup/poll`);
    }
  }

  async processNextJob(): Promise<boolean> {
    const now = new Date();

    // Atomic claim of next queued job
    const job = await Job.findOneAndUpdate(
      {
        status: 'QUEUED',
        runAt: { $lte: now }
      },
      {
        $set: {
          status: 'PROCESSING',
          lockedAt: now,
          lockedBy: this.workerId
        }
      },
      { new: true }
    );

    if (!job) return false;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.status = 'FAILED';
      job.lastError = `No handler registered for job type ${job.type}`;
      await job.save();
      return true;
    }

    try {
      await handler(job);
      if (job.status === 'PROCESSING') {
        job.status = 'COMPLETED';
        job.completedAt = new Date();
      }
      job.lockedAt = null;
      job.lockedBy = null;
      await job.save();
      return true;
    } catch (error: any) {
      job.attempts += 1;
      job.lastError = error.message;
      job.lockedAt = null;
      job.lockedBy = null;

      if (job.attempts >= job.maxAttempts) {
        job.status = 'FAILED';
        logger.error('JOB_FAILED_PERMANENTLY', `Job ${job._id} failed after ${job.attempts} attempts: ${error.message}`);
      } else {
        // Exponential backoff: 2^attempts seconds
        const delaySeconds = Math.pow(2, job.attempts);
        job.status = 'QUEUED';
        job.runAt = new Date(Date.now() + delaySeconds * 1000);
        logger.warn('JOB_RETRY_SCHEDULED', `Job ${job._id} will retry in ${delaySeconds}s (Attempt ${job.attempts}/${job.maxAttempts})`);
      }

      await job.save();
      return true;
    }
  }

  async enqueue(type: JobType, payload: Record<string, any>, runAt = new Date()): Promise<IJob> {
    return Job.create({
      type,
      payload,
      status: 'QUEUED',
      runAt,
      attempts: 0
    });
  }
}

export const globalJobQueue = new JobQueue();
