import React from "react";
import { User } from "../../types/user";

export type CustomerTabId = "orders" | "addresses" | "profile";

interface CustomerSidebarProps {
  user: User | null;
  activeTab: CustomerTabId;
  onSelectTab: (tabId: CustomerTabId) => void;
  onLogout: () => void;
  ordersCount?: number;
}

export default function CustomerSidebar({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  ordersCount,
}: CustomerSidebarProps) {
  const cleanLastName = (user?.last_name || "").trim().toLowerCase() === "user" ? "" : (user?.last_name || "").trim();
  let displayName = user?.name?.trim() || [user?.first_name, cleanLastName].filter(Boolean).join(" ");
  if (displayName && displayName.toLowerCase().endsWith(" user") && displayName.toLowerCase() !== "user") {
    displayName = displayName.replace(/\s+user$/i, "").trim();
  }
  displayName = displayName || user?.first_name || "Customer";
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "C";
  const displayEmail = user?.email || "customer@veepower.in";

  const navItems = [
    {
      id: "orders" as CustomerTabId,
      label: "My Orders",
      badge: typeof ordersCount === "number" && ordersCount > 0 ? ordersCount : undefined,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      id: "addresses" as CustomerTabId,
      label: "Saved Addresses",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: "profile" as CustomerTabId,
      label: "Profile Settings",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full min-w-0 max-w-full">
      {/* Mobile/Tablet Compact View (< 1024px) */}
      <div className="lg:hidden mb-6 space-y-3 min-w-0 max-w-full">
        {/* Profile Card Header */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-4 shadow-xs flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#0B3A63] text-[#F2A900] font-bold text-lg flex items-center justify-center shrink-0 border-2 border-[#1769AA]/30 shadow-xs">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[#17212B] text-sm truncate" style={{ fontFamily: "Outfit, sans-serif" }}>
                {displayName}
              </p>
              <p className="text-xs text-[#667085] truncate" title={displayEmail}>
                {displayEmail}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            type="button"
            className="shrink-0 p-2 text-xs font-medium text-[#C0392B] hover:bg-[#FEF2F2] rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-red-200"
            title="Sign out of your account"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>

        {/* Horizontal Navigation Pills with smooth touch scroll */}
        <div className="w-full min-w-0 max-w-full flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  isActive
                    ? "bg-[#0B3A63] text-white shadow-xs"
                    : "bg-white text-[#667085] hover:text-[#17212B] border border-[#D9E1E8] hover:bg-[#F6F8FA]"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {typeof item.badge !== "undefined" && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-[#0B3A63]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Vertical Sidebar (>= 1024px) */}
      <div className="hidden lg:block bg-white border border-[#D9E1E8] rounded-2xl overflow-hidden shadow-xs sticky top-24">
        {/* Profile Header */}
        <div className="bg-[#0B3A63] px-5 py-6 text-center relative overflow-hidden">
          {/* Subtle decorative background circle */}
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
          <div className="w-16 h-16 bg-[#F2A900] rounded-full flex items-center justify-center mx-auto mb-3 shadow-md border-3 border-white/20 relative z-10">
            <span className="text-[#0B3A63] font-bold text-2xl tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
              {initial}
            </span>
          </div>
          <h3
            className="font-bold text-white text-base truncate relative z-10"
            style={{ fontFamily: "Outfit, sans-serif" }}
            title={displayName}
          >
            {displayName}
          </h3>
          <p className="text-white/75 text-xs mt-1 truncate relative z-10 px-2" title={displayEmail}>
            {displayEmail}
          </p>
        </div>

        {/* Navigation Links */}
        <div className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all text-left font-medium ${
                  isActive
                    ? "bg-[#EFF6FF] text-[#1769AA] font-semibold border-l-4 border-[#1769AA] shadow-xs"
                    : "text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={isActive ? "text-[#1769AA]" : "text-[#667085]"}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
                {typeof item.badge !== "undefined" && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isActive ? "bg-[#1769AA] text-white" : "bg-[#F1F5F9] text-[#667085]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Divider and Logout */}
          <div className="pt-2 mt-2 border-t border-[#D9E1E8]">
            <button
              onClick={onLogout}
              type="button"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm text-[#667085] hover:text-[#C0392B] hover:bg-[#FEF2F2] rounded-xl transition-colors font-medium text-left"
            >
              <svg className="w-4 h-4 text-[#667085] group-hover:text-[#C0392B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
