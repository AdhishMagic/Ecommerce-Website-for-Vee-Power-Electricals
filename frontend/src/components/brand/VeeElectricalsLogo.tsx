import React from "react";

export type VeeLogoVariant = "full" | "icon" | "compact";
export type VeeLogoTheme = "color" | "white" | "dark" | "monochrome";

export interface VeeElectricalsLogoProps {
  variant?: VeeLogoVariant;
  size?: "sm" | "md" | "lg" | "xl" | number;
  theme?: VeeLogoTheme;
  animated?: boolean;
  className?: string;
  id?: string;
}

/**
 * Raw SVG Insect Icon for VEE ELECTRICALS
 * Combines: Insect Form (inspired by reference video) + Electrical Energy + Subtle 'V' Concept.
 * Designed with precision vector geometry, high contrast, and crisp legibility from 16px to 128px+.
 */
export function VeeInsectIcon({
  size = 40,
  theme = "color",
  animated = false,
  className = "",
  id = "vee-insect-icon",
}: {
  size?: number;
  theme?: VeeLogoTheme;
  animated?: boolean;
  className?: string;
  id?: string;
}) {
  // Theme color mapping
  const isWhite = theme === "white";
  const isDark = theme === "dark";
  const isMono = theme === "monochrome";

  const navyColor = isWhite ? "#FFFFFF" : isDark ? "#FFFFFF" : isMono ? "currentColor" : "#0B3A63";
  const amberColor = isWhite ? "#F2A900" : isDark ? "#F2A900" : isMono ? "currentColor" : "#F2A900";
  const blueColor = isWhite ? "#93C5FD" : isDark ? "#60A5FA" : isMono ? "currentColor" : "#1769AA";
  const wingFill = isWhite
    ? "rgba(255, 255, 255, 0.2)"
    : isMono
    ? "rgba(0, 0, 0, 0.05)"
    : "rgba(23, 105, 170, 0.14)";
  const wingStroke = isWhite ? "#FFFFFF" : isMono ? "currentColor" : "#1769AA";
  const eyeColor = isWhite ? "#0B3A63" : "#FFFFFF";

  return (
    <svg
      id={id}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`vee-insect-svg ${animated ? "is-animated" : ""} ${className}`}
      style={{ overflow: "visible" }}
      aria-label="Vee Power Electricals Insect Symbol"
    >
      <defs>
        {/* Glow filter for electrical sparks & charging animation */}
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Linear gradients for high-tech depth */}
        <linearGradient id={`${id}-amber-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="60%" stopColor={amberColor} />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        <linearGradient id={`${id}-navy-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isWhite ? "#FFFFFF" : "#1769AA"} />
          <stop offset="100%" stopColor={navyColor} />
        </linearGradient>

        <linearGradient id={`${id}-wing-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isWhite ? "rgba(255, 255, 255, 0.3)" : "rgba(242, 169, 0, 0.22)"} />
          <stop offset="100%" stopColor={wingFill} />
        </linearGradient>
      </defs>

      {/* Background Energy Aura (active on hover or animated loading) */}
      <circle
        className="vee-insect-aura"
        cx="50"
        cy="50"
        r="44"
        fill={isWhite ? "rgba(255, 255, 255, 0.08)" : "rgba(23, 105, 170, 0.06)"}
        stroke={isWhite ? "rgba(255, 255, 255, 0.2)" : "rgba(23, 105, 170, 0.12)"}
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />

      {/* Main Insect Group: Angled at 36° (facing upper-right, wings upper-left, stinger bottom-left) */}
      <g className="vee-insect-creature" transform="translate(50, 52) rotate(36)">
        <g className="vee-bob-inner">
          {/* REAR WING (Smaller, layered behind thorax) */}
          <g className="vee-wing-rear-group">
          <path
            className="vee-wing-rear"
            d="M -11,-1 C -24,-6 -34,-16 -32,-21 C -30,-25 -24,-24 -16,-17 C -10,-12 -8,-5 -11,-1 Z"
            fill={`url(#${id}-wing-grad)`}
            stroke={wingStroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Rear wing electrical circuit vein */}
          <path
            d="M -14,-4 C -21,-10 -27,-16 -27,-19"
            stroke={blueColor}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeDasharray="1.5 2"
            opacity="0.8"
          />
        </g>

        {/* FRONT WING (Large, aerodynamic silhouette with circuit veins echoing subtle 'V' shape) */}
        <g className="vee-wing-front-group">
          <path
            className="vee-wing-front"
            d="M -9,-8 C -18,-22 -32,-35 -39,-29 C -44,-24 -38,-9 -24,-1 C -17,4 -11,0 -9,-8 Z"
            fill={`url(#${id}-wing-grad)`}
            stroke={wingStroke}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* Wing Electric Traces: High-tech chevron circuit lines */}
          <path
            className="vee-wing-circuit-1"
            d="M -13,-9 C -22,-19 -31,-26 -33,-25"
            stroke={blueColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.9"
          />
          <path
            className="vee-wing-circuit-2"
            d="M -18,-15 C -25,-12 -29,-6 -27,-3"
            stroke={amberColor}
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.85"
          />
          {/* Energy node on wing apex */}
          <circle cx="-33" cy="-25" r="1.8" fill={amberColor} filter={`url(#${id}-glow)`} />
        </g>

        {/* CENTRAL ABDOMEN & THORAX (Segmented Power Cells with alternating high-contrast stripes) */}
        <g className="vee-body-group">
          {/* Segment 1: Thorax / Upper Power Cell (Golden Amber) */}
          <path
            className="vee-segment vee-segment-1"
            d="M -14,-8 L 14,-8 C 15.2,-4 15.2,0 15,3 L -15,3 C -15.2,0 -15.2,-4 -14,-8 Z"
            fill={`url(#${id}-amber-grad)`}
            stroke={navyColor}
            strokeWidth="1.8"
          />

          {/* Segment 2: Deep Navy Power Core Band with subtle chevron cut */}
          <path
            className="vee-segment vee-segment-2"
            d="M -15,3 L 15,3 C 14.8,7 13.8,11 12.5,14 L -12.5,14 C -13.8,11 -14.8,7 -15,3 Z"
            fill={`url(#${id}-navy-grad)`}
            stroke={navyColor}
            strokeWidth="1.8"
          />

          {/* Segment 3: Lower Golden Amber Cell */}
          <path
            className="vee-segment vee-segment-3"
            d="M -12.5,14 L 12.5,14 C 11,18 8.8,22 6.5,24 L -6.5,24 C -8.8,22 -11,18 -12.5,14 Z"
            fill={`url(#${id}-amber-grad)`}
            stroke={navyColor}
            strokeWidth="1.8"
          />

          {/* Segment 4: Base Navy Power Cap */}
          <path
            className="vee-segment vee-segment-4"
            d="M -6.5,24 L 6.5,24 C 5,26.5 3.5,28.5 2,30 L -2,30 C -3.5,28.5 -5,26.5 -6.5,24 Z"
            fill={`url(#${id}-navy-grad)`}
            stroke={navyColor}
            strokeWidth="1.8"
          />

          {/* STINGER / ELECTRICAL TERMINAL CONTACT (Sharp technical probe) */}
          <path
            className="vee-stinger"
            d="M -2.5,30 L 0,38 L 2.5,30 Z"
            fill={amberColor}
            stroke={navyColor}
            strokeWidth="1.5"
          />
          {/* Stinger terminal spark contact point */}
          <circle className="vee-stinger-spark" cx="0" cy="38" r="1.4" fill={amberColor} filter={`url(#${id}-glow)`} />

          {/* CENTRAL ELECTRICAL CONDUIT (Runs through all power cells like a high-voltage circuit) */}
          <line
            className="vee-body-conduit"
            x1="0"
            y1="-8"
            x2="0"
            y2="30"
            stroke={isWhite ? "#FFFFFF" : "#1769AA"}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.8"
          />
          {/* Circuit junction nodes */}
          <circle cx="0" cy="3" r="1.6" fill={amberColor} />
          <circle cx="0" cy="14" r="1.6" fill={amberColor} />
          <circle cx="0" cy="24" r="1.6" fill={amberColor} />
        </g>

        {/* HEAD CAPSULE (Sits atop the thorax facing upper-right) */}
        <g className="vee-head-group">
          <path
            className="vee-head-dome"
            d="M -14,-8 C -14,-19 14,-19 14,-8 Z"
            fill={`url(#${id}-navy-grad)`}
            stroke={navyColor}
            strokeWidth="1.8"
          />

          {/* Tech Visor / Power Eye */}
          <ellipse
            className="vee-head-eye"
            cx="4.5"
            cy="-12.5"
            rx="3.2"
            ry="4.5"
            transform="rotate(12 4.5 -12.5)"
            fill={blueColor}
          />
          <circle cx="5.2" cy="-14" r="1.1" fill={eyeColor} />

          {/* DUAL ANTENNAE: Flaring in a crisp 'V' angle with energetic terminal beads */}
          {/* Left Antenna */}
          <path
            className="vee-antenna vee-antenna-left"
            d="M -4,-18 C -7,-27 -11,-32 -9,-37"
            stroke={navyColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          <circle
            className="vee-antenna-node vee-antenna-node-left"
            cx="-9"
            cy="-37"
            r="2.4"
            fill={amberColor}
            filter={`url(#${id}-glow)`}
          />

          {/* Right Antenna */}
          <path
            className="vee-antenna vee-antenna-right"
            d="M 4,-18 C 8,-26 13,-30 18,-33"
            stroke={navyColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          <circle
            className="vee-antenna-node vee-antenna-node-right"
            cx="18"
            cy="-33"
            r="2.4"
            fill={amberColor}
            filter={`url(#${id}-glow)`}
          />
        </g>
        </g>
      </g>
    </svg>
  );
}

/**
 * Main Unified VeeElectricalsLogo Component
 * Serves as the single source of truth across the entire platform.
 */
export default function VeeElectricalsLogo({
  variant = "full",
  size = "md",
  theme = "color",
  animated = false,
  className = "",
  id = "vee-logo",
}: VeeElectricalsLogoProps) {
  // Convert standard size tokens into numeric dimensions
  const iconPixelSize =
    typeof size === "number"
      ? size
      : size === "sm"
      ? 28
      : size === "lg"
      ? 52
      : size === "xl"
      ? 76
      : 38; // "md" matches existing 38-40px header height

  const isWhite = theme === "white";
  const primaryTextColor = isWhite ? "text-white" : "text-[#0B3A63]";
  const subTextColor = isWhite ? "text-white/80" : "text-[#1769AA]";

  // Icon only variant
  if (variant === "icon") {
    return (
      <div className={`vee-logo-mark inline-flex items-center justify-center select-none ${className}`}>
        <VeeInsectIcon
          size={iconPixelSize}
          theme={theme}
          animated={animated}
          id={`${id}-icon`}
        />
      </div>
    );
  }

  // Compact variant (inline single line, great for tight spaces)
  if (variant === "compact") {
    return (
      <div className={`vee-logo-compact inline-flex items-center gap-2 select-none group ${className}`}>
        <div className="vee-logo-icon-wrap flex-shrink-0">
          <VeeInsectIcon
            size={Math.round(iconPixelSize * 0.9)}
            theme={theme}
            animated={animated}
            id={`${id}-compact-icon`}
          />
        </div>
        <div className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
          <span
            className={`font-extrabold tracking-tight leading-none text-sm sm:text-base truncate ${primaryTextColor} group-hover:text-[#1769AA] transition-colors`}
            style={{ fontFamily: "Outfit" }}
          >
            VEE POWER
          </span>
          <span
            className={`font-bold tracking-[0.2em] uppercase text-[10px] hidden sm:block truncate ${subTextColor}`}
            style={{ fontFamily: "Outfit" }}
          >
            ELECTRICALS
          </span>
        </div>
      </div>
    );
  }

  // Full variant (Default standard brand identity: stacked typography)
  return (
    <div className={`vee-logo-full inline-flex items-center gap-2.5 sm:gap-3 select-none group ${className}`}>
      {/* Insect Icon Badge with subtle brand background backing */}
      <div
        className="vee-logo-icon-wrap relative flex-shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
        style={{ width: iconPixelSize, height: iconPixelSize }}
      >
        <VeeInsectIcon
          size={iconPixelSize}
          theme={theme}
          animated={animated}
          id={`${id}-full-icon`}
        />
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col justify-center select-none">
        <div
          className={`font-black text-base sm:text-lg leading-none tracking-tight transition-colors duration-200 ${primaryTextColor} group-hover:text-[#1769AA]`}
          style={{ fontFamily: "Outfit" }}
        >
          VEE POWER
        </div>
        <div
          className={`text-[10px] sm:text-[11px] font-bold leading-tight tracking-[0.22em] uppercase mt-1 transition-colors duration-200 ${subTextColor}`}
          style={{ fontFamily: "Outfit" }}
        >
          ELECTRICALS
        </div>
      </div>
    </div>
  );
}
