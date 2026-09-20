const encoder = new TextEncoder();
export const ACCOUNT_PASSWORD_REQUIREMENTS = "Usa al menos 12 caracteres, incluyendo letras y números (máximo 72 bytes)";

export function isValidAccountPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && encoder.encode(value).length <= 72 && /[a-z]/i.test(value) && /\d/.test(value);
}
