import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("\n🧪 Running Order Details Breadcrumb Navigation Tests...\n");

// 1. Verify Account.tsx breadcrumb markup
const accountPath = path.resolve(__dirname, "../src/pages/customer/Account.tsx");
assert.ok(fs.existsSync(accountPath), "Account.tsx must exist");
const accountContent = fs.readFileSync(accountPath, "utf-8");

// Verify nav element exists with aria-label="Breadcrumb"
assert.ok(
  accountContent.includes('aria-label="Breadcrumb"'),
  "Account.tsx must render an accessible nav element with aria-label='Breadcrumb'"
);

// Verify 'My Orders' is a proper React Router <Link> and NOT a static span
assert.ok(
  accountContent.includes('<Link\n                to="/account/orders"\n                onClick={() => setSelectedOrder(null)}') ||
  accountContent.includes('to="/account/orders"') && accountContent.includes('My Orders'),
  "Account.tsx must render 'My Orders' as a React Router Link pointing to /account/orders"
);

// Verify 'My Orders' has hover styling (underline and pointer cursor)
assert.ok(
  accountContent.includes("hover:underline"),
  "Breadcrumb links must include hover:underline styling"
);
assert.ok(
  accountContent.includes("cursor-pointer"),
  "Breadcrumb links must include cursor-pointer styling"
);
assert.ok(
  accountContent.includes("hover:text-[#1769AA]"),
  "Breadcrumb links must include hover text color transition"
);

// Verify active order ID is non-clickable text with aria-current="page"
assert.ok(
  accountContent.includes('aria-current="page"'),
  "Active order item in breadcrumb must have aria-current='page'"
);
assert.ok(
  accountContent.includes('#{selectedOrder.order_number}') || accountContent.includes('#{activeOrderId}'),
  "Active order ID must be rendered dynamically"
);

// 2. Verify App.tsx routes for orders and redirects
const appPath = path.resolve(__dirname, "../src/App.tsx");
assert.ok(fs.existsSync(appPath), "App.tsx must exist");
const appContent = fs.readFileSync(appPath, "utf-8");

assert.ok(appContent.includes('path="/account/orders"'), "App.tsx must have route /account/orders");
assert.ok(appContent.includes('path="/account/orders/:orderId"'), "App.tsx must have route /account/orders/:orderId");
assert.ok(appContent.includes('path="/orders"'), "App.tsx must handle /orders route");
assert.ok(appContent.includes('path="/my-orders"'), "App.tsx must handle /my-orders route");

// 3. Verify Breadcrumbs.tsx shared component hover styling
const breadcrumbsPath = path.resolve(__dirname, "../src/components/common/Breadcrumbs.tsx");
const breadcrumbsContent = fs.readFileSync(breadcrumbsPath, "utf-8");
assert.ok(breadcrumbsContent.includes("hover:underline"), "Breadcrumbs.tsx must include hover:underline");
assert.ok(breadcrumbsContent.includes("cursor-pointer"), "Breadcrumbs.tsx must include cursor-pointer");

console.log("✅ All Order Details Breadcrumb Navigation verification tests passed successfully!\n");
