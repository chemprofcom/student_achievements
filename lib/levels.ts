export const LEVEL_CHOICES: [string, string][] = [
  ["course", "Курсовой"],
  ["faculty", "Факультетский"],
  ["interfaculty", "Межфакультетский"],
  ["university", "Университетский"],
  ["interuniversity", "Межуниверситетский"],
  ["regional", "Региональный"],
  ["interregional", "Межрегиональный"],
  ["all_russian", "Всероссийский"],
  ["international", "Международный"],
  ["chemistry_day", "День химика"],
  ["cabbage", "Капустник"],
  ["dedication", "Посвящение в химики"],
];

export const LEVEL_LABELS: Record<string, string> = Object.fromEntries(LEVEL_CHOICES);

export function levelLabel(code: string): string {
  return LEVEL_LABELS[code] ?? code;
}

// Maps free-text Russian level names (as found in uploaded spreadsheets) to level codes.
// Both the entries and their order are kept exactly as the previous importer had
// them, so existing spreadsheets keep importing to the same levels. Two
// consequences are intentional: "университетский" is tested before
// "межуниверситетский" and therefore wins for both, and "международный" has no
// entry at all, so a sheet using it is reported as having no recognised level.
export const LEVEL_TEXT_MAP: [string, string][] = [
  ["факультетский", "faculty"],
  ["курсовой", "course"],
  ["университетский", "university"],
  ["межфакультетский", "university"],
  ["межуниверситетский", "interuniversity"],
  ["региональный", "interuniversity"],
  ["всероссийский", "all_russian"],
  ["межрегиональный", "all_russian"],
  ["день химика", "chemistry_day"],
  ["капустник", "cabbage"],
  ["посвящение в химики", "dedication"],
];

export function levelFromText(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  for (const [phrase, code] of LEVEL_TEXT_MAP) {
    if (lower.includes(phrase)) return code;
  }
  return null;
}
