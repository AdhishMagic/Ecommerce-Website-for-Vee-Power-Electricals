import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth, User } from "../../context/AuthContext";
import VeeElectricalsLogo from "../brand/VeeElectricalsLogo";
import { COMPANY_ADDRESS, COMPANY_NAME } from "../../constants/companyInfo";

/**
 * Resolves user display name according to the strict fallback order:
 * 1. Display name (user.name)
 * 2. First name (user.first_name)
 * 3. Email address (truncated / formatted)
 * 4. Fallback "My Account"
 */
export function getUserDisplayName(user: User | null): string {
  if (!user) return "My Account";

  // 1. Display name
  if (user.name && user.name.trim() && user.name.trim() !== user.email) {
    let clean = user.name.trim();
    if (clean.toLowerCase().endsWith(' user') && clean.toLowerCase() !== 'user') {
      clean = clean.replace(/\s+user$/i, '').trim();
    }
    return clean;
  }

  // 2. First name
  if (user.first_name && user.first_name.trim()) {
    return user.first_name.trim();
  }

  // Username fallback if available
  if (user.username && user.username.trim()) {
    return user.username.trim();
  }

  // 3. Email address, truncated if necessary
  if (user.email && user.email.trim()) {
    const localPart = user.email.split("@")[0];
    if (localPart && localPart.length <= 12) {
      return localPart;
    }
    return user.email.length > 15 ? `${user.email.slice(0, 12)}…` : user.email;
  }

  // 4. Default fallback
  return "My Account";
}

