export default function CompanyOverview() {
  return (
    <section className="py-12 sm:py-16 bg-white">
      <div className="site-container">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left Column: Who We Are */}
          <div className="lg:col-span-7 space-y-5">
            <div>
              <span className="text-xs font-bold text-[#1769AA] uppercase tracking-wider">Company Background</span>
              <h2
                className="text-2xl sm:text-3xl font-extrabold text-[#0B3A63] mt-1 tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Who We Are
              </h2>
            </div>

            <div className="space-y-4 text-slate-600 text-sm sm:text-base leading-relaxed">
              <p>
                Vee Power Electricals is a leading electrical products retailer and distributor based in Coimbatore, Tamil Nadu. Established with a commitment to delivering genuine, high-quality electrical products, we serve contractors, builders, electricians, and homeowners all around India with reliable Pan-India delivery.
              </p>
              <p>
                We are authorised dealers for India's most trusted electrical brands including Havells, Polycab, Finolex, Crompton, Anchor, Legrand, Philips, Jaquar, Khaitan and Gloster.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="pt-2 grid sm:grid-cols-3 gap-3">
              {[
                { title: "Authorized Dealer", desc: "100% Genuine Supplies" },
                { title: "Pan-India Shipping", desc: "Delivering All Around India" },
                { title: "Diverse Catalog", desc: "Residential & Commercial" },
              ].map((item, idx) => (
                <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-[#1769AA] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-bold text-xs text-[#0B3A63]">{item.title}</span>
                  </div>
                  <p className="text-xs text-slate-500 pl-6">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Mission and Vision */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <span className="text-xs font-bold text-[#1769AA] uppercase tracking-wider">Core Purpose</span>
              <h2
                className="text-2xl sm:text-3xl font-extrabold text-[#0B3A63] mt-1 tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Mission &amp; Vision
              </h2>
            </div>

            {/* Mission Card */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6 relative overflow-hidden group hover:border-[#1769AA]/40 transition-colors">
              <div className="w-10 h-10 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-center text-[#1769AA] mb-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0B3A63] mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                Our Mission
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                To provide genuine, quality electrical products at competitive prices with dependable service and lasting customer relationships based on trust and technical expertise.
              </p>
            </div>

            {/* Vision Card */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6 relative overflow-hidden group hover:border-[#1769AA]/40 transition-colors">
              <div className="w-10 h-10 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-center text-[#1769AA] mb-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0B3A63] mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                Our Vision
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                To make trusted electrical products easily accessible to contractors, builders, and homeowners through a reliable, convenient shopping experience.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
