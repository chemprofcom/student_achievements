import type { Config } from "@netlify/functions";
import { getUser, login, logout, verifyRequestOrigin, AuthError, MissingIdentityError } from "@netlify/identity";

// Auth runs server-side so the browser needs no bundled Identity client: login
// and logout set and clear the `nf_jwt` cookie through the Functions runtime.
export default async (req: Request) => {
  const action = new URL(req.url).pathname.split("/").pop();

  if (req.method === "GET" && action === "session") {
    const user = await getUser();
    if (!user) return Response.json({ authenticated: false });
    return Response.json({
      authenticated: true,
      email: user.email,
      isAdmin: (user.roles ?? []).includes("admin"),
    });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    verifyRequestOrigin(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: "Запрос отклонён: недопустимый источник" }, { status: 403 });
    }
    throw err;
  }

  if (action === "logout") {
    await logout();
    return Response.json({ ok: true });
  }

  if (action === "login") {
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ error: "Укажите email и пароль" }, { status: 400 });
    }
    try {
      const user = await login(String(email), String(password));
      const isAdmin = (user.roles ?? []).includes("admin");
      if (!isAdmin) {
        await logout();
        return Response.json(
          { error: "У этой учётной записи нет роли admin. Назначьте её в панели Netlify Identity." },
          { status: 403 },
        );
      }
      return Response.json({ authenticated: true, email: user.email, isAdmin });
    } catch (err) {
      if (err instanceof MissingIdentityError) {
        return Response.json(
          { error: "Netlify Identity не настроен для этого сайта." },
          { status: 503 },
        );
      }
      if (err instanceof AuthError) {
        if (err.status === 400 || err.status === 401) {
          const message = /not confirmed/i.test(err.message)
            ? "Email не подтверждён. Перейдите по ссылке из письма-приглашения."
            : "Неверный email или пароль.";
          return Response.json({ error: message }, { status: 401 });
        }
        if (err.status === 403) {
          return Response.json({ error: "Вход запрещён для этой учётной записи." }, { status: 403 });
        }
        if (err.status === 422) {
          return Response.json({ error: "Некорректные данные для входа." }, { status: 422 });
        }
        console.error("Identity login failed", err);
        return Response.json(
          { error: "Служба входа недоступна. Проверьте, что Identity включён для сайта." },
          { status: 502 },
        );
      }
      // Anything else means the Identity service answered unexpectedly. Report it
      // as a service error instead of letting a stack trace reach the browser.
      console.error("Identity login failed", err);
      return Response.json(
        { error: "Служба входа временно недоступна. Попробуйте позже." },
        { status: 502 },
      );
    }
  }

  return new Response("Not found", { status: 404 });
};

export const config: Config = {
  path: ["/api/auth/session", "/api/auth/login", "/api/auth/logout"],
  method: ["GET", "POST"],
};
