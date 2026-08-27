import type { Config } from "@netlify/functions";
import {
  getUser,
  login,
  logout,
  acceptInvite,
  recoverPassword,
  requestPasswordRecovery,
  verifyRequestOrigin,
  AuthError,
  MissingIdentityError,
  type User,
} from "@netlify/identity";

// Auth runs server-side so the browser needs no bundled Identity client: every
// action below sets or clears the `nf_jwt` cookie through the Functions runtime.
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
    return withAdminGate(() => login(String(email), String(password)), {
      noAdminMessage: "У этой учётной записи нет роли admin. Назначьте её в панели Netlify Identity.",
      describeError: (err) => {
        if (err.status === 400 || err.status === 401) {
          return /not confirmed/i.test(err.message)
            ? "Email не подтверждён. Перейдите по ссылке из письма-приглашения."
            : "Неверный email или пароль.";
        }
        return null;
      },
    });
  }

  // The link in a Netlify Identity invite email carries `#invite_token=...`;
  // the front end reads it from the URL hash and posts it here together with
  // the password the user just chose.
  if (action === "accept-invite") {
    const { token, password } = await req.json();
    if (!token || !password) {
      return Response.json({ error: "Некорректная ссылка приглашения" }, { status: 400 });
    }
    return withAdminGate(() => acceptInvite(String(token), String(password)), {
      noAdminMessage:
        "Пароль сохранён, но у этой учётной записи нет роли admin. Попросите администратора назначить роль " +
        "в панели Netlify Identity, затем войдите с этим паролем.",
      describeError: (err) => {
        if (err.status === 400 || err.status === 401 || err.status === 422) {
          return "Ссылка приглашения недействительна или уже использована. Попросите отправить новое приглашение.";
        }
        return null;
      },
    });
  }

  // The link in a password-recovery email carries `#recovery_token=...`.
  if (action === "recover") {
    const { token, password } = await req.json();
    if (!token || !password) {
      return Response.json({ error: "Некорректная ссылка восстановления" }, { status: 400 });
    }
    return withAdminGate(() => recoverPassword(String(token), String(password)), {
      noAdminMessage:
        "Пароль обновлён, но у этой учётной записи нет роли admin. Обратитесь к администратору, затем войдите " +
        "с этим паролем.",
      describeError: (err) => {
        if (err.status === 400 || err.status === 401 || err.status === 422) {
          return "Ссылка восстановления недействительна или устарела. Запросите новую на экране входа.";
        }
        return null;
      },
    });
  }

  if (action === "request-recovery") {
    const { email } = await req.json();
    if (!email) {
      return Response.json({ error: "Укажите email" }, { status: 400 });
    }
    try {
      await requestPasswordRecovery(String(email));
    } catch (err) {
      if (err instanceof MissingIdentityError) {
        return Response.json({ error: "Netlify Identity не настроен для этого сайта." }, { status: 503 });
      }
      // Any other failure (unknown email, signups disabled, etc.) is intentionally
      // swallowed below so the response can't be used to enumerate registered emails.
    }
    return Response.json({ ok: true });
  }

  return new Response("Not found", { status: 404 });
};

export const config: Config = {
  path: [
    "/api/auth/session",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/accept-invite",
    "/api/auth/recover",
    "/api/auth/request-recovery",
  ],
  method: ["GET", "POST"],
};

/**
 * Runs an Identity call that logs the user in (login, acceptInvite,
 * recoverPassword) and enforces the same rule everywhere a session cookie can
 * be created: accounts without the `admin` role are logged straight back out.
 */
async function withAdminGate(
  run: () => Promise<User>,
  opts: { describeError: (err: AuthError) => string | null; noAdminMessage: string },
): Promise<Response> {
  try {
    const user = await run();
    const isAdmin = (user.roles ?? []).includes("admin");
    if (!isAdmin) {
      await logout();
      return Response.json({ error: opts.noAdminMessage }, { status: 403 });
    }
    return Response.json({ authenticated: true, email: user.email, isAdmin });
  } catch (err) {
    if (err instanceof MissingIdentityError) {
      return Response.json({ error: "Netlify Identity не настроен для этого сайта." }, { status: 503 });
    }
    if (err instanceof AuthError) {
      const message = opts.describeError(err);
      if (message) return Response.json({ error: message }, { status: err.status ?? 401 });
      if (err.status === 422) {
        return Response.json({ error: "Некорректные данные." }, { status: 422 });
      }
      console.error("Identity action failed", err);
      return Response.json(
        { error: "Служба Identity недоступна. Проверьте, что Identity включён для сайта." },
        { status: 502 },
      );
    }
    // Anything else means the Identity service answered unexpectedly. Report it
    // as a service error instead of letting a stack trace reach the browser.
    console.error("Identity action failed", err);
    return Response.json({ error: "Служба Identity временно недоступна. Попробуйте позже." }, { status: 502 });
  }
}
