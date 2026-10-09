import { COMPANY_ADDRESS, COMPANY_NAME } from "../../constants/companyInfo";

export default function BusinessInfo() {
  const INFO_ITEMS = [
    { label: "Business Name", value: COMPANY_NAME },
    { label: "GSTIN", value: "33CKXPK4525R1Z9" },
    { label: "Address", value: COMPANY_ADDRESS },
    { label: "State", value: "Tamil Nadu" },
    { label: "Phone", value: "+91 8610359797 / +91 9443441058" },
    { label: "Email", value: "veepower.cbe@gmail.com" },
  ];

  return (
    <section className="py-12 sm:py-16 bg-white">
      <div className="site-container">
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6 sm:p-8">
          <div className="mb-6 pb-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-[#1769AA] uppercase tracking-wider">Verification &amp; Contact</span>
              <h2
                className="text-xl sm:text-2xl font-extrabold text-[#0B3A63] mt-0.5"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Official Business Details
              </h2>
            </div>
            <span className="bg-[#ECFDF5] border border-[#A7F3D0] text-[#12773D] text-xs font-bold px-3 py-1 rounded-full w-fit">
              ✓ Registered Taxpayer
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {INFO_ITEMS.map((item) => (
              <div key={item.label} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  {item.label}
                </span>
                <span className="text-sm font-bold text-[#17212B] break-words">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
