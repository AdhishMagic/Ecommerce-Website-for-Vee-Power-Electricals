import assert from "node:assert/strict";
import test from "node:test";

// Recreate the pure logic of phoneValidation to test directly in Node environment
const INDIAN_MOBILE_REGEX = /^[6-9][0-9]{9}$/;
const INDIAN_PHONE_ERROR_MESSAGE = "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.";

function cleanPhoneNumber(value) {
  if (!value) return "";
  return value.trim().replace(/[\s\-().]/g, "");
}

function sanitizePhoneInput(value) {
  if (!value) return "";
  return value.replace(/[^\d+\s\-()]/g, "").slice(0, 16);
}

function extractIndianNationalNumber(value) {
  const cleaned = cleanPhoneNumber(value);
  if (!cleaned) return null;

  if (!/^[+0-9]+$/.test(cleaned)) {
    return null;
  }

  if (cleaned.startsWith("+91")) {
    const national = cleaned.slice(3);
    return national.length === 10 ? national : null;
  }

  if (cleaned.startsWith("+")) {
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

function isValidIndianPhone(value) {
  if (!value) return false;
  const raw = value.trim();
  if (!raw) return false;

  if (!/^[+0-9\s\-()]+$/.test(raw)) {
    return false;
  }

  const cleaned = cleanPhoneNumber(raw);

  if (cleaned.startsWith("+") && !cleaned.startsWith("+91")) {
    return /^\+[1-9]\d{6,14}$/.test(cleaned);
  }

  const national = extractIndianNationalNumber(cleaned);
  if (!national) return false;

  return INDIAN_MOBILE_REGEX.test(national);
}

function normalizeIndianPhone(value) {
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

test("Section 7 Test Matrix - Indian Mobile Number Validation", async (t) => {
  const testCases = [
    { input: "9876543210", expected: true, desc: "Valid starting with 9" },
    { input: "8765432109", expected: true, desc: "Valid starting with 8" },
    { input: "7654321098", expected: true, desc: "Valid starting with 7" },
    { input: "6123456789", expected: true, desc: "Valid starting with 6" },
    { input: "5123456789", expected: false, desc: "Invalid starting with 5" },
    { input: "0123456789", expected: false, desc: "Invalid starting with 0 (10 digits)" },
    { input: "1234567890", expected: false, desc: "Invalid starting with 1" },
    { input: "0000000000", expected: false, desc: "Invalid all zeros" },
    { input: "987654321", expected: false, desc: "Invalid incomplete (9 digits)" },
    { input: "98765432101", expected: false, desc: "Invalid oversized (11 digits)" },
    { input: "ABCD123456", expected: false, desc: "Invalid alphabets with digits" },
    { input: "Abcd", expected: false, desc: "Invalid alphabets" },
    { input: "98765ABCDE", expected: false, desc: "Invalid trailing alphabets" },
    { input: "", expected: false, desc: "Invalid empty string" },
    { input: "   ", expected: false, desc: "Invalid whitespace string" },
    // Prefix variations
    { input: "+919876543210", expected: true, desc: "Valid with +91 prefix" },
    { input: "+91 98765 43210", expected: true, desc: "Valid with +91 and spaces" },
    { input: "09876543210", expected: true, desc: "Valid with leading 0 (11 digits)" },
    { input: "919876543210", expected: true, desc: "Valid with 91 prefix (12 digits)" },
  ];

  for (const tc of testCases) {
    await t.test(`${tc.desc}: "${tc.input}" -> ${tc.expected}`, () => {
      const result = isValidIndianPhone(tc.input);
      assert.equal(result, tc.expected);
    });
  }
});

test("Normalization of Valid Indian Phone Numbers", async (t) => {
  const normCases = [
    { input: "9876543210", expected: "+919876543210" },
    { input: "+919876543210", expected: "+919876543210" },
    { input: "+91 98765 43210", expected: "+919876543210" },
    { input: "09876543210", expected: "+919876543210" },
    { input: "919876543210", expected: "+919876543210" },
    { input: "8765432109", expected: "+918765432109" },
    { input: "7654321098", expected: "+917654321098" },
    { input: "6123456789", expected: "+916123456789" },
  ];

  for (const nc of normCases) {
    await t.test(`Normalize "${nc.input}" -> "${nc.expected}"`, () => {
      assert.equal(normalizeIndianPhone(nc.input), nc.expected);
    });
  }
});

test("Sanitization of Phone Input", () => {
  assert.equal(sanitizePhoneInput("Abcd"), "");
  assert.equal(sanitizePhoneInput("98765ABCDE"), "98765");
  assert.equal(sanitizePhoneInput("+91 98765 43210"), "+91 98765 43210");
  assert.equal(sanitizePhoneInput("12345678901234567890"), "1234567890123456"); // Capped at 16
});
