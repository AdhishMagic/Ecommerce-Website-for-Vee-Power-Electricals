const STRENGTHS = [
  {
    title: "Genuine Products",
    description: "Authentic electrical products sourced directly from authorized brand distributors.",
    icon: (
      <svg className="w-6 h-6 text-[#1769AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: "Trusted Brands",
    description: "Catalog featuring India's leading manufacturers including Havells, Polycab, Finolex & Legrand.",
    icon: (
      <svg className="w-6 h-6 text-[#1769AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    title: "Competitive Pricing",
    description: "Clear, transparent wholesale and retail pricing with exclusive trade offers.",
    icon: (
      <svg className="w-6 h-6 text-[#1769AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Reliable Service",
    description: "Experienced staff providing technical advice, prompt Pan-India order dispatch all around India, and after-sales support.",
    icon: (
      <svg className="w-6 h-6 text-[#1769AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

export default function BusinessStrengths() {
  return (
    <section className="py-12 sm:py-16 bg-white">
      <div className="site-container">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-[#1769AA] uppercase tracking-wider">Why Choose Us</span>
          <h2
            className="text-2xl sm:text-3xl font-extrabold text-[#0B3A63] mt-1 tracking-tight"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Built on Quality &amp; Customer Trust
          </h2>
          <p className="text-slate-600 text-sm mt-2">
            Providing reliable electrical supplies with technical guidance and honest pricing.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STRENGTHS.map((item, idx) => (
            <div
              key={item.title}
              className="bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1769AA]/40 rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 shadow-2xs hover:shadow-xs flex flex-col justify-between"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <div>
                <div className="w-12 h-12 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <h3 className="text-base font-bold text-[#0B3A63] mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
