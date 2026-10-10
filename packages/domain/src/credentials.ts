const encoder = new TextEncoder();
export const ACCOUNT_PASSWORD_REQUIREMENTS = "Usa al menos 12 caracteres, incluyendo letras y números (máximo 72 bytes)";

export function isWithinAccountPasswordByteLimit(value: unknown): value is string {
  return typeof value === "string" && encoder.encode(value).length <= 72;
}

export function isValidAccountPassword(value: unknown): value is string {
  return isWithinAccountPasswordByteLimit(value) && value.length >= 12 && /[a-z]/i.test(value) && /\d/.test(value);
}
