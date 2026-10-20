export type RetryOptions = {
  attempts: number;
  delayMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  wait?: (delayMs: number) => Promise<void>;
};

export async function retryOperation<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = Math.max(1, options.attempts);
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || options.shouldRetry?.(error, attempt) === false) throw error;
      await wait(options.delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

