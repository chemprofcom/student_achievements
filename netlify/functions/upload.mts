import type { Config } from "@netlify/functions";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { db, type Db } from "../../db/index.js";
import { students, events, participations } from "../../db/schema.js";
import { requireAdmin } from "../../lib/auth.js";
import { parseSheet, type ParsedSheet } from "../../lib/xlsx.js";

/**
 * Writes one parsed sheet to the database, reusing an event that already matches
 * name + dates. Takes its connection as an argument so the import can be run
 * against a throwaway Postgres in tests.
 */
export async function storeSheet(db: Db, sheet: ParsedSheet) {
  const [existingEvent] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.name, sheet.name),
        eq(events.startDate, sheet.startDate),
        eq(events.endDate, sheet.endDate),
      ),
    )
    .limit(1);

  const [event] = existingEvent
    ? await db
        .update(events)
        .set({ level: sheet.level, isFirstTime: sheet.isFirstTime })
        .where(eq(events.id, existingEvent.id))
        .returning()
    : await db
        .insert(events)
        .values({
          name: sheet.name,
          level: sheet.level,
          startDate: sheet.startDate,
          endDate: sheet.endDate,
          isFirstTime: sheet.isFirstTime,
        })
        .returning();

  let createdCount = 0;
  let updatedCount = 0;

  for (const participant of sheet.participants) {
    let [student] = await db
      .select()
      .from(students)
      .where(eq(students.fullName, participant.fullName))
      .limit(1);

    if (!student) {
      [student] = await db
        .insert(students)
        .values({ fullName: participant.fullName, group: participant.group })
        .returning();
    } else if (student.group !== participant.group) {
      [student] = await db
        .update(students)
        .set({ group: participant.group })
        .where(eq(students.id, student.id))
        .returning();
    }

    const [existing] = await db
      .select()
      .from(participations)
      .where(and(eq(participations.studentId, student.id), eq(participations.eventId, event.id)))
      .limit(1);

    if (existing) {
      await db
        .update(participations)
        .set({ role: participant.role, hours: participant.hours })
        .where(eq(participations.id, existing.id));
      updatedCount++;
    } else {
      await db.insert(participations).values({
        studentId: student.id,
        eventId: event.id,
        role: participant.role,
        hours: participant.hours,
      });
      createdCount++;
    }
  }

  return { eventCreated: !existingEvent, createdCount, updatedCount };
}

export default async (req: Request) => {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "Файл не передан" }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch (err) {
    return Response.json({ error: `Ошибка чтения файла: ${(err as Error).message}` }, { status: 400 });
  }

  let totalEventsCreated = 0;
  let totalParticipationsCreated = 0;
  let totalParticipationsUpdated = 0;
  const sheetMessages: string[] = [];
  const errorSheets: string[] = [];

  // One bad sheet must not discard the rest of the workbook.
  for (const worksheet of workbook.worksheets) {
    try {
      const sheet = parseSheet(worksheet);
      const result = await storeSheet(db, sheet);
      if (result.eventCreated) totalEventsCreated++;
      totalParticipationsCreated += result.createdCount;
      totalParticipationsUpdated += result.updatedCount;
      sheetMessages.push(
        `Лист "${worksheet.name}": ${sheet.name} — добавлено ${result.createdCount}, обновлено ${result.updatedCount}`,
      );
    } catch (err) {
      errorSheets.push(`${worksheet.name}: ${(err as Error).message}`);
    }
  }

  return Response.json({
    totalSheets: workbook.worksheets.length,
    successSheets: sheetMessages.length,
    totalEventsCreated,
    totalParticipationsCreated,
    totalParticipationsUpdated,
    sheetMessages,
    errorSheets,
  });
};

export const config: Config = {
  path: "/api/upload",
  method: ["POST"],
};
