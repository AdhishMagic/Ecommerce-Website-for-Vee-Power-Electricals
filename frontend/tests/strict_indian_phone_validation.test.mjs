import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("\n🧪 Running Strict Indian Mobile Number Validation Tests...\n");

// 1. Verify phoneValidation.ts module and exports
const phoneValidationPath = path.resolve(__dirname, "../src/utils/phoneValidation.ts");
assert.ok(fs.existsSync(phoneValidationPath), "phoneValidation.ts must exist");
const phoneValidationContent = fs.readFileSync(phoneValidationPath, "utf-8");

assert.ok(
  phoneValidationContent.includes("^[6-9]"),
  "Regex must enforce starting with 6-9"
);
assert.ok(
  phoneValidationContent.includes("Enter a valid 10-digit mobile number starting with 6–9"),
  "Must export standard error message 'Enter a valid 10-digit mobile number starting with 6–9'"
);
assert.ok(
  phoneValidationContent.includes("slice(0, 10)"),
  "sanitizePhoneInput must cap length at 10 digits"
);

// 2. Import and test phoneValidation utility logic in node
const {
  INDIAN_MOBILE_REGEX,
  INDIAN_PHONE_ERROR_MESSAGE,
  sanitizePhoneInput,
  isValidIndianPhone,
  formatPhoneForInput,
} = await import("../src/utils/phoneValidation.ts");

console.log("  ✓ Testing Regex and Error Message Constants...");
assert.equal(INDIAN_PHONE_ERROR_MESSAGE, "Enter a valid 10-digit mobile number starting with 6–9");
assert.ok(INDIAN_MOBILE_REGEX.test("9876543210"));
assert.ok(INDIAN_MOBILE_REGEX.test("8765432109"));
assert.ok(INDIAN_MOBILE_REGEX.test("7654321098"));
assert.ok(INDIAN_MOBILE_REGEX.test("6123456789"));
assert.ok(!INDIAN_MOBILE_REGEX.test("5123456789"), "Must reject numbers starting with 5");
assert.ok(!INDIAN_MOBILE_REGEX.test("0123456789"), "Must reject numbers starting with 0");
assert.ok(!INDIAN_MOBILE_REGEX.test("1234567890"), "Must reject numbers starting with 1");
assert.ok(!INDIAN_MOBILE_REGEX.test("Abcd"), "Must reject alphabetic strings");
assert.ok(!INDIAN_MOBILE_REGEX.test("987654321"), "Must reject 9-digit numbers");
assert.ok(!INDIAN_MOBILE_REGEX.test("98765432101"), "Must reject 11-digit numbers");

console.log("  ✓ Testing sanitizePhoneInput non-digit stripping on change...");
assert.equal(sanitizePhoneInput("Abcd"), "", "Must strip all alphabets");
assert.equal(sanitizePhoneInput("ABCD123456"), "123456", "Must strip letters and preserve digits");
assert.equal(sanitizePhoneInput("98765abc43210"), "9876543210", "Must strip embedded letters");
assert.equal(sanitizePhoneInput("98765 43210"), "9876543210", "Must strip spaces");
assert.equal(sanitizePhoneInput("+91 98765 43210"), "9876543210", "Must strip +91 prefix and spaces");
assert.equal(sanitizePhoneInput("09876543210"), "9876543210", "Must strip leading 0 prefix");
assert.equal(sanitizePhoneInput("919876543210"), "9876543210", "Must strip 91 prefix from 12-digit number");
assert.equal(sanitizePhoneInput("9876543210999"), "9876543210", "Must cap at 10 digits");

console.log("  ✓ Testing isValidIndianPhone validator function...");
assert.ok(isValidIndianPhone("9876543210"));
assert.ok(isValidIndianPhone("8765432109"));
assert.ok(isValidIndianPhone("7654321098"));
assert.ok(isValidIndianPhone("6123456789"));
assert.ok(isValidIndianPhone("+919876543210"));
assert.ok(!isValidIndianPhone("Abcd"));
assert.ok(!isValidIndianPhone("12345"));
assert.ok(!isValidIndianPhone("0000000000"));
assert.ok(!isValidIndianPhone("5123456789"));
assert.ok(!isValidIndianPhone(""));

