import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-[#0B3A63] text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <Link 
              to="/" 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:opacity-80 transition-opacity cursor-pointer inline-block"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 bg-[#F2A900] rounded-md flex items-center justify-center">
                  <span className="text-[#0B3A63] font-bold text-lg" style={{ fontFamily: "Outfit" }}>V</span>
                </div>
                <div>
                  <div className="font-bold text-white text-sm" style={{ fontFamily: "Outfit" }}>VEE POWER ELECTRICALS</div>
                  <div className="text-[10px] text-white/60 tracking-wider uppercase">Trusted Since 2010</div>
                </div>
              </div>
            </Link>
            <p className="text-white/70 text-sm leading-relaxed mb-4">
              Your trusted electrical products partner in Coimbatore. Genuine products from established brands at competitive prices.
            </p>
            <div className="text-sm text-white/60">
              <p>GST No: 33CKXPK4525R1Z9</p>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold mb-4" style={{ fontFamily: "Outfit" }}>Contact Us</h4>
            <div className="space-y-2 text-sm text-white/70">
              <p>📍 No 28/1, 2nd floor, MTP Road,<br />Muthu nagar, NSN palayam,<br />Coimbatore - 641031</p>
              <p>📞 <a href="tel:+918610359797" className="hover:text-[#F2A900]">+91 8610359797</a></p>
              <p>📞 <a href="tel:+919443441058" className="hover:text-[#F2A900]">+91 9443441058</a></p>
              <p>✉️ <a href="mailto:veepower.cbe@gmail.com" className="hover:text-[#F2A900]">veepower.cbe@gmail.com</a></p>
              <p className="text-white/50 text-xs">Mon–Sat: 9:00 AM – 7:00 PM</p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-4" style={{ fontFamily: "Outfit" }}>Quick Links</h4>
            <ul className="space-y-2 text-sm text-white/70">
              {[
                { label: "Shop All Products", to: "/shop" },
                { label: "Fans", to: "/shop?category=fans" },
                { label: "Wires & Cables", to: "/shop?category=wires" },
                { label: "Switches", to: "/shop?category=switches" },
                { label: "LED & Lighting", to: "/shop?category=lighting" },
                { label: "MCB & Protection", to: "/shop?category=mcb" },
                { label: "My Orders", to: "/account/orders" },
              ].map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-[#F2A900] transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h4 className="text-white font-semibold mb-4" style={{ fontFamily: "Outfit" }}>Policies & Info</h4>
            <ul className="space-y-2 text-sm text-white/70">
              {[
                { label: "About Us", to: "/about" },
                { label: "Contact Us", to: "/contact" },
                { label: "Privacy Policy", to: "/privacy" },
                { label: "Terms & Conditions", to: "/terms" },
                { label: "Shipping Policy", to: "/shipping" },
                { label: "Return & Cancellation", to: "/returns" },
              ].map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-[#F2A900] transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Brands bar */}
        <div className="mt-10 pt-8 border-t border-white/10">
          <p className="text-white/50 text-xs mb-3 uppercase tracking-wider">Authorised Dealer For</p>
          <div className="flex flex-wrap gap-3">
            {["Havells", "Finolex", "Crompton", "Anchor", "Jaquar", "Khaitan", "Legrand", "Polycab", "Philips", "Gloster"].map(brand => (
              <span key={brand} className="text-xs bg-white/10 text-white/70 px-3 py-1 rounded-full">{brand}</span>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3 text-white/50 text-xs">
          <p>© 2024 Vee Power Electricals. All rights reserved.</p>
          <p>Designed with ❤️ for Coimbatore</p>
        </div>
      </div>
    </footer>
  );
}
