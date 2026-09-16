import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";

export default function Header() {
  const { totalItems } = useCart();
  const { isAuthenticated, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const navLinks = [
    { label: "Shop", to: "/shop" },
    { label: "Categories", to: "/shop?view=categories" },
    { label: "Brands", to: "/shop?view=brands" },
    { label: "About", to: "/about" },
    { label: "Contact", to: "/contact" },
  ];
  
  const getAccountLink = () => {
    if (isAuthenticated && user) {
      return user.role === "admin" ? "/admin" : "/account";
    }
    return "/login";
  };

  return (
    <header className="sticky top-0 z-50 bg-white shadow-md border-b border-[#D9E1E8]">
      {/* Top Contact Bar */}
      <div className="bg-[#F6F8FA] border-b border-[#D9E1E8] text-[#667085] text-xs py-1.5 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <span>📍 No 28/1, 2nd floor, MTP Road, NSN palayam, Coimbatore - 641031 | GST: 33CKXPK4525R1Z9</span>
          <div className="flex gap-4 items-center">
            <a href="tel:+918610359797" className="hover:text-[#1769AA] transition-colors">📞 +91 8610359797</a>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4 sm:gap-8">
          {/* Logo (Top Left) */}
          <Link to="/" className="flex-shrink-0 flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-[#0B3A63] to-[#1769AA] rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
              <span className="text-[#F2A900] font-bold text-xl" style={{ fontFamily: "Outfit" }}>V</span>
            </div>
            <div>
              <div className="font-bold text-[#0B3A63] text-base sm:text-lg leading-none tracking-tight group-hover:text-[#1769AA] transition-colors" style={{ fontFamily: "Outfit" }}>
                VEE POWER
              </div>
              <div className="text-[10px] sm:text-xs text-[#667085] font-medium leading-tight tracking-[0.2em] uppercase mt-1">
                Electricals
              </div>
            </div>
          </Link>

          {/* Search Bar (Center) - Elongated and prominent */}
          <form onSubmit={handleSearch} className="flex-1 max-w-3xl hidden md:flex items-center">
            <div className="relative w-full group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for switches, wires, appliances..."
                className="w-full bg-[#F6F8FA] border border-[#D9E1E8] text-[#17212B] text-sm rounded-full pl-5 pr-14 py-3 outline-none focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 transition-all shadow-inner"
              />
              <button type="submit" className="absolute right-1.5 top-1.5 bottom-1.5 bg-[#1769AA] hover:bg-[#0B3A63] text-white p-2.5 rounded-full transition-colors flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
            </div>
          </form>

          {/* Actions (Top Right) */}
          <div className="flex items-center gap-5 sm:gap-6 ml-auto md:ml-0 flex-shrink-0">
            <Link to={getAccountLink()} className="hidden sm:flex flex-col items-center text-[#667085] hover:text-[#1769AA] transition-colors group">
              <div className="p-2 bg-transparent rounded-full group-hover:bg-[#F6F8FA] transition-colors">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <span className="text-[10px] sm:text-xs font-medium -mt-1">My Account</span>
            </Link>
            
            <Link to="/cart" className="flex flex-col items-center text-[#667085] hover:text-[#1769AA] transition-colors group relative">
              <div className="p-2 bg-transparent rounded-full group-hover:bg-[#F6F8FA] transition-colors relative">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                {totalItems > 0 && (
                  <span className="absolute top-1 right-1 bg-[#F2A900] text-[#0B3A63] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm border border-white transform translate-x-1/2 -translate-y-1/2">
                    {totalItems}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-xs font-medium -mt-1">Cart</span>
            </Link>

            {/* Mobile menu toggle */}
            <button className="md:hidden p-2 text-[#0B3A63] hover:bg-[#F6F8FA] rounded-md transition-colors" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <div className="md:hidden px-4 pb-4">
          <form onSubmit={handleSearch} className="flex relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-[#F6F8FA] border border-[#D9E1E8] text-sm rounded-full pl-4 pr-12 py-2.5 outline-none focus:border-[#1769AA]"
            />
            <button type="submit" className="absolute right-1 top-1 bottom-1 bg-[#1769AA] text-white p-2 rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Nav bar */}
      <nav className="hidden md:block bg-[#0B3A63]">
        <div className="max-w-7xl mx-auto px-4">
          <ul className="flex gap-2">
            {navLinks.map(link => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block px-4 py-3 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors rounded-t-sm"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <nav className="md:hidden bg-[#0B3A63] px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
          <ul className="flex flex-col">
            {navLinks.map(link => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block py-3 text-sm font-medium text-white/90 hover:text-white border-b border-white/10"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to={getAccountLink()} className="block py-3 text-sm font-medium text-white/90 hover:text-white" onClick={() => setMobileMenuOpen(false)}>My Account</Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
