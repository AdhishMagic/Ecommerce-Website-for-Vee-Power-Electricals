import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Continue with Google" control backed by Google Identity Services (GIS).
 *
 * Only the public OAuth client ID is exposed to the browser; no client secret
 * is ever present in the React bundle. The GIS-rendered button returns an
 * opaque ID token (credential) which the backend verifies server-side. Email,
 * name, and picture are never read from the client.
 *
 * When `VITE_GOOGLE_CLIENT_ID` is not configured, the control renders a
 * clear configuration error banner and actionable instructions rather than
 * silently failing with a dead disabled button.
 *
 * If Google Identity Services script or iframe rendering is blocked (e.g. by an
 * ad-blocker or origin mismatch on localhost vs 127.0.0.1), the control provides
 * a seamless branded fallback to the OAuth 2.0 Authorization Code redirect flow
 * registered at `/auth/google/callback`.
 */

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt?: (momentListener?: (notification: unknown) => void) => void;
        };
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "").trim();

let gisLoader: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoader) return gisLoader;

  gisLoader = new Promise<void>((resolve, reject) => {
    // Check if script is already present in DOM
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      let completed = false;
      const onLoad = () => {
        if (completed) return;
        completed = true;
        resolve();
      };
      const onError = () => {
        if (completed) return;
        completed = true;
        gisLoader = null;
        reject(new Error("gis_load_failed"));
      };

      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });

      // Poll as a safety net in case script already finished before listeners attached
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          onLoad();
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 4000);
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoader = null;
      reject(new Error("gis_load_failed"));
    };
    document.head.appendChild(script);
  });

  return gisLoader;
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void | Promise<void>;
  disabled?: boolean;
}

export default function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  const [gisError, setGisError] = useState(false);
  const [gisLoading, setGisLoading] = useState(true);
  const [gisRenderFallback, setGisRenderFallback] = useState(false);

  const isConfigured = Boolean(
    CLIENT_ID &&
    !CLIENT_ID.includes("your-google-client-id") &&
    CLIENT_ID.length > 10
  );

  const isLocalhost =
    typeof window !== "undefined" &&
    window.location.hostname === "localhost";

  const getBackendOAuthUrl = useCallback(() => {
    if (typeof window === "undefined") return "/auth/google/login/";
    const frontendOrigin = window.location.origin;
    return `http://127.0.0.1:8000/auth/google/login/?frontend_url=${encodeURIComponent(frontendOrigin)}`;
  }, []);

  const handleOAuthRedirect = useCallback(() => {
    if (disabled) return;
    window.location.href = getBackendOAuthUrl();
  }, [disabled, getBackendOAuthUrl]);

  const initGIS = useCallback(() => {
    if (!isConfigured) {
      setGisLoading(false);
      return;
    }

    if (isLocalhost) {
      // Localhost is not in Google Cloud Console JavaScript origins (127.0.0.1 is registered).
      // Immediately activate the branded OAuth redirect fallback button to avoid console errors or delays.
      setGisRenderFallback(true);
      setGisLoading(false);
      return;
    }

    setGisError(false);
    setGisRenderFallback(false);
    setGisLoading(true);

    loadGoogleIdentityServices()
      .then(() => {
        if (!containerRef.current || !window.google?.accounts?.id) {
          setGisLoading(false);
          return;
        }

        try {
          window.google.accounts.id.initialize({
            client_id: CLIENT_ID,
            ux_mode: "popup",
            cancel_on_tap_outside: true,
            callback: (response: { credential?: string }) => {
              if (response?.credential) {
                void callbackRef.current(response.credential);
              }
            },
          });

          containerRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(containerRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            logo_alignment: "center",
            width: 320,
          });

          setGisLoading(false);

          // Verify whether GIS actually rendered an iframe.
          // If Google blocked the origin or script was blocked by ad-blocker,
          // renderButton fails and leaves no iframe.
          setTimeout(() => {
            if (containerRef.current) {
              const hasIframe = Boolean(containerRef.current.querySelector("iframe"));
              if (!hasIframe) {
                setGisRenderFallback(true);
              }
            }
          }, 800);
        } catch (initErr) {
          console.error("GIS render error:", initErr);
          setGisRenderFallback(true);
          setGisLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Google Identity Services script failed to load (possibly blocked by ad-blocker):", err);
        setGisError(true);
        setGisLoading(false);
      });
  }, [isConfigured, isLocalhost]);

  useEffect(() => {
    initGIS();
  }, [initGIS]);

  // Case 1: Missing Client ID configuration error
  if (!isConfigured) {
    return (
      <div className="w-full space-y-3" data-testid="google-signin-not-configured">
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-testid="google-signin-button"
          className="w-full inline-flex items-center justify-center gap-2.5 py-3 rounded-xl border border-amber-300 bg-amber-50/60 text-sm font-medium text-amber-900 cursor-not-allowed opacity-90 transition-all"
        >
          <svg className="w-5 h-5 shrink-0 opacity-70" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
          Continue with Google (Configuration Required)
        </button>

        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">Google Sign-In is not configured</p>
            <p className="text-amber-800 leading-normal">
              Missing <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950 font-semibold">VITE_GOOGLE_CLIENT_ID</code>.
              Set this in your <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">.env.local</code> or Docker compose environment and restart the server.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Localhost origin or GIS script failure or iframe render failure fallback
  if (isLocalhost || gisError || gisRenderFallback) {
    return (
      <div className={`w-full ${disabled ? "pointer-events-none opacity-50" : ""}`} data-testid="google-signin-fallback">
        <button
          type="button"
          onClick={handleOAuthRedirect}
          disabled={disabled}
          aria-disabled={disabled}
          data-testid="google-signin-button"
          className="w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-charcoal shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
        >
          <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
          Continue with Google
        </button>
      </div>
    );
  }

  // Case 3: Configured and rendering GIS iframe button
  return (
    <div className={`w-full flex justify-center ${disabled ? "pointer-events-none opacity-50 cursor-not-allowed" : ""}`}>
      <div
        ref={containerRef}
        className="flex w-full justify-center min-h-[40px]"
        data-testid="google-signin-button"
        aria-label="Continue with Google"
      >
        {gisLoading && (
          <div className="w-[320px] h-[40px] rounded-xl border border-border bg-gray-50 flex items-center justify-center gap-2 text-xs text-muted animate-pulse">
            <svg className="w-3.5 h-3.5 animate-spin text-electric" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading Google Sign-In...
          </div>
        )}
      </div>
    </div>
  );
}

