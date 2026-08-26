/**
 * Postgres reports a duplicate row as SQLSTATE 23505. Drizzle wraps driver
 * errors, so the code sits on a nested `cause` rather than the thrown error
 * itself, and the outer `message` is only the failed SQL — matching on its text
 * finds nothing. Walk the cause chain instead.
 */
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
