export default function ContactHero() {
  return (
    <div className="mb-8 sm:mb-10 animate-fadeIn">
      <div className="inline-flex items-center gap-2 bg-[#EFF6FF] border border-[#BFDBFE] px-3.5 py-1.5 rounded-full text-xs font-bold text-[#1769AA] tracking-wide uppercase mb-3">
        <span className="w-2 h-2 rounded-full bg-[#1769AA] animate-pulse" />
        <span>Customer Support • Pan-India Enquiries</span>
      </div>

      <h1
        className="text-3xl sm:text-4xl font-extrabold text-[#0B3A63] tracking-tight"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        Contact Us
      </h1>

      <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
        We're here to help with product enquiries, bulk orders, and customer support. Reach out to our team via phone, email, or by filling out the contact form below.
      </p>
    </div>
  );
}
