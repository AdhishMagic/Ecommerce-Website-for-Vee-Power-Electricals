import React from "react";

export type VeeLogoVariant = "full" | "icon" | "compact";
export type VeeLogoTheme = "color" | "white" | "dark" | "monochrome" | "light";

export interface VeeElectricalsLogoProps {
  variant?: VeeLogoVariant;
  size?: "sm" | "md" | "lg" | "xl" | number;
  theme?: VeeLogoTheme;
  animated?: boolean;
  className?: string;
  id?: string;
}

/**
 * High-definition Official Vee Electricals Logo Mark
 * Renders the official brand emblem with exact proportions and zero distortion.
 */
export function VeeElectricalsLogoMark({
  size = 38,
  className = "",
  id = "vee-logo-mark",
  animated = false,
}: {
  size?: number;
  className?: string;
  id?: string;
  animated?: boolean;
}) {
  // Natural aspect ratio of the brand emblem: 1166w / 837h ≈ 1.393
  const markHeight = size;
  const markWidth = Math.round(size * 1.393);

  return (
    <div
      id={id}
      className={`vee-logo-mark relative flex-shrink-0 flex items-center justify-center ${
        animated ? "vee-logo-animated" : ""
      } ${className}`}
      style={{
        height: `${markHeight}px`,
        width: `${markWidth}px`,
      }}
    >
      <img
        src="/logo.png"
        alt="Vee Power Electricals"
        width={markWidth}
        height={markHeight}
        loading="eager"
        decoding="async"
        className="vee-logo-img w-full h-full object-contain select-none pointer-events-none transition-transform duration-300 group-hover:scale-105"
        style={{
          aspectRatio: "1166 / 837",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      />
    </div>
  );
}

/**
 * Main Unified VeeElectricalsLogo Component
 * Canonical brand logo component used across customer, admin, authentication,
 * header, and footer layouts.
 */
export default function VeeElectricalsLogo({
  variant = "full",
  size = "md",
  theme = "color",
  animated = false,
  className = "",
  id = "vee-logo",
}: VeeElectricalsLogoProps) {
  // Convert standard size tokens into numeric height dimensions
  const pixelHeight =
    typeof size === "number"
      ? size
      : size === "sm"
      ? 28
      : size === "lg"
      ? 52
      : size === "xl"
      ? 72
      : 38; // "md" matches existing 38-40px header height

  const isWhite = theme === "white";
  const primaryTextColor = isWhite ? "text-white" : "text-[#0B3A63]";
  const subTextColor = isWhite ? "text-white/80" : "text-[#1769AA]";

  // 1. Icon Only Variant
  if (variant === "icon") {
    return (
      <div className={`vee-logo-mark-wrap inline-flex items-center justify-center select-none ${className}`}>
        <VeeElectricalsLogoMark
          size={pixelHeight}
          animated={animated}
          id={`${id}-icon`}
        />
      </div>
    );
  }

  // 2. Compact Variant (Inline typography, ideal for admin sidebar & compact headers)
  if (variant === "compact") {
    return (
      <div className={`vee-logo-compact inline-flex items-center gap-2.5 select-none group ${className}`}>
        <VeeElectricalsLogoMark
          size={Math.round(pixelHeight * 0.9)}
          animated={animated}
          id={`${id}-compact-mark`}
        />
        <div className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
          <span
            className={`font-black tracking-tight leading-none text-sm sm:text-base truncate transition-colors duration-200 ${primaryTextColor} group-hover:text-[#1769AA]`}
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            VEE POWER
          </span>
          <span
            className={`font-bold tracking-[0.2em] uppercase text-[10px] hidden sm:block truncate transition-colors duration-200 ${subTextColor}`}
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            ELECTRICALS
          </span>
        </div>
      </div>
    );
  }

  // 3. Full Variant (Emblem + Stacked Brand Typography)
  return (
    <div className={`vee-logo-full inline-flex items-center gap-2.5 sm:gap-3 select-none group ${className}`}>
      <VeeElectricalsLogoMark
        size={pixelHeight}
        animated={animated}
        id={`${id}-full-mark`}
      />

      <div className="flex flex-col justify-center select-none">
        <div
          className={`font-black text-base sm:text-lg leading-none tracking-tight transition-colors duration-200 ${primaryTextColor} group-hover:text-[#1769AA]`}
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          VEE POWER
        </div>
        <div
          className={`text-[10px] sm:text-[11px] font-bold leading-tight tracking-[0.22em] uppercase mt-1 transition-colors duration-200 ${subTextColor}`}
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          ELECTRICALS
        </div>
      </div>
    </div>
  );
}
