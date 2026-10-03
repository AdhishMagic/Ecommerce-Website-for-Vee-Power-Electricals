import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Continue with Google" control backed by Google Identity Services (GIS).
 *
 * Only the public OAuth client ID is exposed to the browser; no client secret
 * is ever present in the React bundle. The GIS-rendered button returns an
 * opaque ID token (credential) which the backend verifies server-side. Email,
 * name, and picture are never read from the client.
 *
 * When `VITE_GOOGLE_CLIENT_ID` is not configured the control renders a
 * disabled, clearly-labelled button so the email/password flow remains the
 * only active path (useful for local development without OAuth credentials).
 */

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
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
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gis_load_failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis_load_failed"));
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
  const isConfigured = !!CLIENT_ID;

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;

    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
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
      })
      .catch(() => {
        if (!cancelled) setGisError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isConfigured]);

  if (isConfigured && !gisError) {
    return (
      <div
        ref={containerRef}
        className="flex w-full justify-center"
        data-testid="google-signin-button"
        aria-label="Continue with Google"
      />
    );
  }

  return (
    <button
      type="button"
      disabled
      data-testid="google-signin-button"
      title={isConfigured ? "Google sign-in is temporarily unavailable." : "Google sign-in is not configured in this environment."}
      className="w-full inline-flex items-center justify-center gap-2.5 py-3 rounded-xl border border-border bg-bg text-sm font-medium text-muted cursor-not-allowed opacity-80"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      Continue with Google
    </button>
  );
}
