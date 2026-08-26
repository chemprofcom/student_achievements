import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { students } from "../../db/schema.js";
import { requireAdmin } from "../../lib/auth.js";

export default async (req: Request) => {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const id = new URL(req.url).searchParams.get("id");

  if (req.method === "GET") {
    const rows = await db.select().from(students).orderBy(students.fullName);
    return Response.json(rows);
  }

  if (req.method === "POST") {
    const body = await req.json();
    const fullName = String(body.fullName ?? "").trim();
    if (!fullName) return Response.json({ error: "fullName is required" }, { status: 400 });
    const [row] = await db
      .insert(students)
      .values({ fullName, group: String(body.group ?? "").trim() })
      .returning();
    return Response.json(row, { status: 201 });
  }

  if (req.method === "PUT") {
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const body = await req.json();
    const fullName = String(body.fullName ?? "").trim();
    if (!fullName) return Response.json({ error: "fullName is required" }, { status: 400 });
    const [row] = await db
      .update(students)
      .set({ fullName, group: String(body.group ?? "").trim() })
      .where(eq(students.id, Number(id)))
      .returning();
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(row);
  }

  if (req.method === "DELETE") {
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await db.delete(students).where(eq(students.id, Number(id)));
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/students",
  method: ["GET", "POST", "PUT", "DELETE"],
};
