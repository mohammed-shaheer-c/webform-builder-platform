import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from workspace root or current directory
const candidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

for (const envPath of candidatePaths) {
  dotenv.config({ path: envPath });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
