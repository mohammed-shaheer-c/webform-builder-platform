import { Worker, Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getRedisConnectionOptions } from '../config/redis';
import { SUBMISSION_QUEUE_NAME, SubmissionJobData } from './submissionQueue';

/**
 * Core submission processor.
 * Only acknowledges job after PostgreSQL successfully persists the record.
 * Idempotent: uses submissionId as primary key in upsert, so retries or duplicate jobs never create duplicates.
 */
export async function processSubmissionJob(job: Job<SubmissionJobData>): Promise<void> {
  const { submissionId, tenantId, formId, formVersionId, data, submittedAt } = job.data;

  await prisma.submission.upsert({
    where: { id: submissionId },
    update: {}, // No-op if already processed: preserves strict idempotency
    create: {
      id: submissionId,
      tenantId,
      formId,
      formVersionId,
      data: data as Prisma.InputJsonValue,
      createdAt: new Date(submittedAt),
    },
  });
}

let submissionWorker: Worker<SubmissionJobData> | null = null;

/**
 * Initializes and starts the BullMQ background worker.
 */
export function startSubmissionWorker(): Worker<SubmissionJobData> {
  if (!submissionWorker) {
    submissionWorker = new Worker<SubmissionJobData>(
      SUBMISSION_QUEUE_NAME,
      async (job) => {
        await processSubmissionJob(job);
      },
      {
        connection: getRedisConnectionOptions(),
        concurrency: 5,
      }
    );

    submissionWorker.on('completed', (job) => {
      console.log(`[Worker] Submission job ${job.id} completed successfully`);
    });

    submissionWorker.on('failed', (job, err) => {
      console.error(`[Worker] Submission job ${job?.id} failed:`, err.message);
    });
  }

  return submissionWorker;
}

/**
 * Gracefully shuts down the BullMQ worker.
 */
export async function closeSubmissionWorker(): Promise<void> {
  if (submissionWorker) {
    await submissionWorker.close();
    submissionWorker = null;
  }
}
