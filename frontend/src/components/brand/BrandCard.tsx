import { Link } from "react-router-dom";
import { getBrandLogo } from "../../utils/brandLogoResolver";

export interface BrandItem {
  id?: number | string;
  name: string;
  slug?: string;
  logoUrl?: string | null;
  productCount?: number;
}

interface BrandCardProps {
  brand: BrandItem;
  index?: number;
}

export default function BrandCard({ brand, index = 0 }: BrandCardProps) {
  const brandName = brand.name;
  const brandSlug = brand.slug || brandName.toLowerCase();
  const logoUrl = getBrandLogo(brandName, brand.logoUrl);
  const count = brand.productCount ?? 0;

  // Correct product count grammar as requested in Section 6
  const countText = count === 1 ? "1 product" : `${count} products`;

  return (
    <Link
      to={`/shop?brand=${encodeURIComponent(brandSlug)}`}
      className="group relative bg-white border border-[#E2E8F0] hover:border-[#1769AA]/50 rounded-xl p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] focus-visible:ring-offset-2"
      style={{
        animationDelay: `${Math.min(index * 40, 400)}ms`,
      }}
      aria-label={`Explore products from ${brandName} (${countText})`}
    >
      {/* Top Logo Container */}
      <div className="w-full h-24 bg-white border border-slate-100 rounded-lg p-3 flex items-center justify-center mb-4 group-hover:border-slate-200 transition-colors overflow-hidden shrink-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${brandName} logo`}
            className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-slate-50 border border-slate-200/80 rounded flex items-center justify-center p-2 text-center">
            <span
              className="text-[#0B3A63] font-bold text-base tracking-wide line-clamp-2"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {brandName}
            </span>
          </div>
        )}
      </div>

      {/* Brand Title & Product Count */}
      <div className="text-center mb-4 flex-1 flex flex-col justify-center">
        <h3
          className="font-bold text-[#17212B] text-base group-hover:text-[#1769AA] transition-colors line-clamp-1"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          {brandName}
        </h3>
        <p className="text-xs text-slate-500 mt-1 font-medium">{countText}</p>
      </div>

      {/* Action CTA */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#1769AA] group-hover:text-[#0B3A63] transition-colors mt-auto">
        <span>Explore Products</span>
        <svg
          className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform duration-200"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </div>
    </Link>
  );
}
