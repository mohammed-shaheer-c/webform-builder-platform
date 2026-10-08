import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis';

export interface SubmissionJobData {
  submissionId: string;
  tenantId: string;
  formId: string;
  formVersionId: string;
  data: Record<string, unknown>;
  submittedAt: string;
}

export const SUBMISSION_QUEUE_NAME = 'submissionQueue';

/**
 * BullMQ Submission Queue.
 * Configured with exponential retry, job retention, and Redis backend.
 */
export const submissionQueue = new Queue<SubmissionJobData>(SUBMISSION_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 3600, // Retain completed jobs for 24h
    },
    removeOnFail: {
      count: 5000,
    },
  },
});

/**
 * Enqueues a submission with the submission ID as the idempotency key (jobId).
 */
export async function addSubmissionJob(jobData: SubmissionJobData) {
  return submissionQueue.add('process-submission', jobData, {
    jobId: jobData.submissionId, // BullMQ deduplication by jobId
  });
}

export async function closeSubmissionQueue(): Promise<void> {
  await submissionQueue.close();
}