export default function Header() {
  const { totalItems } = useCart();
  const { isAuthenticated, user, isBootstrapping, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = Boolean(user && (user.role?.toLowerCase() === "admin" || user.is_admin === true));
  const displayName = getUserDisplayName(user);

  const getLoginUrl = useCallback(() => {
    const currentPath = location.pathname;
    if (
      currentPath &&
      currentPath !== "/login" &&
      currentPath !== "/register" &&
      currentPath !== "/admin/login" &&
      currentPath !== "/forgot-password" &&
      currentPath !== "/reset-password"
    ) {
      return `/login?redirect=${encodeURIComponent(currentPath + location.search)}`;
    }
    return "/login";
  }, [location.pathname, location.search]);

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    await logout();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setMobileMenuOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    if (accountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [accountMenuOpen]);

  // Close on route change
  useEffect(() => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const handleAccountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setAccountMenuOpen(false);
    }
  };

  const navLinks = [
    { label: "Shop", to: "/shop" },
    { label: "Categories", to: "/categories" },
    { label: "Brands", to: "/shop?view=brands" },
    { label: "About", to: "/about" },
    { label: "Contact", to: "/contact" },
  ];

  const getActiveIndex = useCallback(() => {
    const currentPath = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const currentView = searchParams.get("view");

    if (currentPath === "/categories") return 1;
    if (currentPath === "/brands") return 2;
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

      {/* Main Single Header & Navigation Row: Logo + Nav (Left) -> Search (Flexible) -> Account & Cart (Right) */}
      <div className="bg-white">
        <div className="header-inner py-3 sm:py-3.5 flex items-center justify-between gap-3 md:gap-4 lg:gap-6 flex-nowrap">
          {/* Left: Brand Logo & Desktop Nav Links */}
          <div className="flex items-center gap-4 lg:gap-6 xl:gap-8 flex-shrink-0 min-w-0">
            <Link to="/" className="brand logo flex-shrink-0 flex items-center group" aria-label={`${COMPANY_NAME} Home`}>
              <VeeElectricalsLogo variant="full" size="md" id="header-logo" />
            </Link>

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
          </div>

          {/* Center/Right: Search Bar with Balanced Width */}
          <form
            onSubmit={handleSearch}
            className="search flex-1 min-w-0 sm:min-w-[140px] md:min-w-[180px] max-w-[260px] md:max-w-[320px] lg:max-w-[380px] xl:max-w-[440px] hidden sm:flex items-center ml-auto"
          >
            <div className="relative w-full min-w-0 group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for switches, wires, appliances..."
                className="w-full min-w-0 bg-[#F6F8FA] border border-[#D9E1E8] text-[#17212B] text-xs lg:text-sm rounded-full pl-4 pr-11 lg:pl-5 lg:pr-12 py-2 lg:py-2.5 outline-none focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 transition-all shadow-inner"
              />
              <button
                type="submit"
                aria-label="Submit search"
                className="absolute right-1 top-1 bottom-1 bg-[#1769AA] hover:bg-[#0B3A63] text-white px-2.5 rounded-full transition-colors flex items-center justify-center cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* Right: Actions (Account, Cart, Mobile Menu Toggle) */}
          <div className="header-actions flex items-center gap-3 sm:gap-4 lg:gap-5 flex-shrink-0">
            {/* Account Display (Auth-Aware) */}
            {isBootstrapping && !user ? (
              <div className="hidden sm:flex flex-col items-center text-[#667085] animate-pulse" aria-hidden="true">
                <div className="p-2">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-200" />
                </div>
                <div className="w-10 h-2.5 bg-slate-200 rounded -mt-1" />
              </div>
            ) : isAuthenticated && user ? (
              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  onKeyDown={handleAccountKeyDown}
                  className="hidden sm:flex flex-col items-center text-[#667085] hover:text-[#1769AA] transition-colors group focus:outline-none cursor-pointer"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${displayName}`}
                >
                  <div className="p-2 bg-transparent rounded-full group-hover:bg-[#F6F8FA] transition-colors relative">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {isAdmin && (
                      <span
                        className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#1769AA] rounded-full border-2 border-white shadow-xs"
                        title="Administrator"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 -mt-1 text-[10px] sm:text-xs font-medium">
                    <span className="max-w-[75px] md:max-w-[100px] truncate" title={displayName}>
                      {displayName}
                    </span>
                    <svg
                      className={`w-3 h-3 transition-transform duration-200 text-[#667085] group-hover:text-[#1769AA] ${
                        accountMenuOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Account options"
                    className="absolute right-0 top-full mt-2 w-52 bg-white rounded-lg shadow-xl border border-[#D9E1E8] py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                    onKeyDown={handleAccountKeyDown}
                  >
                    {/* Identity header */}
                    <div className="px-3.5 py-2 border-b border-[#D9E1E8] bg-[#F6F8FA]">
                      <p className="text-xs font-semibold text-[#0B3A63] truncate" title={displayName}>
                        {displayName}
                      </p>
                      {user.email && (
                        <p className="text-[11px] text-[#667085] truncate" title={user.email}>
                          {user.email}
                        </p>
                      )}
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-[#1769AA]/10 text-[#1769AA]">
                        {isAdmin ? "Admin" : "Customer"}
                      </span>
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      {isAdmin ? (
                        <>
                          <Link
                            to="/admin"
                            role="menuitem"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#17212B] hover:bg-[#F6F8FA] hover:text-[#1769AA] transition-colors"
                          >
                            <svg className="w-4 h-4 text-[#1769AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Admin Dashboard
                          </Link>
                          <Link
                            to="/admin/settings"
                            role="menuitem"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#17212B] hover:bg-[#F6F8FA] hover:text-[#1769AA] transition-colors"
                          >
                            <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Settings
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link
                            to="/account"
                            role="menuitem"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#17212B] hover:bg-[#F6F8FA] hover:text-[#1769AA] transition-colors"
                          >
                            <svg className="w-4 h-4 text-[#1769AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            My Account
                          </Link>
                          <Link
                            to="/account/orders"
                            role="menuitem"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#17212B] hover:bg-[#F6F8FA] hover:text-[#1769AA] transition-colors"
                          >
                            <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            My Orders
                          </Link>
                        </>
                      )}

                      <div className="my-1 border-t border-[#D9E1E8]" />

                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#C0392B] hover:bg-[#FEF2F2] transition-colors text-left cursor-pointer"
                      >
                        <svg className="w-4 h-4 text-[#C0392B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to={getLoginUrl()}
                className="hidden sm:flex flex-col items-center text-[#667085] hover:text-[#1769AA] transition-colors group"
                aria-label="Login to your account"
              >
                <div className="p-2 bg-transparent rounded-full group-hover:bg-[#F6F8FA] transition-colors">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-[10px] sm:text-xs font-semibold -mt-1 whitespace-nowrap text-[#0B3A63] group-hover:text-[#1769AA]">
                  Login
                </span>
              </Link>
            )}

            {/* Cart Link & Badge */}
            <Link to="/cart" className="flex flex-col items-center text-[#667085] hover:text-[#1769AA] transition-colors group relative">
              <div className="p-2 bg-transparent rounded-full group-hover:bg-[#F6F8FA] transition-colors relative">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {totalItems > 0 && (
                  <span className="absolute top-1 right-1 bg-[#F2A900] text-[#0B3A63] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm border border-white transform translate-x-1/2 -translate-y-1/2">
                    {totalItems}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-xs font-medium -mt-1 whitespace-nowrap">Cart</span>
            </Link>

            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-2 text-[#0B3A63] hover:bg-[#F6F8FA] rounded-md transition-colors cursor-pointer"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile search row */}
        <div className="sm:hidden site-container pb-4">
          <form onSubmit={handleSearch} className="flex relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-[#F6F8FA] border border-[#D9E1E8] text-sm rounded-full pl-4 pr-12 py-2.5 outline-none focus:border-[#1769AA]"
            />
            <button type="submit" aria-label="Search products" className="absolute right-1 top-1 bottom-1 bg-[#1769AA] text-white p-2 rounded-full cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <nav className="mobile-nav lg:hidden bg-[#0B3A63] site-container pb-4 animate-in slide-in-from-top-2 duration-200">
          <ul className="flex flex-col">
            {navLinks.map((link) => (
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

            {/* Auth-aware Mobile Account Options */}
            {isBootstrapping && !user ? (
              <li className="py-3 text-sm text-white/60 animate-pulse">Loading account...</li>
            ) : isAuthenticated && user ? (
              <li className="pt-3 border-t border-white/15">
                <div className="flex items-center gap-2.5 py-2 px-1 text-white">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate text-white">{displayName}</p>
                    {user.email && <p className="text-xs text-white/70 truncate">{user.email}</p>}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/20 text-white">
                    {isAdmin ? "Admin" : "Customer"}
                  </span>
                </div>

                <div className="flex flex-col mt-2 pl-2">
                  {isAdmin ? (
                    <>
                      <Link
                        to="/admin"
                        className="block py-2 text-sm text-white/90 hover:text-white"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Admin Dashboard
                      </Link>
                      <Link
                        to="/admin/settings"
                        className="block py-2 text-sm text-white/90 hover:text-white"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Settings
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/account"
                        className="block py-2 text-sm text-white/90 hover:text-white"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        My Account
                      </Link>
                      <Link
                        to="/account/orders"
                        className="block py-2 text-sm text-white/90 hover:text-white"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        My Orders
                      </Link>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-left py-2 text-sm text-red-300 hover:text-red-100 font-medium cursor-pointer"
                  >
                    Logout
                  </button>
                </div>
              </li>
            ) : (
              <li className="pt-3">
                <Link
                  to={getLoginUrl()}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 text-sm font-semibold text-[#0B3A63] bg-white rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Login / Sign In
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
