/**
 * Indian Mobile Phone Validation and Normalization Utilities.
 * 
 * Rules:
 * - Regex: ^[6-9][0-9]{9}$
 * - Exactly 10 digits national number starting with 6, 7, 8, or 9.
 * - Supports prefix formats: +91, 91 (12 digits), 0 (11 digits), or plain 10 digits.
 * - Preserves non-Indian E.164 international numbers if explicitly provided with country code.
 * - Standardized error message: "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9."
 */

export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
export const INDIAN_PHONE_ERROR_MESSAGE = "Enter a valid 10-digit mobile number starting with 6–9";

/**
 * Strips whitespace, dashes, dots, and parentheses from a phone string.
 */
export function cleanPhoneNumber(value: string): string {
  if (!value) return "";
  return value.trim().replace(/[\s\-().]/g, "");
}

/**
 * Sanitizes interactive text input on keystroke / paste:
 * Automatically strips any non-digit characters so letters or symbols cannot be typed or pasted.
 * Caps length strictly at 10 digits.
 */
export function sanitizePhoneInput(value: string): string {
  if (!value) return "";
  const cleaned = value.trim();

  // If user pasted with international prefix +91
  if (cleaned.startsWith("+91")) {
    const digitsAfter = cleaned.slice(3).replace(/\D/g, "");
    if (digitsAfter.length <= 10) {
      return digitsAfter;
    }
  }

  const onlyDigits = cleaned.replace(/\D/g, "");

  // If user pasted 12-digit number starting with 91
  if (onlyDigits.length === 12 && onlyDigits.startsWith("91")) {
    return onlyDigits.slice(2);
  }

  // If user pasted 11-digit number starting with 0
  if (onlyDigits.length === 11 && onlyDigits.startsWith("0")) {
    return onlyDigits.slice(1);
  }

  // Automatically strip all non-digits and cap strictly at 10 digits
  return onlyDigits.slice(0, 10);
}

/**
 * Formats a phone number for input display (extracting the clean 10-digit national number).
 */
export function formatPhoneForInput(value: string): string {
  if (!value) return "";
  const national = extractIndianNationalNumber(value);
  if (national) return national;
  return sanitizePhoneInput(value);
}

/**
 * Extracts the 10-digit national number from an Indian phone string.
 * Returns null if the number has an invalid structure or prefix.
 */
export function extractIndianNationalNumber(value: string): string | null {
  const cleaned = cleanPhoneNumber(value);
  if (!cleaned) return null;

  // Reject if letters or disallowed characters exist
  if (!/^[+0-9]+$/.test(cleaned)) {
    return null;
  }

  if (cleaned.startsWith("+91")) {
    const national = cleaned.slice(3);
    return national.length === 10 ? national : null;
  }

  if (cleaned.startsWith("+")) {
    // International non-Indian prefix
    return null;
  }

  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return cleaned.slice(2);
  }

  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return cleaned.slice(1);
  }

  if (cleaned.length === 10) {
    return cleaned;
  }

  return null;
}

/**
 * Validates whether the given phone string is a valid Indian mobile number
 * (or a valid international E.164 number if prefixed with another country code).
 */
export function isValidIndianPhone(value: string): boolean {
  if (!value) return false;
  const raw = value.trim();
  if (!raw) return false;

  // Reject if invalid characters
  if (!/^[+0-9\s\-()]+$/.test(raw)) {
    return false;
  }

  const cleaned = cleanPhoneNumber(raw);

  // International non-Indian check (+ followed by 7-15 digits)
  if (cleaned.startsWith("+") && !cleaned.startsWith("+91")) {
    return /^\+[1-9]\d{6,14}$/.test(cleaned);
  }

  const national = extractIndianNationalNumber(cleaned);
  if (!national) return false;

  return INDIAN_MOBILE_REGEX.test(national);
}

/**
 * Normalizes a valid phone number into standard international format (+91XXXXXXXXXX).
 * Throws an Error or returns normalized string.
 */
export function normalizeIndianPhone(value: string): string {
  const cleaned = cleanPhoneNumber(value);
  if (!cleaned) return "";

  if (cleaned.startsWith("+") && !cleaned.startsWith("+91")) {
    return cleaned;
  }

  const national = extractIndianNationalNumber(cleaned);
  if (national && INDIAN_MOBILE_REGEX.test(national)) {
    return `+91${national}`;
  }

  return cleaned;
}
