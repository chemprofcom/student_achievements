import { getUser, verifyRequestOrigin, AuthError } from "@netlify/identity";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Guards an endpoint: state-changing requests are checked against their own
 * origin (the session lives in a cookie, so CSRF protection is required), then
 * the caller must be a signed-in user holding the `admin` role.
 *
 * Returns a Response to send back on failure, or null when the request may proceed.
 */
export async function requireAdmin(req: Request): Promise<Response | null> {
  if (!SAFE_METHODS.has(req.method)) {
    try {
      verifyRequestOrigin(req);
    } catch (err) {
      if (err instanceof AuthError) {
        return Response.json({ error: "Запрос отклонён: недопустимый источник" }, { status: 403 });
      }
      throw err;
    }
  }

  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Требуется вход в систему" }, { status: 401 });
  }
  if (!(user.roles ?? []).includes("admin")) {
    return Response.json({ error: "Недостаточно прав: требуется роль admin" }, { status: 403 });
  }
  return null;
}
