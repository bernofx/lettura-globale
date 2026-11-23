// Lets tests import app modules that use extensionless relative imports (as the
// bundler allows), by retrying the resolution with a ".ts"/".tsx" suffix.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !/^\.{1,2}\//.test(specifier)) throw error;
    for (const suffix of [".ts", ".tsx"]) {
      try { return await next(specifier + suffix, context); } catch { /* Try the next suffix. */ }
    }
    throw error;
  }
}
