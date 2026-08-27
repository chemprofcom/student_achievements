import type { Config } from "@netlify/functions";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { participations, students, events } from "../../db/schema.js";
import { requireAdmin } from "../../lib/auth.js";
import { buildReportPdf } from "../../lib/report-pdf.js";

export default async (req: Request) => {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const studentId = Number(url.searchParams.get("studentId"));
  const dateFrom = url.searchParams.get("dateFrom") ?? "";
  const dateTo = url.searchParams.get("dateTo") ?? "";
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  if (!studentId || !dateFrom || !dateTo) {
    return Response.json({ error: "studentId, dateFrom and dateTo are required" }, { status: 400 });
  }
  // Postgres rejects a malformed date with a query error rather than an empty
  // result, so a bad value here has to be caught before it reaches the query
  // — otherwise the function crashes instead of returning a normal response.
  if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo)) {
    return Response.json({ error: "Некорректный формат даты" }, { status: 400 });
  }

  try {
    const [student] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
    if (!student) return Response.json({ error: "Студент не найден" }, { status: 404 });

    const rows = await db
      .select({
        startDate: events.startDate,
        endDate: events.endDate,
        eventName: events.name,
        level: events.level,
        role: participations.role,
        hours: participations.hours,
      })
      .from(participations)
      .innerJoin(events, eq(participations.eventId, events.id))
      .where(
        and(
          eq(participations.studentId, studentId),
          gte(events.startDate, dateFrom),
          lte(events.startDate, dateTo),
        ),
      )
      .orderBy(events.startDate);

    const pdf = await buildReportPdf(student.fullName, dateFrom, dateTo, rows);
    const filename = `report_${student.id}_${dateFrom}_${dateTo}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Report generation failed", err);
    return Response.json({ error: "Не удалось сформировать отчёт. Попробуйте позже." }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/report",
  method: ["GET"],
};
