import { Link } from "react-router-dom";
import { PolicyData } from "../../data/policyData";
import { COMPANY_NAME, COMPANY_ADDRESS } from "../../constants/companyInfo";

interface PolicyPageLayoutProps {
  policy: PolicyData;
}

const POLICY_TABS = [
  { label: "Privacy Policy", slug: "privacy", path: "/privacy" },
  { label: "Terms & Conditions", slug: "terms", path: "/terms" },
  { label: "Shipping Policy", slug: "shipping", path: "/shipping" },
  { label: "Return & Cancellation", slug: "returns", path: "/returns" },
];

export default function PolicyPageLayout({ policy }: PolicyPageLayoutProps) {
  return (
    <div className="bg-[#F6F8FA] min-h-screen py-6 sm:py-10">
      <div className="site-container">
        {/* Breadcrumb Navigation */}
        <nav
          className="text-xs text-slate-500 mb-6 flex flex-wrap items-center gap-2 font-medium"
          aria-label="Breadcrumb"
        >
          <Link to="/" className="hover:text-[#1769AA] transition-colors">
            Home
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-600">Policies & Information</span>
          <span className="text-slate-300">/</span>
          <span className="text-[#0B3A63] font-semibold">{policy.shortTitle}</span>
        </nav>

        {/* Policy Header Box */}
        <header className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D9E1E8] pb-6 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#0B3A63]/5 text-[#0B3A63] border border-[#0B3A63]/10 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#12773D]" />
                Official Operational Policy
              </div>
              <h1
                className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0B3A63] tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {policy.title}
              </h1>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <span className="text-xs text-slate-500 block">Reviewed & Operational</span>
              <span className="text-xs sm:text-sm font-semibold text-[#0B3A63]">
                {policy.lastReviewed}
              </span>
            </div>
          </div>

          <p className="text-sm sm:text-base text-slate-700 leading-relaxed max-w-4xl">
            {policy.summary}
          </p>

          {/* Quick Policy Switcher Navigation */}
          <nav
            className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-2"
            aria-label="Policy Navigation Tabs"
          >
            {POLICY_TABS.map((tab) => {
              const isActive = policy.slug === tab.slug;
              return (
                <Link
                  key={tab.slug}
                  to={tab.path}
                  className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] ${
                    isActive
                      ? "bg-[#0B3A63] text-white shadow-xs"
                      : "bg-[#F6F8FA] text-slate-600 hover:text-[#0B3A63] hover:bg-slate-200/70 border border-slate-200/80"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </header>

        {/* Policy Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Content Sections (Col 1-8) */}
          <main className="lg:col-span-8 space-y-6">
            {policy.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 shadow-xs scroll-mt-24"
              >
                <h2
                  className="text-lg sm:text-xl font-bold text-[#0B3A63] mb-4 pb-2 border-b border-slate-100"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {section.title}
                </h2>

                {section.paragraphs?.map((p, idx) => (
                  <p
                    key={idx}
                    className="text-sm sm:text-[15px] text-slate-700 leading-relaxed mb-3 last:mb-0 whitespace-pre-line"
                  >
                    {p}
                  </p>
                ))}

                {section.bulletPoints && section.bulletPoints.length > 0 && (
                  <ul className="mt-4 space-y-2.5 text-sm sm:text-[15px] text-slate-700">
                    {section.bulletPoints.map((point, pIdx) => (
                      <li key={pIdx} className="flex items-start gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1769AA] mt-2 shrink-0" />
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.callout && (
                  <div
                    className={`mt-5 p-4 rounded-xl border text-sm leading-relaxed ${
                      section.callout.type === "info"
                        ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]"
                        : section.callout.type === "warning"
                        ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-base select-none">
                        {section.callout.type === "info"
                          ? "ℹ️"
                          : section.callout.type === "warning"
                          ? "⚠️"
                          : "📌"}
                      </span>
                      <p className="font-medium">{section.callout.text}</p>
                    </div>
                  </div>
                )}
              </section>
            ))}

            {/* Related Policies Cross-Navigation */}
            <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 shadow-xs">
              <h3
                className="text-base font-bold text-[#0B3A63] mb-3"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Related Policies & Documentation
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mb-4">
                Explore our full set of operating policies and customer guidelines:
              </p>
              <div className="flex flex-wrap gap-3">
                {policy.relatedPolicies.map((rel) => (
                  <Link
                    key={rel.slug}
                    to={`/${rel.slug}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#1769AA] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
                  >
                    <span>{rel.title}</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          </main>

          {/* Sidebar: Table of Contents & Business Support Card (Col 9-12) */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Quick Section Jump */}
            <div className="bg-white border border-[#D9E1E8] rounded-2xl p-5 shadow-xs sticky top-24">
              <h3
                className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                On This Page
              </h3>
              <nav className="space-y-1.5" aria-label="Table of Contents">
                {policy.sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block text-xs sm:text-sm text-slate-600 hover:text-[#0B3A63] hover:bg-slate-50 px-2 py-1.5 rounded-md transition-colors truncate font-medium"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>

              <hr className="my-4 border-slate-100" />

              {/* Authoritative Business Information */}
              <div className="space-y-3">
                <h4
                  className="text-xs font-bold text-[#0B3A63] uppercase tracking-wider"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Authorized Support Desk
                </h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <p className="font-semibold text-[#17212B]">{COMPANY_NAME}</p>
                  <p className="leading-relaxed">📍 {COMPANY_ADDRESS}</p>
                  <p className="font-mono text-[11px] text-slate-500">GST No: 33CKXPK4525R1Z9</p>
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <p>
                      📞{" "}
                      <a
                        href="tel:+918610359797"
                        className="font-medium text-[#1769AA] hover:underline"
                      >
                        +91 8610359797
                      </a>
                    </p>
                    <p>
                      📞{" "}
                      <a
                        href="tel:+919443441058"
                        className="font-medium text-[#1769AA] hover:underline"
                      >
                        +91 9443441058
                      </a>
                    </p>
                    <p>
                      ✉️{" "}
                      <a
                        href="mailto:veepower.cbe@gmail.com"
                        className="font-medium text-[#1769AA] hover:underline break-all"
                      >
                        veepower.cbe@gmail.com
                      </a>
                    </p>
                    <p className="text-[11px] text-slate-400 pt-1">
                      Operating Hours: Mon–Sat: 9:00 AM – 7:00 PM IST
                    </p>
                  </div>
                </div>

                <div className="pt-3">
                  <Link
                    to="/contact"
                    className="block text-center w-full px-4 py-2.5 text-xs font-bold text-white bg-[#0B3A63] hover:bg-[#1769AA] rounded-xl transition-colors shadow-2xs"
                  >
                    Contact Support Team
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
