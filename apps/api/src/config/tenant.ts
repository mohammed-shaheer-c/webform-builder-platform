import { prisma } from './prisma';

/**
 * Development Tenant Configuration.
 * In development without authentication, all operations are pinned to this tenant.
 * Client requests cannot override or specify another tenant ID.
 */
export const DEV_TENANT = {
  id: process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000001',
  name: 'Development Organization',
};

/**
 * Ensures that the development tenant exists in the database.
 * Upserts the tenant record idempotently.
 */
export async function ensureDevTenant(): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { id: DEV_TENANT.id },
    update: {},
    create: {
      id: DEV_TENANT.id,
      name: DEV_TENANT.name,
    },
  });

  return tenant.id;
}
