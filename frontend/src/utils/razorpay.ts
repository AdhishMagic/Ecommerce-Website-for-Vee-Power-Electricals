/**
 * Vee Power Electricals — Razorpay SDK Dynamic Loader
 * Safely and asynchronously loads the authoritative Razorpay Checkout modal SDK script once.
 * Caches the in-flight Promise so that simultaneous or repeated calls resolve immediately.
 */

let scriptLoadingPromise: Promise<boolean> | null = null;

export function isRazorpayLoaded(): boolean {
  return typeof (window as any).Razorpay === 'function';
}

export function isMockRazorpayKey(keyId?: string): boolean {
  if (!keyId) return true;
  return keyId.startsWith('rzp_test_mock') || keyId === 'rzp_test_mock_veepower_key' || keyId.startsWith('mock_');
}

export function loadRazorpayScript(): Promise<boolean> {
  // If already loaded in window, resolve immediately
  if (isRazorpayLoaded()) {
    return Promise.resolve(true);
  }

  // If a script load is already in-flight, return the existing Promise
  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve) => {
    // Check if script element already exists in DOM
    const existingScript = document.getElementById('razorpay-checkout-script') as HTMLScriptElement | null;
    if (existingScript) {
      if (isRazorpayLoaded()) {
        resolve(true);
      } else {
        existingScript.addEventListener('load', () => resolve(isRazorpayLoaded()), { once: true });
        existingScript.addEventListener('error', () => {
          scriptLoadingPromise = null;
          resolve(false);
        }, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      resolve(isRazorpayLoaded());
    };
    script.onerror = () => {
      console.warn("Failed to load Razorpay Checkout script from checkout.razorpay.com.");
      scriptLoadingPromise = null;
      resolve(false);
    };

    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}
