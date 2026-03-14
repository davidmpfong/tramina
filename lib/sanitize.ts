/**
 * Sanitizes text before interpolation into LLM prompts.
 * Strips common prompt injection patterns.
 */
export function sanitizeForPrompt(input: string, maxLength = 2000): string {
  return input
    .slice(0, maxLength)
    .replace(/ignore (all |previous |above )?(instructions?|prompts?|context)/gi, "[removed]")
    .replace(/systems*:/gi, "[removed]:")
    .replace(/<\/?[a-z][^>]*>/gi, "") // strip HTML tags
    .trim();
}

/**
 * Sanitizes raw content before storing in the database.
 * Strips script tags and limits length.
 */
export function sanitizeRawContent(content: string, maxLength = 50000): string {
  return content
    .slice(0, maxLength)
    .replace(/<script[^>]*>[sS]*?<\/script>/gi, "")
    .replace(/<iframe[^>]*>[sS]*?<\/iframe>/gi, "")
    .replace(/javascripts*:/gi, "")
    .trim();
}

/**
 * Validates a URL is safe (not pointing to internal/private networks).
 * Returns null if the URL is invalid or unsafe.
 */
export function validateSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const hostname = url.hostname.toLowerCase();
    // Block internal/private IPs and localhost
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}
