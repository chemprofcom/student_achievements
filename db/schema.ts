import { pgTable, serial, text, integer, boolean, date, unique } from "drizzle-orm/pg-core";

export const students = pgTable("students", {
  id: serial().primaryKey(),
  fullName: text("full_name").notNull(),
  group: text().notNull().default(""),
});

export const events = pgTable("events", {
  id: serial().primaryKey(),
  name: text().notNull(),
  level: text().notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isFirstTime: boolean("is_first_time").notNull().default(false),
});

export const participations = pgTable("participations", {
  id: serial().primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  role: text().notNull().default(""),
  hours: integer().notNull(),
}, (table) => [
  unique().on(table.studentId, table.eventId),
]);
