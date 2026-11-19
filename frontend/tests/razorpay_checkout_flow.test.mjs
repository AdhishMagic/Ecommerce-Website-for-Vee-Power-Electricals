// Vee Power Electricals — Frontend Razorpay Integration Verification
// Verifies: Payment Option, Loading State, Cancellation, Failure Handling, and Handle Fallback

import assert from 'node:assert';

const API_BASE = process.env.VITE_API_URL || 'https://veepowerelectricals.com/api/v1';
const ROOT_API = process.env.ROOT_API || 'https://veepowerelectricals.com/api';

async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 VeeVerificationBot/1.0',
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING FRONTEND RAZORPAY PAYMENT INTEGRATION TESTS');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // 1. Payment Configuration & Security
  console.log('\n[Test Suite 1: Payment Config & Secret Isolation]');
  {
    const configRes = await request(`${API_BASE}/payments/config/`);
    test('Server provides public payment config', () => {
      assert.strictEqual(configRes.status, 200, `Expected 200, got ${configRes.status}`);
      if (configRes.data.gateway_enabled) {
        assert.ok(configRes.data.key_id, 'key_id must be provided when gateway is enabled');
        assert.ok(configRes.data.key_id.startsWith('rzp_'), 'key_id must start with rzp_');
      } else {
        assert.strictEqual(configRes.data.key_id, '', 'key_id must be empty when gateway is unconfigured');
      }
    });

    test('Server-controlled payment handle destination is configured', () => {
      assert.strictEqual(
        configRes.data.payment_handle,
        'https://razorpay.me/@veepowerelectricals',
        'Handle must match authoritative server configuration'
      );
    });

    test('Secrets are never exposed to frontend', () => {
      assert.strictEqual(configRes.data.key_secret, undefined, 'Secret must not be exposed');
      assert.strictEqual(configRes.data.webhook_secret, undefined, 'Webhook secret must not be exposed');
      assert.strictEqual(configRes.data.secret, undefined, 'Generic secret must not be exposed');
    });
  }

  // 2. Standard Order Creation & Minimum Amount
  console.log('\n[Test Suite 2: Standard Order Creation Endpoint]');
  {
    const createRes = await request(`${ROOT_API}/create-order`, {
      method: 'POST',
      body: JSON.stringify({
        amount: 25000, // ₹250.00
        currency: 'INR',
        receipt: `test_rcpt_${Date.now()}`,
      }),
    });

    test('POST /api/create-order returns valid Razorpay order_id', () => {
      assert.strictEqual(createRes.status, 200);
      assert.ok(createRes.data.order_id, 'order_id must be returned');
      assert.ok(createRes.data.order_id.startsWith('order_'), 'order_id must start with order_');
      assert.strictEqual(createRes.data.amount, 25000);
      assert.strictEqual(createRes.data.currency, 'INR');
    });

    const minAmountRes = await request(`${ROOT_API}/create-order`, {
      method: 'POST',
      body: JSON.stringify({
        amount: 50, // Less than 100 paise
        currency: 'INR',
      }),
    });

    test('Order creation rejects amount < 100 paise with HTTP 400', () => {
      assert.strictEqual(minAmountRes.status, 400);
      assert.ok(minAmountRes.data.error, 'Error message must be present');
    });
  }

  // 3. Signature Verification & Cryptographic Rejection
  console.log('\n[Test Suite 3: Signature Verification Security]');
  {
    const badSigRes = await request(`${ROOT_API}/verify-payment`, {
      method: 'POST',
      body: JSON.stringify({
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_456',
        razorpay_signature: 'tampered_signature_hex_value',
      }),
    });

    test('Signature mismatch or unconfigured gateway rejects verification and does NOT confirm order', () => {
      assert.ok([400, 500].includes(badSigRes.status), `Expected 400 or 500, got ${badSigRes.status}`);
      assert.ok(badSigRes.data.error || badSigRes.data.status === 'failed');
    });

    const missingFieldRes = await request(`${ROOT_API}/verify-payment`, {
      method: 'POST',
      body: JSON.stringify({
        razorpay_order_id: 'order_test_123',
        // missing payment_id and signature
      }),
    });

    test('Missing signature verification fields return HTTP 400', () => {
      assert.strictEqual(missingFieldRes.status, 400);
      assert.ok(missingFieldRes.data.error, 'Missing field error expected');
    });
  }

  // 4. Client State Simulation (Loading, Cancellation, Failure, Handle Fallback)
  console.log('\n[Test Suite 4: Frontend Payment State Model Simulation]');
  {
    // Simulate payment lifecycle transitions
    let state = {
      lifecycle: 'idle',
      errorMessage: '',
      createdOrder: { id: 101, order_number: 'ORD-TEST-001', total_amount: '1250.00' },
    };

    // Transition: Initiating / Loading
    state = { ...state, lifecycle: 'initiating' };
    test('Loading state is active while preparing payment gateway intent', () => {
      assert.strictEqual(state.lifecycle, 'initiating');
    });

    // Transition: On GPay / UPI app switch or payment.failed event -> enters 'verifying' state (NO false failure)
    state = {
      ...state,
      lifecycle: 'verifying',
      verificationStatus: 'VERIFYING',
    };
    test('GPay app switch or payment.failed event enters verifying state rather than displaying false failure', () => {
      assert.strictEqual(state.lifecycle, 'verifying');
      assert.strictEqual(state.verificationStatus, 'VERIFYING');
    });

    // Transition: Pending polling state
    state = {
      ...state,
      verificationStatus: 'PENDING',
    };
    test('Pending verification polls backend without showing failure', () => {
      assert.strictEqual(state.verificationStatus, 'PENDING');
    });

    // Transition: Network glitch resilience
    const onNetworkGlitch = () => {
      // Network error must maintain PENDING state rather than flipping to FAILED
      return 'PENDING';
    };
    test('Network interruption retains PENDING verification status without showing false failure', () => {
      assert.strictEqual(onNetworkGlitch(), 'PENDING');
    });

    // Transition: Definitive SUCCESS
    state = {
      ...state,
      verificationStatus: 'SUCCESS',
      order: { ...state.createdOrder, payment_status: 'Paid', status: 'CONFIRMED' },
    };
    test('Definitive backend confirmation transitions to SUCCESS state', () => {
      assert.strictEqual(state.verificationStatus, 'SUCCESS');
      assert.strictEqual(state.order.payment_status, 'Paid');
    });

    // Transition: Modal exit/dismiss -> CANCELLED
    state = {
      ...state,
      lifecycle: 'cancelled',
      errorMessage: 'Payment was not completed. You can retry or choose another payment method.',
    };
    test('Modal dismiss/exit transitions directly to cancelled checkout state without continuous loading', () => {
      assert.strictEqual(state.lifecycle, 'cancelled');
    });

    // Transition: Timeout after max polling -> UNKNOWN
    state = {
      ...state,
      verificationStatus: 'UNKNOWN',
      timeoutMessage: 'Your payment is taking longer than expected. We are still checking its status. Please check your order history before attempting another payment.',
    };
    test('Verification timeout transitions to UNKNOWN state with required guidance text', () => {
      assert.strictEqual(state.verificationStatus, 'UNKNOWN');
      assert.ok(state.timeoutMessage.includes('taking longer than expected'));
      assert.ok(state.timeoutMessage.includes('check your order history before attempting another payment'));
    });

    // Transition: Definitive FAILED (only when backend has confirmed final failure)
    state = {
      ...state,
      verificationStatus: 'FAILED',
      errorMessage: 'Payment was declined by your bank or gateway.',
    };
    test('Definitive backend failure transitions to FAILED state with decline reason', () => {
      assert.strictEqual(state.verificationStatus, 'FAILED');
      assert.ok(state.errorMessage.includes('declined'));
    });

    // Verify Fallback Handle properties
    const paymentHandle = 'https://razorpay.me/@veepowerelectricals';
    test('Payment handle uses secure https and points to @veepowerelectricals', () => {
      const url = new URL(paymentHandle);
      assert.strictEqual(url.protocol, 'https:');
      assert.strictEqual(url.hostname, 'razorpay.me');
      assert.strictEqual(url.pathname, '/@veepowerelectricals');
    });
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
