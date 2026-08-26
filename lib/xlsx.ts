import type ExcelJS from "exceljs";
import { levelFromText } from "./levels.js";

const DATE_RE = /\d{1,2}\.\d{1,2}\.\d{4}/g;

export interface ParsedParticipant {
  fullName: string;
  group: string;
  role: string;
  hours: number;
}

export interface ParsedSheet {
  name: string;
  level: string;
  startDate: string;
  endDate: string;
  isFirstTime: boolean;
  participants: ParsedParticipant[];
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value as unknown;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if ("richText" in record) {
      return (record.richText as { text: string }[]).map((part) => part.text).join("");
    }
    // Formula cells expose the computed value under `result`.
    if ("result" in record) return String(record.result ?? "");
    if ("text" in record) return String(record.text ?? "");
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isEmpty(cell: ExcelJS.Cell): boolean {
  return cellText(cell).trim() === "";
}

function toIsoDate(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseRuDate(value: string): string | null {
  const [day, month, year] = value.split(".").map(Number);
  if (!day || !month || !year) return null;
  return toIsoDate(day, month, year);
}

/** Reads a "даты проведения" cell, which may hold a real date or a "дд.мм.гггг - дд.мм.гггг" range. */
export function parseDateCell(cell: ExcelJS.Cell): { startDate: string | null; endDate: string | null } {
  const raw = cell.value;
  if (raw instanceof Date) {
    const iso = toIsoDate(raw.getUTCDate(), raw.getUTCMonth() + 1, raw.getUTCFullYear());
    return { startDate: iso, endDate: iso };
  }

  const text = cellText(cell).trim();
  const matches = [...text.matchAll(DATE_RE)].map((match) => match[0]);

  if (matches.length >= 2) return { startDate: parseRuDate(matches[0]), endDate: parseRuDate(matches[1]) };
  if (matches.length === 1) {
    const iso = parseRuDate(matches[0]);
    return { startDate: iso, endDate: iso };
  }
  if (text.includes("-")) {
    const parts = text.split("-");
    if (parts.length === 2) {
      return { startDate: parseRuDate(parts[0].trim()), endDate: parseRuDate(parts[1].trim()) };
    }
  }
  return { startDate: null, endDate: null };
}

/**
 * Reads one worksheet in the layout the faculty uses: event metadata in the
 * first two rows, then a participant table starting at the "ФИО" header.
 * Throws with a user-facing Russian message when the sheet cannot be read.
 */
export function parseSheet(worksheet: ExcelJS.Worksheet): ParsedSheet {
  if (worksheet.rowCount < 2) throw new Error("Лист должен содержать минимум 2 строки");

  const headerRow = worksheet.getRow(1);
  const dataRow = worksheet.getRow(2);
  const columns: { name?: number; level?: number; dates?: number; firstTime?: number } = {};

  for (let col = 1; col <= headerRow.cellCount; col++) {
    const cell = headerRow.getCell(col);
    if (isEmpty(cell)) continue;
    const text = cellText(cell).trim().toLowerCase();
    if (text.includes("название мероприятия")) columns.name = col;
    else if (text.includes("уровень")) columns.level = col;
    else if (text.includes("даты проведения")) columns.dates = col;
    else if (text.includes("впервые") || text.includes("организовано")) columns.firstTime = col;
  }

  const name = columns.name && !isEmpty(dataRow.getCell(columns.name))
    ? cellText(dataRow.getCell(columns.name)).trim()
    : "";
  if (!name) throw new Error("Не найдено название мероприятия");

  const level = columns.level && !isEmpty(dataRow.getCell(columns.level))
    ? levelFromText(cellText(dataRow.getCell(columns.level)))
    : null;
  if (!level) throw new Error("Не определён уровень мероприятия");

  const { startDate, endDate } = columns.dates && !isEmpty(dataRow.getCell(columns.dates))
    ? parseDateCell(dataRow.getCell(columns.dates))
    : { startDate: null, endDate: null };
  if (!startDate || !endDate) throw new Error("Не определены даты проведения");

  let isFirstTime = false;
  if (columns.firstTime && !isEmpty(dataRow.getCell(columns.firstTime))) {
    const value = cellText(dataRow.getCell(columns.firstTime)).trim().toLowerCase();
    isFirstTime = ["да", "yes", "1", "true"].includes(value);
  }

  let firstParticipantRow: number | null = null;
  for (let row = 1; row <= worksheet.rowCount; row++) {
    if (cellText(worksheet.getRow(row).getCell(1)).includes("ФИО")) {
      firstParticipantRow = row + 1;
      break;
    }
  }
  if (firstParticipantRow === null) {
    throw new Error('Не найдена таблица с участниками (нет колонки "ФИО")');
  }

  const participants: ParsedParticipant[] = [];
  for (let row = firstParticipantRow; row <= worksheet.rowCount; row++) {
    const current = worksheet.getRow(row);
    const fullName = cellText(current.getCell(1)).trim();
    if (!fullName) continue;

    // Hour cells arrive as "10", "10 ч.", "+10" and similar, so keep the digits only.
    const digits = cellText(current.getCell(4)).replace(/[^\d]/g, "");
    const hours = digits ? parseInt(digits, 10) : 0;
    if (hours <= 0) continue;

    participants.push({
      fullName,
      group: cellText(current.getCell(2)).trim(),
      role: cellText(current.getCell(3)).trim(),
      hours,
    });
  }

  return { name, level, startDate, endDate, isFirstTime, participants };
}