console.log("  ✓ Testing formatPhoneForInput formatter function...");
assert.equal(formatPhoneForInput("+919876543210"), "9876543210");
assert.equal(formatPhoneForInput("09876543210"), "9876543210");
assert.equal(formatPhoneForInput("9876543210"), "9876543210");

// 3. Verify Account.tsx Address & Profile forms
console.log("  ✓ Verifying Account.tsx Address & Profile phone inputs & validation...");
const accountPath = path.resolve(__dirname, "../src/pages/customer/Account.tsx");
const accountContent = fs.readFileSync(accountPath, "utf-8");

// Address form checks
assert.ok(accountContent.includes('type="tel"'), "Account.tsx must set type='tel'");
assert.ok(accountContent.includes('inputMode="numeric"'), "Account.tsx must set inputMode='numeric'");
assert.ok(accountContent.includes("maxLength={10}"), "Account.tsx must set maxLength={10}");
assert.ok(accountContent.includes("handleAddressPhoneBlur"), "Account.tsx must validate address phone on blur");
assert.ok(accountContent.includes("addressPhoneError"), "Account.tsx must maintain inline addressPhoneError state");
assert.ok(accountContent.includes("setAddressPhoneError(INDIAN_PHONE_ERROR_MESSAGE)"), "Account.tsx must set standard error message on invalid address phone");

// Profile form checks
assert.ok(accountContent.includes("handleProfilePhoneBlur"), "Account.tsx must validate profile phone on blur");
assert.ok(accountContent.includes("profilePhoneError"), "Account.tsx must maintain inline profilePhoneError state");
assert.ok(accountContent.includes("setProfilePhoneError(INDIAN_PHONE_ERROR_MESSAGE)"), "Account.tsx must set standard error message on invalid profile phone");

// 4. Verify Checkout.tsx Address form
console.log("  ✓ Verifying Checkout.tsx delivery address phone input & validation...");
const checkoutPath = path.resolve(__dirname, "../src/pages/customer/Checkout.tsx");
const checkoutContent = fs.readFileSync(checkoutPath, "utf-8");

assert.ok(checkoutContent.includes('type="tel"'), "Checkout.tsx must set type='tel'");
assert.ok(checkoutContent.includes('inputMode="numeric"'), "Checkout.tsx must set inputMode='numeric'");
assert.ok(checkoutContent.includes("maxLength={10}"), "Checkout.tsx must set maxLength={10}");
assert.ok(checkoutContent.includes("handleCheckoutPhoneBlur"), "Checkout.tsx must validate phone on blur");
assert.ok(checkoutContent.includes("phoneError"), "Checkout.tsx must display inline phoneError");
assert.ok(checkoutContent.includes("setPhoneError(INDIAN_PHONE_ERROR_MESSAGE)"), "Checkout.tsx must set standard error message on invalid phone");

// 5. Verify Backend Serializers
console.log("  ✓ Verifying Backend Serializers phone field validators...");
const addressSerializerPath = path.resolve(__dirname, "../../backend/apps/users/serializers_address.py");
const addressSerializerContent = fs.readFileSync(addressSerializerPath, "utf-8");
assert.ok(addressSerializerContent.includes("def validate_phone"), "CustomerAddressSerializer must have validate_phone method");

const orderSerializerPath = path.resolve(__dirname, "../../backend/apps/orders/serializers.py");
const orderSerializerContent = fs.readFileSync(orderSerializerPath, "utf-8");
assert.ok(orderSerializerContent.includes("def validate_customer_phone"), "Order serializers must have validate_customer_phone method");
assert.ok(orderSerializerContent.includes("validate_indian_phone"), "Order serializers must use validate_indian_phone");

const backendValidatorsPath = path.resolve(__dirname, "../../backend/apps/common/validators.py");
const backendValidatorsContent = fs.readFileSync(backendValidatorsPath, "utf-8");
assert.ok(backendValidatorsContent.includes("Enter a valid 10-digit mobile number starting with 6–9"), "Backend must use updated standard error message");

console.log("\n✅ All Strict Indian Mobile Number Validation tests passed successfully!\n");
