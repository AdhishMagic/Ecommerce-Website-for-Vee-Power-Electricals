import React from "react";
import { VeeInsectIcon } from "./VeeElectricalsLogo";

export type AuthLoaderStatus = "idle" | "submitting" | "success" | "error";

interface VeeElectricalsLoaderProps {
  status: AuthLoaderStatus;
  message?: string;
  successMessage?: string;
  className?: string;
}

/**
 * Dedicated VEE ELECTRICALS Animated Loading System
 * Inspired by the insect motion reference video:
 * 1. Insect appears with subtle technical scale & opacity
 * 2. Wings perform realistic aerodynamic hovering flutter
 * 3. High-voltage electrical pulse charges down the central power cells
 * 4. Antenna energy nodes and stinger contact emit synchronized electrical glows
 * 5. Aura pulses smoothly in a 1.8s loop
 * 6. Smooth success state transition with energy completion flash
 */
export default function VeeElectricalsLoader({
  status,
  message = "Authenticating...",
  successMessage = "Access Granted",
  className = "",
}: VeeElectricalsLoaderProps) {
  if (status === "idle" || status === "error") {
    return null;
  }

  const isSuccess = status === "success";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={status === "submitting"}
      className={`vee-loading-overlay absolute inset-0 z-40 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-6 rounded-2xl transition-all duration-300 ${
        isSuccess ? "vee-loader-success" : "vee-loader-active"
      } ${className}`}
    >
      <div className="flex flex-col items-center justify-center max-w-xs text-center select-none">
        {/* Animated Insect Loader Core */}
        <div className="relative mb-6 flex items-center justify-center">
          {/* Outer energetic pulse rings */}
          <div className="vee-loader-pulse-ring absolute inset-0 -m-4 rounded-full border border-[#1769AA]/25 pointer-events-none" />
          <div className="vee-loader-pulse-ring-2 absolute inset-0 -m-8 rounded-full border border-[#F2A900]/20 pointer-events-none" />

          {/* Central Animated Insect Plinth */}
          <div className="relative z-10 p-3 rounded-2xl bg-gradient-to-b from-[#F6F8FA] via-white to-[#EEF2F6] shadow-xl border border-[#D9E1E8]">
            <VeeInsectIcon
              size={82}
              animated={true}
              theme="color"
              id="vee-login-loader"
              className={isSuccess ? "vee-insect-success-state" : "vee-insect-loading-state"}
            />
          </div>
        </div>

        {/* Brand Name Typography */}
        <div className="flex flex-col items-center justify-center select-none mb-4">
          <span
            className="font-black text-2xl text-[#0B3A63] tracking-tight leading-none"
            style={{ fontFamily: "Outfit" }}
          >
            VEE
          </span>
          <span
            className="text-xs font-bold text-[#1769AA] tracking-[0.25em] uppercase mt-1 leading-tight"
            style={{ fontFamily: "Outfit" }}
          >
            ELECTRICALS
          </span>
        </div>

        {/* Dynamic Status Indicator Pill */}
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#F6F8FA] border border-[#D9E1E8] shadow-inner">
          {!isSuccess ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1769AA] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#1769AA]" />
            </span>
          ) : (
            <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-emerald-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          )}
          <span
            className={`text-xs font-semibold tracking-wide ${
              isSuccess ? "text-emerald-700" : "text-[#475467]"
            }`}
          >
            {isSuccess ? successMessage : message}
          </span>
        </div>

        {/* Electrical Charging Progress Bar */}
        <div className="w-44 h-1.5 bg-[#EEF2F6] rounded-full mt-5 overflow-hidden shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isSuccess
                ? "w-full bg-emerald-600"
                : "vee-loader-progress bg-gradient-to-r from-[#1769AA] via-[#F2A900] to-[#1769AA]"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
