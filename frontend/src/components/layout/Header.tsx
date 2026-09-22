import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import VeeElectricalsLogo from "../brand/VeeElectricalsLogo";
import { COMPANY_ADDRESS, COMPANY_NAME } from "../../constants/companyInfo";

export default function Header() {
  const { totalItems } = useCart();
  const { isAuthenticated, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

  const getActiveIndex = useCallback(() => {
    const currentPath = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const currentView = searchParams.get("view");

    if (currentPath === "/shop") {
      if (currentView === "categories") return 1;
      if (currentView === "brands") return 2;
      return 0;
    }
    if (currentPath === "/about") return 3;
    if (currentPath === "/contact") return 4;
    return -1;
  }, [location.pathname, location.search]);

  const activeIndex = getActiveIndex();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const navContainerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
    opacity: number;
  }>({
    left: 0,
    width: 0,
    top: 0,
    height: 0,
    opacity: 0,
  });

  const updateIndicator = useCallback(() => {
    const targetIndex = hoveredIndex !== null ? hoveredIndex : activeIndex;
    const nav = navContainerRef.current;
    if (!nav) return;

    if (targetIndex >= 0) {
      const link = itemRefs.current[targetIndex];
      if (link) {
        const linkRect = link.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();

        setIndicatorStyle({
          left: linkRect.left - navRect.left,
          width: linkRect.width,
          height: linkRect.height,
          top: linkRect.top - navRect.top,
          opacity: 1,
        });
      }
    } else {
      // Inactive / unhovered: fade out smoothly
      setIndicatorStyle((prev) => {
        if (prev.width === 0 && itemRefs.current[0]) {
          const firstRect = itemRefs.current[0].getBoundingClientRect();
          const navRect = nav.getBoundingClientRect();
          return {
            left: firstRect.left - navRect.left,
            width: firstRect.width,
            height: firstRect.height,
            top: firstRect.top - navRect.top,
            opacity: 0,
          };
        }
        return {
          ...prev,
          opacity: 0,
        };
      });
    }
  }, [hoveredIndex, activeIndex]);

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    updateIndicator();
    setHasMounted(true);
    window.addEventListener("resize", updateIndicator);
    if (document.fonts?.ready) {
      document.fonts.ready.then(updateIndicator);
    }
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);
  
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
        <div className="header-inner flex justify-between items-center">
          <span>📍 {COMPANY_ADDRESS} | GST: 33CKXPK4525R1Z9</span>
          <div className="flex gap-4 items-center">
            <a href="tel:+918610359797" className="hover:text-[#1769AA] transition-colors">📞 +91 8610359797</a>
          </div>
        </div>
      </div>

      {/* Main Single Header & Navigation Row: Logo -> Navigation -> Search -> Account/Cart */}
      <div className="bg-white">
        <div className="header-inner py-3 sm:py-3.5 flex items-center justify-between gap-3 md:gap-4 lg:gap-6 flex-nowrap">
          {/* 1. Brand / Logo (Left) */}
          <Link to="/" className="brand logo flex-shrink-0 flex items-center group" aria-label={`${COMPANY_NAME} Home`}>
            <VeeElectricalsLogo variant="full" size="md" id="header-logo" />
          </Link>

          {/* 2. Desktop Navigation with Lavalamp Animation (Between Logo and Search) */}
          <nav
            ref={navContainerRef}
            className="header-nav hidden lg:flex items-center flex-row flex-nowrap relative select-none flex-shrink-0 gap-0.5 lg:gap-1"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {navLinks.map((link, index) => {
              const isActive = activeIndex === index;
              const isHovered = hoveredIndex === index;
              const isSelected = isHovered || (hoveredIndex === null && isActive);

              return (
                <Link
                  key={link.to}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  to={link.to}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  className={`relative z-10 block px-2 py-1.5 lg:px-3.5 lg:py-2 text-xs lg:text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors duration-200 select-none ${
                    isSelected
                      ? "text-[#1769AA] font-semibold"
                      : "text-[#0B3A63] hover:text-[#1769AA]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Lavalamp moving indicator */}
            <div
              className="animation"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                top: `${indicatorStyle.top}px`,
                height: `${indicatorStyle.height}px`,
                opacity: indicatorStyle.opacity,
                transition: hasMounted ? "all .5s ease 0s" : "none",
              }}
              aria-hidden="true"
            />
          </nav>

          {/* 3. Search Bar (Between Navigation and Actions) */}
          <form onSubmit={handleSearch} className="search flex-1 min-w-0 sm:min-w-[120px] lg:min-w-[180px] hidden sm:flex items-center">
            <div className="relative w-full min-w-0 group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for switches, wires, appliances..."
                className="w-full min-w-0 bg-[#F6F8FA] border border-[#D9E1E8] text-[#17212B] text-sm rounded-full pl-4 pr-12 lg:pl-5 lg:pr-14 py-2 lg:py-2.5 outline-none focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 transition-all shadow-inner"
              />
              <button type="submit" className="absolute right-1.5 top-1.5 bottom-1.5 bg-[#1769AA] hover:bg-[#0B3A63] text-white p-1.5 lg:p-2 rounded-full transition-colors flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
            </div>
          </form>

          {/* 4. Actions: Account & Cart (Right) */}
          <div className="header-actions flex items-center gap-3 sm:gap-4 lg:gap-6 ml-auto sm:ml-0 flex-shrink-0">
            <Link to={getAccountLink()} className="hidden sm:flex flex-col items-center text-[#667085] hover:text-[#1769AA] transition-colors group">
              <div className="p-2 bg-transparent rounded-full group-hover:bg-[#F6F8FA] transition-colors">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <span className="text-[10px] sm:text-xs font-medium -mt-1 whitespace-nowrap">My Account</span>
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
              <span className="text-[10px] sm:text-xs font-medium -mt-1 whitespace-nowrap">Cart</span>
            </Link>

            {/* Mobile menu toggle */}
            <button className="lg:hidden p-2 text-[#0B3A63] hover:bg-[#F6F8FA] rounded-md transition-colors" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden site-container pb-4">
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

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <nav className="mobile-nav lg:hidden bg-[#0B3A63] site-container pb-4 animate-in slide-in-from-top-2 duration-200">
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
