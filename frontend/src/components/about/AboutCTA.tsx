import { Link } from "react-router-dom";

export default function AboutCTA() {
  return (
    <section className="py-12 sm:py-16 bg-white">
      <div className="site-container">
        <div className="bg-gradient-to-r from-[#0B3A63] to-[#1769AA] rounded-2xl p-8 sm:p-12 text-white shadow-md relative overflow-hidden">
          {/* Subtle decorative background circles */}
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-48 h-48 bg-white/5 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-4">
            <span className="bg-white/15 border border-white/20 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Get Started Today
            </span>

            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Looking for Reliable Electrical Products?
            </h2>

            <p className="text-white/80 text-sm sm:text-base leading-relaxed max-w-2xl">
              Explore our electrical product range or get in touch with our team for bulk pricing, nationwide shipping all around India, and technical support.
            </p>

            <div className="pt-4 flex flex-wrap items-center gap-3 sm:gap-4">
              <Link
                to="/shop"
                className="px-6 py-3 bg-white text-[#0B3A63] hover:bg-slate-100 text-sm font-bold rounded-xl shadow-xs transition-colors"
              >
                Shop Products
              </Link>
              <Link
                to="/contact"
                className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/30 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
