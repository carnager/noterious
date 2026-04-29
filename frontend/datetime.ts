export type DateTimeDisplayFormat = "browser" | "iso" | "de";

interface StructuredDateValue {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  hasTime: boolean;
}

let currentDisplayFormat: DateTimeDisplayFormat = "browser";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const timeOnlyPattern = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function normalizeDateTimeDisplayFormat(value: string | null | undefined): DateTimeDisplayFormat {
  switch (String(value || "").trim().toLowerCase()) {
    case "iso":
      return "iso";
    case "de":
      return "de";
    default:
      return "browser";
  }
}

export function setDateTimeDisplayFormat(value: string | null | undefined): void {
  currentDisplayFormat = normalizeDateTimeDisplayFormat(value);
}

export function currentDateTimeDisplayFormat(): DateTimeDisplayFormat {
  return currentDisplayFormat;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseStructuredDateValue(raw: string): StructuredDateValue | null {
  const text = String(raw || "").trim();
  const dateOnlyMatch = text.match(dateOnlyPattern);
  if (dateOnlyMatch) {
    return {
      year: Number(dateOnlyMatch[1]),
      month: Number(dateOnlyMatch[2]),
      day: Number(dateOnlyMatch[3]),
      hour: 0,
      minute: 0,
      second: 0,
      hasTime: false,
    };
  }

  const dateTimeMatch = text.match(dateTimePattern);
  if (!dateTimeMatch) {
    return null;
  }
  return {
    year: Number(dateTimeMatch[1]),
    month: Number(dateTimeMatch[2]),
    day: Number(dateTimeMatch[3]),
    hour: Number(dateTimeMatch[4]),
    minute: Number(dateTimeMatch[5]),
    second: Number(dateTimeMatch[6] || "0"),
    hasTime: true,
  };
}

function structuredDateFromDate(value: Date): StructuredDateValue {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
    hour: value.getHours(),
    minute: value.getMinutes(),
    second: value.getSeconds(),
    hasTime: true,
  };
}

function toLocalDate(structured: StructuredDateValue): Date {
  return new Date(
    structured.year,
    structured.month - 1,
    structured.day,
    structured.hour,
    structured.minute,
    structured.second,
    0
  );
}

function formatStructuredDate(structured: StructuredDateValue): string {
  if (currentDisplayFormat === "iso") {
    return [structured.year, pad(structured.month), pad(structured.day)].join("-");
  }

  const locale = currentDisplayFormat === "de" ? "de-DE" : undefined;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toLocalDate(structured));
}

function formatStructuredEditableDate(structured: StructuredDateValue): string {
  if (currentDisplayFormat === "de") {
    return [pad(structured.day), pad(structured.month), structured.year].join(".");
  }
  return [structured.year, pad(structured.month), pad(structured.day)].join("-");
}

function formatStructuredTime(structured: StructuredDateValue): string {
  if (currentDisplayFormat === "iso") {
    return [pad(structured.hour), pad(structured.minute), pad(structured.second)].join(":");
  }

  const locale = currentDisplayFormat === "de" ? "de-DE" : undefined;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(toLocalDate(structured));
}

function formatStructuredDateTime(structured: StructuredDateValue): string {
  if (!structured.hasTime) {
    return formatStructuredDate(structured);
  }
  if (currentDisplayFormat === "iso") {
    return formatStructuredDate(structured) + " " + [pad(structured.hour), pad(structured.minute)].join(":");
  }

  const locale = currentDisplayFormat === "de" ? "de-DE" : undefined;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(toLocalDate(structured));
}

function formatStructuredEditableDateTime(structured: StructuredDateValue): string {
  const datePart = formatStructuredEditableDate(structured);
  return datePart + " " + [pad(structured.hour), pad(structured.minute)].join(":");
}

function parseStructuredEditableDateValue(raw: string): StructuredDateValue | null {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      hour: 0,
      minute: 0,
      second: 0,
      hasTime: false,
    };
  }
  const deMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (deMatch) {
    return {
      year: Number(deMatch[3]),
      month: Number(deMatch[2]),
      day: Number(deMatch[1]),
      hour: 0,
      minute: 0,
      second: 0,
      hasTime: false,
    };
  }
  return null;
}

function parseStructuredEditableDateTimeValue(raw: string): StructuredDateValue | null {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      hour: Number(isoMatch[4]),
      minute: Number(isoMatch[5]),
      second: 0,
      hasTime: true,
    };
  }
  const deMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})$/);
  if (deMatch) {
    return {
      year: Number(deMatch[3]),
      month: Number(deMatch[2]),
      day: Number(deMatch[1]),
      hour: Number(deMatch[4]),
      minute: Number(deMatch[5]),
      second: 0,
      hasTime: true,
    };
  }
  return null;
}

function parseStructuredEditableTimeValue(raw: string): { hour: number; minute: number; second: number } | null {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }
  const match = text.match(timeOnlyPattern);
  if (!match) {
    return null;
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] || "0"),
  };
}

