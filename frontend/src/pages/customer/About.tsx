export default function About() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="bg-white border border-[#D9E1E8] rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#0B3A63] to-[#1769AA] px-8 py-10 text-white">
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Outfit" }}>About Vee Power Electricals</h1>
          <p className="text-white/80">Your Trusted Electrical Partner in Coimbatore</p>
        </div>
        <div className="p-8">
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div>
              <h2 className="text-xl font-bold text-[#0B3A63] mb-3">Who We Are</h2>
              <p className="text-[#667085] leading-relaxed text-sm">
                Vee Power Electricals is a leading electrical products retailer and distributor based in Coimbatore, Tamil Nadu. Established with a commitment to delivering genuine, high-quality electrical products, we serve contractors, builders, electricians, and homeowners across the region.
              </p>
              <p className="text-[#667085] leading-relaxed text-sm mt-3">
                We are authorised dealers for India's most trusted electrical brands including Havells, Polycab, Finolex, Crompton, Anchor, Legrand, Philips, Jaquar, Khaitan and Gloster.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0B3A63] mb-3">Our Mission</h2>
              <p className="text-[#667085] leading-relaxed text-sm">
                To provide genuine, quality electrical products at competitive prices with reliable service. We believe in building long-term relationships based on trust and technical expertise.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[["10+", "Years Experience"], ["10,000+", "Products"], ["5,000+", "Customers"], ["10+", "Brands"]].map(([num, label]) => (
                  <div key={label} className="bg-[#F6F8FA] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#0B3A63]">{num}</p>
                    <p className="text-xs text-[#667085]">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#F6F8FA] rounded-xl p-6">
            <h2 className="text-xl font-bold text-[#0B3A63] mb-4">Business Information</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {[
                ["Business Name", "Vee Power Electricals"],
                ["GST Number", "33CKXPK4525R1Z9"],
                ["Address", "No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031"],
                ["State", "Tamil Nadu"],
                ["Phone", "+91 8610359797 / +91 9443441058"],
                ["Email", "veepower.cbe@gmail.com"],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-[#667085] min-w-[120px]">{label}:</span>
                  <span className="font-medium text-[#17212B]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
