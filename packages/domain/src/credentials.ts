const encoder = new TextEncoder();

export function isValidAccountPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && encoder.encode(value).length <= 72 && /[a-z]/i.test(value) && /\d/.test(value);
}
