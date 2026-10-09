import { Link } from "react-router-dom";
import { getBrandLogo } from "../../utils/brandLogoResolver";

const FEATURED_BRANDS = [
  "Anchor",
  "Crompton",
  "Finolex",
  "Gloster",
  "Havells",
  "Jaquar",
  "Khaitan",
  "Legrand",
  "Philips",
  "Polycab",
  "Schneider Electric",
];

const slugifyBrand = (val: string) => val.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function BrandPartnerships() {
  return (
    <section className="py-12 sm:py-16 bg-[#F8FAFC] border-t border-[#E2E8F0]">
      <div className="site-container">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold text-[#1769AA] uppercase tracking-wider">Authorised Dealer</span>
            <h2
              className="text-2xl sm:text-3xl font-extrabold text-[#0B3A63] mt-1 tracking-tight"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Leading Brand Partnerships
            </h2>
            <p className="text-slate-600 text-sm mt-1">
              Supplying authentic electrical products from India's most trusted manufacturers.
            </p>
          </div>

          <Link
            to="/shop?view=brands"
            className="text-xs font-bold text-[#1769AA] hover:text-[#0B3A63] flex items-center gap-1.5 transition-colors shrink-0"
          >
            <span>View All Brands</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>

        {/* Brand Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {FEATURED_BRANDS.map((bName) => {
            const logoUrl = getBrandLogo(bName);
            const slug = slugifyBrand(bName);

            return (
              <Link
                key={bName}
                to={`/shop?brand=${encodeURIComponent(slug)}`}
                className="bg-white border border-[#E2E8F0] hover:border-[#1769AA]/50 rounded-xl p-4 flex flex-col items-center justify-center h-24 shadow-2xs hover:shadow-xs hover:-translate-y-1 transition-all duration-200 group"
                aria-label={`View ${bName} products`}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`${bName} logo`}
                    className="max-h-12 max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="text-[#0B3A63] font-bold text-sm text-center"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {bName}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
