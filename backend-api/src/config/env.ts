import { config } from 'dotenv'
import { z } from 'zod'

config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_NAME: z.string().min(1).default('INVENTORY APP'),
  DEFAULT_TENANT_CODE: z.string().min(1).default('inventory-default'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_EXPIRES: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGIN: z.string().default('*'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SUPER_ADMIN_USERNAME: z.string().min(1).default('superadmin'),
  SUPER_ADMIN_PASSWORD: z.string().min(8).default('superadmin12345'),
  SUPER_ADMIN_EMAIL: z.string().email().default('superadmin@inventory.local'),
  SUPER_ADMIN_NAME: z.string().min(1).default('Super Admin'),
})

export const env = envSchema.parse(process.env)
