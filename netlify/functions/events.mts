import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { events } from "../../db/schema.js";
import { requireAdmin } from "../../lib/auth.js";
import { LEVEL_CHOICES } from "../../lib/levels.js";

export default async (req: Request) => {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const id = new URL(req.url).searchParams.get("id");

  if (req.method === "GET") {
    const rows = await db.select().from(events).orderBy(events.startDate);
    return Response.json({ events: rows, levelChoices: LEVEL_CHOICES });
  }

  if (req.method === "POST" || req.method === "PUT") {
    if (req.method === "PUT" && !id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const level = String(body.level ?? "").trim();
    const startDate = String(body.startDate ?? "").trim();
    const endDate = String(body.endDate ?? "").trim();
    if (!name || !level || !startDate || !endDate) {
      return Response.json({ error: "name, level, startDate and endDate are required" }, { status: 400 });
    }
    const values = { name, level, startDate, endDate, isFirstTime: Boolean(body.isFirstTime) };

    const [row] =
      req.method === "POST"
        ? await db.insert(events).values(values).returning()
        : await db.update(events).set(values).where(eq(events.id, Number(id))).returning();

    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(row, { status: req.method === "POST" ? 201 : 200 });
  }

  if (req.method === "DELETE") {
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await db.delete(events).where(eq(events.id, Number(id)));
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/events",
  method: ["GET", "POST", "PUT", "DELETE"],
};
