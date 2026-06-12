import type { ParsedJD } from '../api/jd-parser/route';

// attempt to extract completed string fields from partial JSON
export function extractCompletedFields(json: string): Partial<ParsedJD> {
  const result: Partial<ParsedJD> = {};

  // match completed string fields: "key": "value"
  const stringPattern = /"(\w+)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*[,}]/g;
  let match;
  while ((match = stringPattern.exec(json)) !== null) {
    const [, key, value] = match;
    (result as Record<string, string>)[key] = value;
  }

  // match completed array fields: "key": ["item1", "item2"]
  const arrayPattern = /"(\w+)"\s*:\s*\[([^\]]*)\]/g;
  while ((match = arrayPattern.exec(json)) !== null) {
    const [, key, items] = match;
    const parsed =
      items.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)?.map((s) => s.slice(1, -1)) ??
      [];
    if (parsed.length > 0) {
      (result as Record<string, string[]>)[key] = parsed;
    }
  }

  return result;
}
