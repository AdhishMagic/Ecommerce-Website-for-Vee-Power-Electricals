import { Link } from "react-router-dom";
import { COMPANY_NAME } from "../../constants/companyInfo";
import genericElectricalImg from "../../assets/defaults/generic-electrical.webp";

export default function AboutHero() {
  return (
    <section className="bg-gradient-to-b from-[#F8FAFC] via-white to-white border-b border-[#E2E8F0] py-10 sm:py-16">
      <div className="site-container">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-5 animate-fadeIn">
            <div className="inline-flex items-center gap-2 bg-[#EFF6FF] border border-[#BFDBFE] px-3.5 py-1.5 rounded-full text-xs font-bold text-[#1769AA] tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-[#1769AA] animate-pulse" />
              <span>{COMPANY_NAME} • Pan-India Shipping</span>
            </div>

            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0B3A63] tracking-tight leading-tight"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              About Vee Power Electricals
            </h1>

            <p
              className="text-lg sm:text-xl font-semibold text-[#1769AA]"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Your Trusted Electrical Partner
            </p>

            <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-2xl">
              Quality electrical products from trusted brands, with competitive pricing and dependable Pan-India delivery all around India for contractors, builders, electricians, and homeowners.
            </p>

            <div className="pt-3 flex flex-wrap items-center gap-3 sm:gap-4">
              <Link
                to="/shop"
                className="px-6 py-3 bg-[#1769AA] hover:bg-[#0B3A63] text-white text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2 group"
              >
                <span>Explore Products</span>
                <svg
                  className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>

              <Link
                to="/contact"
                className="px-6 py-3 bg-white border border-[#CBD5E1] hover:border-[#0B3A63] text-[#0B3A63] hover:text-[#1769AA] text-sm font-bold rounded-xl shadow-2xs hover:shadow-xs transition-all duration-200"
              >
                Contact Us
              </Link>
            </div>
          </div>

          {/* Right Visual Badge Card */}
          <div className="lg:col-span-5 relative animate-fadeIn" style={{ animationDelay: "150ms" }}>
            <div className="relative bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-6 shadow-md overflow-hidden group">
              <div className="h-56 sm:h-64 rounded-xl overflow-hidden bg-slate-100 relative mb-4">
                <img
                  src={genericElectricalImg}
                  alt="Vee Power Electricals products"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B3A63]/80 via-[#0B3A63]/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <span className="bg-[#1769AA] text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider">
                    Authorized Dealer
                  </span>
                  <h3 className="text-lg font-bold mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Commercial &amp; Residential Supplies
                  </h3>
                </div>
              </div>

              {/* Highlights */}
              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100">
                <div className="p-2">
                  <p className="text-xs text-slate-500 font-medium">Quality</p>
                  <p className="text-sm font-bold text-[#0B3A63]">100% Genuine</p>
                </div>
                <div className="p-2 border-x border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Brands</p>
                  <p className="text-sm font-bold text-[#0B3A63]">Leading 10+</p>
                </div>
                <div className="p-2">
                  <p className="text-xs text-slate-500 font-medium">Delivery</p>
                  <p className="text-sm font-bold text-[#0B3A63]">All Around India</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
