export function isValidSpanishPhone(value: string): boolean {
  const phone = value.replace(/[\s().-]/g, "");
  return !phone || /^(?:(?:\+|00)34)?[6789]\d{8}$/.test(phone);
}
