import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/campusflow'),
  SESSION_SECRET: z.string().min(16).default('campusflow_super_secret_session_key_32bytes_min'),
  JWT_SECRET: z.string().min(16).default('campusflow_jwt_access_secret_key_2026_x992'),
  JWT_REFRESH_SECRET: z.string().min(16).default('campusflow_jwt_refresh_secret_key_2026_y883'),
  ENCRYPTION_KEY: z.string().min(32).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  
  PAYMENT_MODE: z.enum(['test', 'live']).default('test'),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_mockKeyId123456'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_mockSecretKey789012'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_webhook_secret_mock998877'),
  
  WHATSAPP_PHONE_NUMBER_ID: z.string().default('109876543210987'),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default('987654321098765'),
  WHATSAPP_ACCESS_TOKEN: z.string().default('EAAG_mock_whatsapp_cloud_token_secure'),
  WHATSAPP_API_VERSION: z.string().default('v20.0'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('campusflow_whatsapp_webhook_token_secure'),
  WHATSAPP_PROVIDER: z.enum(['baileys', 'cloud_api', 'mock']).default('baileys'),
  MIN_SEND_INTERVAL_MS: z.coerce.number().default(10000),
  OUTBOUND_CONCURRENCY: z.coerce.number().default(1),
  CIRCUIT_BREAKER_FAILURES: z.coerce.number().default(5),

  GOOGLE_CLIENT_ID: z.string().optional().default('mock_google_client_id.apps.googleusercontent.com'),
  GOOGLE_CLIENT_SECRET: z.string().optional().default('mock_google_client_secret'),
  GOOGLE_REDIRECT_URI: z.string().optional().default('http://localhost:5000/api/connections/google/callback'),

  MICROSOFT_CLIENT_ID: z.string().optional().default('mock_microsoft_client_id'),
  MICROSOFT_CLIENT_SECRET: z.string().optional().default('mock_microsoft_client_secret'),
  MICROSOFT_REDIRECT_URI: z.string().optional().default('http://localhost:5000/api/connections/microsoft/callback'),

  AI_ENABLED: z.coerce.boolean().default(false),
  AI_PROVIDER_KEY: z.string().optional().default(''),

  CLIENT_URL: z.string().optional().default('https://xync.alphaprime.co.in'),
  APP_MODE: z.enum(['real', 'mock']).default('real'),
  USE_MOCK_PROVIDERS: z.coerce.boolean().default(false),

  RECAPTCHA_SITE_KEY: z.string().optional().default(''),
  RECAPTCHA_SECRET_KEY: z.string().optional().default('')
});

const parsed = envSchema.safeParse(process.env);

let envData: z.infer<typeof envSchema>;
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  // In serverless / production, fallback safely to defaults instead of crashing module import
  const fallback = envSchema.safeParse({});
  envData = fallback.success ? fallback.data : (process.env as any);
} else {
  envData = parsed.data;
}

export const env = envData;

export function isMockMode(): boolean {
  return env.APP_MODE === 'mock' ||
         env.USE_MOCK_PROVIDERS === true ||
         process.env.APP_MODE === 'mock' ||
         process.env.USE_MOCK_PROVIDERS === 'true';
}

