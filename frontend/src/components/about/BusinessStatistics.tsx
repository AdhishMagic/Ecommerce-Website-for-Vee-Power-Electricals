const STATS = [
  { value: "10+", label: "Years Experience", description: "Delivering electrical supplies all around India" },
  { value: "10,000+", label: "Products", description: "Comprehensive electrical catalog" },
  { value: "5,000+", label: "Customers", description: "Contractors, builders & homeowners" },
  { value: "10+", label: "Brands", description: "Leading Indian electrical manufacturers" },
];

export default function BusinessStatistics() {
  return (
    <section className="py-10 bg-[#F8FAFC] border-y border-[#E2E8F0]">
      <div className="site-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {STATS.map((stat, idx) => (
            <div
              key={stat.label}
              className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 text-center shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-200"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <p
                className="text-3xl sm:text-4xl font-extrabold text-[#0B3A63] tracking-tight mb-1"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {stat.value}
              </p>
              <p className="text-sm font-bold text-[#1769AA] mb-1">{stat.label}</p>
              <p className="text-xs text-slate-500 hidden sm:block">{stat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
