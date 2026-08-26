import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { participations, students, events } from "../../db/schema.js";
import { requireAdmin } from "../../lib/auth.js";
import { isUniqueViolation } from "../../lib/db-errors.js";

export default async (req: Request) => {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const id = new URL(req.url).searchParams.get("id");

  if (req.method === "GET") {
    const rows = await db
      .select({
        id: participations.id,
        role: participations.role,
        hours: participations.hours,
        studentId: participations.studentId,
        eventId: participations.eventId,
        studentName: students.fullName,
        eventName: events.name,
      })
      .from(participations)
      .innerJoin(students, eq(participations.studentId, students.id))
      .innerJoin(events, eq(participations.eventId, events.id))
      .orderBy(events.startDate);
    return Response.json(rows);
  }

  if (req.method === "POST" || req.method === "PUT") {
    if (req.method === "PUT" && !id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    const body = await req.json();
    const studentId = Number(body.studentId);
    const eventId = Number(body.eventId);
    const hours = Number(body.hours);
    if (!studentId || !eventId || !hours || hours <= 0) {
      return Response.json({ error: "studentId, eventId and a positive hours are required" }, { status: 400 });
    }
    const values = { studentId, eventId, hours, role: String(body.role ?? "").trim() };

    try {
      const [row] =
        req.method === "POST"
          ? await db.insert(participations).values(values).returning()
          : await db.update(participations).set(values).where(eq(participations.id, Number(id))).returning();

      if (!row) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json(row, { status: req.method === "POST" ? 201 : 200 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Response.json(
          { error: "У этого студента уже есть запись об участии в этом мероприятии" },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  if (req.method === "DELETE") {
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await db.delete(participations).where(eq(participations.id, Number(id)));
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/participations",
  method: ["GET", "POST", "PUT", "DELETE"],
};
