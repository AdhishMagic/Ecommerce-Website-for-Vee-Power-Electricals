import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";

const navItems = [
  { path: "/admin", label: "Dashboard", icon: "📊", exact: true },
  { path: "/admin/products", label: "Products", icon: "📦" },
  { path: "/admin/inventory", label: "Inventory", icon: "🏭" },
  { path: "/admin/orders", label: "Orders", icon: "🛒" },
  { path: "/admin/customers", label: "Customers", icon: "👥" },
  { path: "/admin/import", label: "Import Products", icon: "📤" },
  { path: "/admin/settings", label: "Settings", icon: "⚙️" },
];

export default function AdminLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="flex h-screen bg-[#F0F4F8] overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-[#0B3A63] flex flex-col transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#F2A900] rounded-md flex items-center justify-center">
              <span className="text-[#0B3A63] font-bold text-base" style={{ fontFamily: "Outfit" }}>V</span>
            </div>
            <div>
              <p className="text-white font-bold text-xs leading-tight" style={{ fontFamily: "Outfit" }}>VEE POWER</p>
              <p className="text-white/50 text-[9px] uppercase tracking-wider">Admin Panel</p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${isActive(item.path, item.exact) ? "bg-white/15 text-white font-medium border-r-2 border-[#F2A900]" : "text-white/70 hover:text-white hover:bg-white/10"}`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-white/10">
          <Link to="/" className="flex items-center gap-2 text-white/60 hover:text-white text-xs transition-colors">
            <span>←</span> View Store
          </Link>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-[#D9E1E8] px-5 py-3 flex items-center gap-3 z-30">
          <button className="lg:hidden text-[#667085]" onClick={() => setSidebarOpen(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <input
            type="text"
            placeholder="Search products, orders..."
            className="hidden sm:block flex-1 max-w-xs bg-[#F6F8FA] border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1769AA] placeholder-[#667085]"
          />
          <div className="ml-auto flex items-center gap-3">
            <button className="relative text-[#667085] hover:text-[#17212B]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#F2A900] rounded-full text-[8px] font-bold text-[#0B3A63] flex items-center justify-center">3</span>
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-[#D9E1E8]">
              <div className="w-7 h-7 bg-[#0B3A63] rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">A</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-[#17212B]">Admin</p>
                <p className="text-[10px] text-[#667085]">admin@veepower.com</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
