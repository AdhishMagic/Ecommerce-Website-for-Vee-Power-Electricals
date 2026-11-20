import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appPath = path.resolve(__dirname, "../src/App.tsx");
const accountPath = path.resolve(__dirname, "../src/pages/customer/Account.tsx");

describe("Issue 4: My Orders Breadcrumb Navigation & Routing", () => {
  test("1. Route /account/orders/:orderId is registered in App.tsx", () => {
    const appContent = fs.readFileSync(appPath, "utf-8");
    assert.match(
      appContent,
      /<Route\s+path="\/account\/orders\/:orderId"\s+element=\{<ProtectedRoute\s+allowedRoles=\{\["customer",\s*"admin"\]\}>/,
      "App.tsx must define /account/orders/:orderId protected customer route"
    );
  });

  test("2. Canonical My Orders route /account/orders is registered in App.tsx", () => {
    const appContent = fs.readFileSync(appPath, "utf-8");
    assert.match(
      appContent,
      /<Route\s+path="\/account\/orders"\s+element=\{<ProtectedRoute\s+allowedRoles=\{\["customer",\s*"admin"\]\}>/,
      "App.tsx must define /account/orders protected customer route"
    );
  });

  test("3. Account.tsx imports react-router-dom navigation hooks", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    assert.match(
      accountContent,
      /import\s*\{[^}]*Link[^}]*useLocation[^}]*useNavigate[^}]*useParams[^}]*useSearchParams[^}]*\}\s*from\s*"react-router-dom"/,
      "Account.tsx must import Link, useLocation, useNavigate, useParams, and useSearchParams"
    );
  });

  test("4. Account.tsx extracts orderId and query params", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    assert.match(
      accountContent,
      /useParams<\{\s*orderId\?: string\s*\}>/,
      "Account.tsx must extract orderId using useParams"
    );
    assert.match(
      accountContent,
      /const activeOrderId = orderId \|\| searchParams\.get\("order_id"\) \|\| searchParams\.get\("order"\)/,
      "Account.tsx must resolve activeOrderId from route param or search params"
    );
  });

  test("5. Account.tsx renders clickable Link to /account/orders in Breadcrumb when order is selected", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    assert.match(
      accountContent,
      /<Link[\s\S]*?to="\/account\/orders"[\s\S]*?onClick=\{\(\) => setSelectedOrder\(null\)\}[\s\S]*?>[\s\S]*?My Orders[\s\S]*?<\/Link>/,
      "Breadcrumb must render a clickable Link to /account/orders when an order is selected"
    );
  });

  test("6. Breadcrumb Link includes proper accessible hover, focus and cursor styling", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    const linkMatch = accountContent.match(
      /<Link[\s\S]*?to="\/account\/orders"[\s\S]*?className="([^"]+)"[\s\S]*?>[\s\S]*?My Orders/
    );
    assert.ok(linkMatch, "Breadcrumb Link to /account/orders must have className");
    const classList = linkMatch[1];
    assert.ok(classList.includes("hover:text-[#1769AA]"), "Must have hover:text-[#1769AA]");
    assert.ok(classList.includes("focus-visible:outline-none"), "Must have focus-visible:outline-none");
    assert.ok(classList.includes("focus-visible:ring-1"), "Must have focus-visible:ring-1");
    assert.ok(classList.includes("cursor-pointer"), "Must have cursor-pointer");
  });

  test("7. Active order number in breadcrumb has aria-current='page'", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    assert.match(
      accountContent,
      /<span className="text-\[#1769AA\] font-mono font-semibold" aria-current="page">\s*#\{selectedOrder\.order_number\}\s*<\/span>/,
      "Active order number must be marked with aria-current='page'"
    );
  });

  test("8. OrderCard onViewDetails invokes navigate to /account/orders/:orderId", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    assert.match(
      accountContent,
      /navigate\(`\/account\/orders\/\$\{id\}`\)/,
      "handleViewOrder must navigate to /account/orders/:id"
    );
  });

  test("9. OrderDetailView onBack navigates to /account/orders and clears selectedOrder", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    assert.match(
      accountContent,
      /onBack=\{\(\) => \{\s*setSelectedOrder\(null\);\s*navigate\("\/account\/orders"\);\s*\}\}/,
      "OrderDetailView onBack must navigate to /account/orders and reset selectedOrder"
    );
  });

  test("10. Direct order detail loading skeleton is displayed during URL param load", () => {
    const accountContent = fs.readFileSync(accountPath, "utf-8");
    assert.match(
      accountContent,
      /activeOrderId && selectedOrderLoading/,
      "Account.tsx must display order loading view when activeOrderId is present and loading"
    );
  });
});
