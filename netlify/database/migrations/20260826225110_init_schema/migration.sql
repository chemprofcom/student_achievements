CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_first_time" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participations" (
	"id" serial PRIMARY KEY,
	"student_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"hours" integer NOT NULL,
	CONSTRAINT "participations_student_id_event_id_unique" UNIQUE("student_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY,
	"full_name" text NOT NULL,
	"group" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;