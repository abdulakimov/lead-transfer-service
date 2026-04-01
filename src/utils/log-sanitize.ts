const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  // Authorization/Bearer tokens
  [/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [MASKED]'],
  // Common token key-value pairs in messages/URLs
  [/(access_token=)[^&\s]+/gi, '$1[MASKED]'],
  [/(refresh_token=)[^&\s]+/gi, '$1[MASKED]'],
  [/(token=)[^&\s]+/gi, '$1[MASKED]'],
  [/(password=)[^&\s]+/gi, '$1[MASKED]'],
  // Secret-looking key names
  [/(app_secret=)[^&\s]+/gi, '$1[MASKED]'],
  [/(jwt_secret=)[^&\s]+/gi, '$1[MASKED]'],
  [/(encryption_key=)[^&\s]+/gi, '$1[MASKED]'],
  // Bitrix webhook URLs
  [/(https?:\/\/[^/\s]+\/rest\/\d+\/)[^/\s]+/gi, '$1[MASKED]'],
];

export function sanitizeLogMessage(input: string): string {
  let value = input;
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    value = value.replace(pattern, replacement);
  }
  return value;
}

export function formatErrorForLog(err: unknown): string {
  if (err instanceof Error) {
    const message = sanitizeLogMessage(err.message);
    const stack = err.stack ? sanitizeLogMessage(err.stack) : undefined;
    return stack ? `${message}\n${stack}` : message;
  }
  return sanitizeLogMessage(String(err));
}
