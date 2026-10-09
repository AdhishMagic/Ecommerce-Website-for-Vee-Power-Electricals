import { COMPANY_ADDRESS } from "../../constants/companyInfo";

export default function ContactInfoCard() {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(COMPANY_ADDRESS)}`;

  return (
    <div className="space-y-4">
      {/* Visit Us */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs hover:shadow-xs hover:border-[#1769AA]/40 transition-all duration-200 group">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-center text-[#1769AA] shrink-0 group-hover:scale-105 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="font-bold text-[#0B3A63] text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
              Visit Us
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-words">
              {COMPANY_ADDRESS}
            </p>
            <div className="pt-1">
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#1769AA] hover:text-[#0B3A63] transition-colors"
                aria-label="Get directions on Google Maps"
              >
                <span>Get Directions</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Call Us */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs hover:shadow-xs hover:border-[#1769AA]/40 transition-all duration-200 group">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-center text-[#1769AA] shrink-0 group-hover:scale-105 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1.1 1.1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="font-bold text-[#0B3A63] text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
              Call Us
            </h3>
            <div className="flex flex-col gap-1 text-xs sm:text-sm font-semibold">
              <a
                href="tel:+918610359797"
                className="text-[#17212B] hover:text-[#1769AA] transition-colors w-fit focus:outline-none focus-visible:underline"
              >
                +91 8610359797
              </a>
              <a
                href="tel:+919443441058"
                className="text-[#17212B] hover:text-[#1769AA] transition-colors w-fit focus:outline-none focus-visible:underline"
              >
                +91 9443441058
              </a>
            </div>
            <p className="text-xs text-slate-500 font-medium pt-1">
              Mon – Sat: 9:00 AM – 7:00 PM IST
            </p>
          </div>
        </div>
      </div>

      {/* Email Us */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs hover:shadow-xs hover:border-[#1769AA]/40 transition-all duration-200 group">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-center text-[#1769AA] shrink-0 group-hover:scale-105 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="font-bold text-[#0B3A63] text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
              Email Us
            </h3>
            <a
              href="mailto:veepower.cbe@gmail.com"
              className="text-xs sm:text-sm font-semibold text-[#17212B] hover:text-[#1769AA] transition-colors break-all block"
            >
              veepower.cbe@gmail.com
            </a>
            <p className="text-xs text-slate-500 font-medium pt-0.5">
              Response within 24 business hours
            </p>
          </div>
        </div>
      </div>

      {/* Pan-India Delivery Badge */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 text-center">
        <span className="text-xs font-bold text-[#1769AA] block uppercase tracking-wider mb-1">
          Pan-India Shipping
        </span>
        <p className="text-xs text-slate-600">
          We ship genuine electrical products all around India to every state and PIN code.
        </p>
      </div>
    </div>
  );
}
