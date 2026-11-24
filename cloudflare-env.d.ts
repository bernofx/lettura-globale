declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SESSIONS?: DurableObjectNamespace;
    SCHEDULED_IMAGE_JOBS?: Queue<{ id: string; generationId: string }>;
    SCHEDULED_IMAGES_ACCOUNT_ID?: string;
    SCHEDULED_IMAGES_MONTHLY_LIMIT?: string;
    OPENAI_API_KEY?: string;
  }
}
