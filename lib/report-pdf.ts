import PDFDocument from "pdfkit";
import { levelLabel } from "./levels.js";
import { loadDejaVuSansFont } from "./dejavu-sans-font.js";

/** ReportLab measured this layout in millimetres; PDF user space is in points. */
const MM = 2.834645669;

export interface ReportRow {
  startDate: string;
  endDate: string;
  eventName: string;
  level: string;
  role: string;
  hours: number;
}

// The source spreadsheets often lose the spaces around punctuation, so roles are
// normalised before they reach the report.
export function normaliseRole(raw: string): string {
  return raw
    .trim()
    .replaceAll("главныйорганизатор", "главный организатор")
    .replaceAll("главныйорган", "главный организатор")
    .replaceAll("организатор(отв.", "организатор (отв.")
    .replaceAll("отв.за", "отв. за")
    .replaceAll("отдельныйблок", "отдельный блок")
    .replaceAll("тех.части", "тех. части")
    .replaceAll("и.т.п.", "и т.п.")
    .replace(/\.([а-яa-z])/gi, ". $1")
    .split(/\s+/)
    .join(" ");
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function buildReportPdf(
  studentName: string,
  dateFrom: string,
  dateTo: string,
  rows: ReportRow[],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 20 * MM });
  // DejaVu Sans ships with the report because the built-in PDF fonts have no
  // Cyrillic glyphs; without it every letter would render as a blank box.
  doc.registerFont("DejaVuSans", loadDejaVuSansFont());
  doc.font("DejaVuSans");

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(16).text(`Отчёт по студенту: ${studentName}`);
  doc.moveDown(0.4);
  doc.fontSize(12).text(`Период: ${formatDate(dateFrom)} - ${formatDate(dateTo)}`);
  doc.moveDown(1);

  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const header = {
    backgroundColor: "#808080",
    textColor: "#f5f5f5",
    align: { x: "center" as const, y: "center" as const },
  };
  const totalCell = { backgroundColor: "#d3d3d3" };

  doc.fontSize(9);
  doc.table({
    columnStyles: [25 * MM, 25 * MM, 50 * MM, 30 * MM, 50 * MM, 15 * MM],
    defaultStyle: { border: 0.5, padding: 3 },
    data: [
      [
        { text: "Начало", ...header },
        { text: "Конец", ...header },
        { text: "Мероприятие", ...header },
        { text: "Уровень", ...header },
        { text: "Роль", ...header },
        { text: "Часы", ...header },
      ],
      ...rows.map((row) => [
        { text: formatDate(row.startDate), align: { x: "center" as const } },
        { text: formatDate(row.endDate), align: { x: "center" as const } },
        { text: row.eventName },
        { text: levelLabel(row.level) },
        { text: normaliseRole(row.role) },
        { text: String(row.hours), align: { x: "center" as const } },
      ]),
      [
        { text: "", ...totalCell },
        { text: "", ...totalCell },
        { text: "", ...totalCell },
        { text: "", ...totalCell },
        { text: "ИТОГО часов:", ...totalCell, align: { x: "right" as const } },
        { text: String(totalHours), ...totalCell, align: { x: "center" as const } },
      ],
    ],
  });

  doc.end();
  return finished;
}
