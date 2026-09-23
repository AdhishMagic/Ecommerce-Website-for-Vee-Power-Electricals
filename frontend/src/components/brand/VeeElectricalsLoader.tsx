import React from "react";

export type AuthLoaderStatus = "idle" | "submitting" | "success" | "error";

interface VeeElectricalsLoaderProps {
  status: AuthLoaderStatus;
  message?: string;
  successMessage?: string;
  className?: string;
}

/**
 * Ultra-Clean VEE ELECTRICALS Loading Screen
 *
 * Contains ONLY:
 * 1. The official Vee Electricals logo (/logo.png)
 * 2. A subtle, professional pulse animation applied to the logo itself
 *
 * Centered horizontally and vertically on a clean solid light background.
 * Zero text, zero spinners, zero progress bars, zero decorative graphics.
 */
export default function VeeElectricalsLoader({
  status,
  className = "",
}: VeeElectricalsLoaderProps) {
  if (status === "idle" || status === "error") {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Loading Vee Electricals"
      aria-live="polite"
      aria-busy={true}
      className={`vee-simple-loader-overlay fixed inset-0 z-50 bg-[#F6F8FA] flex items-center justify-center select-none ${className}`}
    >
      <div className="relative flex items-center justify-center w-36 sm:w-44 md:w-52 lg:w-60 max-w-[75vw] pointer-events-none">
        <img
          src="/logo.png"
          alt="Vee Electricals"
          width={240}
          height={172}
          loading="eager"
          decoding="sync"
          className="vee-simple-loader-logo w-full h-auto object-contain select-none"
          style={{
            aspectRatio: "1166 / 837",
          }}
        />
      </div>
    </div>
  );
}
