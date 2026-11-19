import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("\n🧪 Running Order Cancellation Modal & Workflow Tests...\n");

// 1. Verify OrderCancellationModal component file exists and exports required constants/components
const modalPath = path.resolve(__dirname, "../src/components/customer/OrderCancellationModal.tsx");
assert.ok(fs.existsSync(modalPath), "OrderCancellationModal.tsx must exist");
const modalContent = fs.readFileSync(modalPath, "utf-8");

assert.ok(modalContent.includes("Cancel Your Order?"), "Modal must contain title 'Cancel Your Order?'");
assert.ok(
  modalContent.includes("Are you sure you want to cancel this order? This action may not be reversible."),
  "Modal must contain description 'Are you sure you want to cancel this order? This action may not be reversible.'"
);
assert.ok(modalContent.includes("Confirm Cancellation"), "Modal must have 'Confirm Cancellation' button");
assert.ok(modalContent.includes("Keep Order"), "Modal must have 'Keep Order' button");

// Check the 6 required reason options
const requiredReasons = [
  "Ordered by mistake",
  "Found a better price elsewhere",
  "Delivery taking too long",
  "Ordered incorrect products",
  "Changed my mind",
  "Other",
];
for (const reason of requiredReasons) {
  assert.ok(
    modalContent.includes(reason),
    `Modal must include cancellation reason option: "${reason}"`
  );
}

// Check keyboard Escape and backdrop click listeners
assert.ok(modalContent.includes('e.key === "Escape"'), "Modal must close on Escape key without cancelling");
assert.ok(modalContent.includes("handleBackdropClick"), "Modal must close on outer backdrop click");
assert.ok(modalContent.includes("e.stopPropagation()"), "Modal must prevent clicks inside modal from closing");

// Check submission states and loading spinner
assert.ok(modalContent.includes("Cancelling Order..."), "Modal must show cancelling loading indicator");
assert.ok(modalContent.includes("isSubmitting"), "Modal must track isSubmitting state to prevent duplicate submissions");

// 2. Verify Account.tsx integration
const accountPath = path.resolve(__dirname, "../src/pages/customer/Account.tsx");
const accountContent = fs.readFileSync(accountPath, "utf-8");

assert.ok(!accountContent.includes('prompt("Please enter a reason for cancelling'), "Account.tsx must NOT use window.prompt for cancellation");
assert.ok(accountContent.includes("OrderCancellationModal"), "Account.tsx must import and render OrderCancellationModal");
assert.ok(accountContent.includes("handleInitiateCancel"), "Account.tsx must initiate cancellation through modal");
assert.ok(accountContent.includes("handleConfirmCancellation"), "Account.tsx must handle confirmed cancellation");
assert.ok(accountContent.includes("cancellationSuccessToast"), "Account.tsx must show cancellation success banner");

// 3. Verify OrderDetailView.tsx status update display
const orderDetailViewPath = path.resolve(__dirname, "../src/components/customer/OrderDetailView.tsx");
const orderDetailViewContent = fs.readFileSync(orderDetailViewPath, "utf-8");

assert.ok(orderDetailViewContent.includes("Order Cancelled Successfully"), "OrderDetailView must display 'Order Cancelled Successfully'");
assert.ok(orderDetailViewContent.includes("Cancellation Date"), "OrderDetailView must display 'Cancellation Date'");
assert.ok(orderDetailViewContent.includes("Cancellation Reason"), "OrderDetailView must display 'Cancellation Reason'");
assert.ok(orderDetailViewContent.includes("Refund Status:"), "OrderDetailView must display 'Refund Status:'");
assert.ok(orderDetailViewContent.includes("Refund Pending"), "OrderDetailView must display 'Refund Pending' for online paid orders");
assert.ok(orderDetailViewContent.includes("Not Applicable (COD)"), "OrderDetailView must display 'Not Applicable (COD)' for cash orders");

// 4. Verify Backend Serializer & View implementation
const serializersPath = path.resolve(__dirname, "../../backend/apps/orders/serializers.py");
const serializersContent = fs.readFileSync(serializersPath, "utf-8");

assert.ok(serializersContent.includes("OrderCancelInputSerializer"), "Serializers must include OrderCancelInputSerializer");
assert.ok(serializersContent.includes("ordered_by_mistake"), "Serializers must support structured reason codes");
assert.ok(serializersContent.includes("cancellation_reason"), "OrderDetailSerializer must include cancellation_reason");
assert.ok(serializersContent.includes("cancelled_at"), "OrderDetailSerializer must include cancelled_at");
assert.ok(serializersContent.includes("refund_status"), "OrderDetailSerializer must include refund_status");

console.log("✅ All Order Cancellation Modal & Workflow verification tests passed successfully!\n");
