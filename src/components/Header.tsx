import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";

export default function Header() {
  const { totalItems } = useCart();
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

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-[#D9E1E8]">
      {/* Top bar */}
      <div className="bg-[#0B3A63] text-white text-xs py-1.5">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <span>📍 Coimbatore, Tamil Nadu | GST: 33AABFV1234A1ZX</span>
          <div className="flex gap-4 items-center">
            <a href="tel:+914224567890" className="hover:text-[#F2A900]">📞 0422-456 7890</a>
            <Link to="/account" className="hover:text-[#F2A900]">My Account</Link>
            <Link to="/admin" className="hover:text-[#F2A900]">Admin</Link>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0 flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#0B3A63] rounded-md flex items-center justify-center">
              <span className="text-[#F2A900] font-bold text-lg" style={{ fontFamily: "Outfit" }}>V</span>
            </div>
            <div>
              <div className="font-bold text-[#0B3A63] text-sm leading-tight" style={{ fontFamily: "Outfit" }}>VEE POWER</div>
              <div className="text-[10px] text-[#667085] leading-tight tracking-wider uppercase">Electricals</div>
            </div>
          </Link>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-2xl mx-4 hidden sm:flex">
            <div className="flex w-full rounded-lg border border-[#D9E1E8] overflow-hidden focus-within:border-[#1769AA] focus-within:ring-1 focus-within:ring-[#1769AA]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, brands, categories..."
                className="flex-1 px-4 py-2.5 text-sm outline-none text-[#17212B] placeholder-[#667085]"
              />
              <button type="submit" className="bg-[#1769AA] hover:bg-[#0B3A63] text-white px-5 text-sm font-medium transition-colors">
                Search
              </button>
            </div>
          </form>

          {/* Actions */}
          <div className="flex items-center gap-3 ml-auto sm:ml-0">
            <Link to="/account" className="hidden sm:flex flex-col items-center text-[#667085] hover:text-[#1769AA] text-xs gap-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <span>Account</span>
            </Link>
            <Link to="/cart" className="relative flex flex-col items-center text-[#667085] hover:text-[#1769AA] text-xs gap-0.5">
              <div className="relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                {totalItems > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#F2A900] text-[#0B3A63] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{totalItems}</span>
                )}
              </div>
              <span>Cart</span>
            </Link>
            {/* Mobile menu toggle */}
            <button className="sm:hidden text-[#0B3A63]" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden px-4 pb-3">
          <form onSubmit={handleSearch} className="flex rounded-lg border border-[#D9E1E8] overflow-hidden">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="flex-1 px-3 py-2 text-sm outline-none"
            />
            <button type="submit" className="bg-[#1769AA] text-white px-4 text-sm">Search</button>
          </form>
        </div>
      </div>

      {/* Nav bar */}
      <nav className="hidden sm:block bg-[#0B3A63]">
        <div className="max-w-7xl mx-auto px-4">
          <ul className="flex gap-0">
            {navLinks.map(link => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
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
        <nav className="sm:hidden bg-[#0B3A63] px-4 pb-4">
          <ul className="flex flex-col">
            {navLinks.map(link => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block py-2.5 text-sm text-white/90 hover:text-white border-b border-white/10"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/account" className="block py-2.5 text-sm text-white/90" onClick={() => setMobileMenuOpen(false)}>My Account</Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