export function formatDateValue(value: string | Date): string {
  if (value instanceof Date) {
    return formatStructuredDate(structuredDateFromDate(value));
  }
  const structured = parseStructuredDateValue(value);
  if (!structured) {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? String(value || "") : formatStructuredDate(structuredDateFromDate(parsed));
  }
  return formatStructuredDate(structured);
}

export function formatEditableDateValue(value: string): string {
  const structured = parseStructuredDateValue(value);
  if (!structured) {
    return String(value || "");
  }
  return formatStructuredEditableDate(structured);
}

export function formatDateTimeValue(value: string | Date): string {
  if (value instanceof Date) {
    return formatStructuredDateTime(structuredDateFromDate(value));
  }
  const structured = parseStructuredDateValue(value);
  if (!structured) {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? String(value || "") : formatStructuredDateTime(structuredDateFromDate(parsed));
  }
  return formatStructuredDateTime(structured);
}

export function formatEditableDateTimeValue(value: string): string {
  const structured = parseStructuredDateValue(value);
  if (!structured) {
    return String(value || "");
  }
  return formatStructuredEditableDateTime(structured);
}

export function formatEditableTimeValue(value: string): string {
  const parsed = parseStructuredEditableTimeValue(value);
  if (!parsed) {
    return String(value || "");
  }
  return [pad(parsed.hour), pad(parsed.minute)].join(":");
}

export function formatTimeValue(value: string | Date): string {
  if (value instanceof Date) {
    return formatStructuredTime(structuredDateFromDate(value));
  }
  const parsedTime = parseStructuredEditableTimeValue(String(value || ""));
  if (parsedTime) {
    return [pad(parsedTime.hour), pad(parsedTime.minute)].join(":");
  }
  const structured = parseStructuredDateValue(value);
  if (!structured) {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? String(value || "") : formatStructuredTime(structuredDateFromDate(parsed));
  }
  return formatStructuredTime(structured);
}

export function parseEditableDateValue(value: string): string {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const structured = parseStructuredEditableDateValue(text);
  if (!structured) {
    throw new Error('Invalid date. Use "YYYY-MM-DD" or "DD.MM.YYYY".');
  }
  return [structured.year, pad(structured.month), pad(structured.day)].join("-");
}

export function parseEditableDateTimeValue(value: string): string {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const structured = parseStructuredEditableDateTimeValue(text);
  if (!structured) {
    throw new Error('Invalid date/time. Use "YYYY-MM-DD HH:MM" or "DD.MM.YYYY HH:MM".');
  }
  return [
    [structured.year, pad(structured.month), pad(structured.day)].join("-"),
    [pad(structured.hour), pad(structured.minute)].join(":"),
  ].join(" ");
}

export function parseEditableTimeValue(value: string): string {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const structured = parseStructuredEditableTimeValue(text);
  if (!structured) {
    throw new Error('Invalid time. Use "HH:MM".');
  }
  return [pad(structured.hour), pad(structured.minute)].join(":");
}

export function editableDatePlaceholder(): string {
  return currentDisplayFormat === "de" ? "30.04.2026" : "2026-04-30";
}

export function editableDateTimePlaceholder(): string {
  return currentDisplayFormat === "de" ? "30.04.2026 09:00" : "2026-04-30 09:00";
}

export function editableTimePlaceholder(): string {
  return "09:00";
}

function isNotificationClickKey(column: string): boolean {
  const normalized = String(column || "").trim().toLowerCase();
  return normalized === "click" || normalized.endsWith("_click") || normalized.endsWith("-click");
}

export function isDateLikeColumn(column: string): boolean {
  const normalized = String(column || "").trim().toLowerCase();
  if (isNotificationClickKey(normalized)) {
    return false;
  }
  return normalized === "due" ||
    normalized === "remind" ||
    normalized === "notify" ||
    normalized === "notification" ||
    normalized === "reminder" ||
    normalized === "createdat" ||
    normalized === "updatedat" ||
    normalized === "birthday" ||
    normalized === "birthday_reminder" ||
    normalized === "date" ||
    normalized === "datetime" ||
    normalized === "datum" ||
    /(^|_)(date|datum|due|remind|reminder|notify|notification|created|updated|birthday|time|timestamp)(_|$)/i.test(normalized);
}

export function formatMaybeDateValue(column: string, value: string): string {
  const text = String(value || "");
  if (!text.trim() || !isDateLikeColumn(column)) {
    return text;
  }
  if (String(column || "").trim().toLowerCase() === "remind") {
    const parsedTime = parseStructuredEditableTimeValue(text);
    if (parsedTime) {
      return [pad(parsedTime.hour), pad(parsedTime.minute)].join(":");
    }
  }
  const structured = parseStructuredDateValue(text);
  if (structured) {
    return structured.hasTime ? formatStructuredDateTime(structured) : formatStructuredDate(structured);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }
  return formatStructuredDateTime(structuredDateFromDate(parsed));
}
