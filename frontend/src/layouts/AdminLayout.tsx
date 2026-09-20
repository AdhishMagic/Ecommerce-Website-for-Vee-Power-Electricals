import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  BarChart2,
  Wallet,
  LogOut,
  Menu,
  X,
  ChevronDown,
  RefreshCw,
  Package,
  ClipboardList,
  Tags,
  Users,
  Upload,
  Settings,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import VeeElectricalsLogo from "../components/brand/VeeElectricalsLogo";

type SubItem = {
  path: string;
  label: string;
};

type NavItem = {
  label: string;
  icon: ReactNode;
  path?: string;
  exact?: boolean;
  subItems?: SubItem[];
};

const navItems: NavItem[] = [
  {
    path: "/admin",
    label: "Dashboard",
    icon: <LayoutDashboard className="w-5 h-5" />,
    exact: true,
  },
  {
    path: "/admin/products",
    label: "Products",
    icon: <Package className="w-5 h-5" />,
  },
  {
    path: "/admin/categories",
    label: "Categories",
    icon: <Tags className="w-5 h-5" />,
  },
  {
    path: "/admin/inventory",
    label: "Inventory",
    icon: <ClipboardList className="w-5 h-5" />,
  },
  {
    label: "Orders",
    icon: <ShoppingCart className="w-5 h-5" />,
    subItems: [
      {
        path: "/admin/orders",
        label: "All Orders",
      },
      {
        path: "/admin/orders/transactions",
        label: "Transactions",
      },
      {
        path: "/admin/orders/shipping",
        label: "Shipping",
      },
    ],
  },
  {
    label: "Analytics",
    icon: <BarChart2 className="w-5 h-5" />,
    subItems: [
      {
        path: "/admin/analytics/products",
        label: "Products",
      },
      {
        path: "/admin/analytics/traffic",
        label: "Traffic",
      },
    ],
  },
  {
    label: "Finance",
    icon: <Wallet className="w-5 h-5" />,
    subItems: [
      {
        path: "/admin/finance/expenses",
        label: "Expenses",
      },
      {
        path: "/admin/finance/quotations",
        label: "Quotations",
      },
      {
        path: "/admin/finance/clients",
        label: "Clients",
      },
      {
        path: "/admin/finance/invoices",
        label: "Invoices",
      },
      {
        path: "/admin/finance/summary",
        label: "Summary",
      },
    ],
  },
  {
    path: "/admin/customers",
    label: "Customers",
    icon: <Users className="w-5 h-5" />,
  },
  {
    path: "/admin/import",
    label: "Import Products",
    icon: <Upload className="w-5 h-5" />,
  },
  {
    path: "/admin/settings",
    label: "Settings",
    icon: <Settings className="w-5 h-5" />,
  },
];

export default function AdminLayout() {
  const location = useLocation();
  const { logout, user } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const toggleSubmenu = (label: string) => {
    setOpenMenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const isActive = (path?: string, exact?: boolean) => {
    if (!path) return false;

    return exact
      ? location.pathname === path
      : location.pathname.startsWith(path);
  };

  const isSubmenuActive = (subItems?: SubItem[]) => {
    if (!subItems) return false;

    return subItems.some(
      (item) =>
        location.pathname === item.path ||
        location.pathname.startsWith(item.path + "/")
    );
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const getPageTitle = () => {
    if (location.pathname === "/admin") {
      return "Dashboard";
    }

    for (const item of navItems) {
      if (item.path && isActive(item.path, item.exact)) {
        return item.label;
      }

      if (item.subItems) {
        const sub = item.subItems.find(
          (subItem) =>
            location.pathname === subItem.path ||
            location.pathname.startsWith(subItem.path + "/")
        );

        if (sub) {
          return sub.label;
        }
      }
    }

    return "Admin Panel";
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
          }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
          <Link
            to="/admin"
            className="flex items-center hover:opacity-90 transition-opacity"
          >
            <VeeElectricalsLogo
              variant="compact"
              size="sm"
              theme="light"
              id="admin-logo"
            />
          </Link>

          <button
            className="lg:hidden text-slate-500 hover:text-[#0B3A63]"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin Panel Label */}
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[#0B3A63] text-xs uppercase font-semibold tracking-wider">
            Admin Panel
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const hasSubmenu = !!item.subItems;
            const menuOpen =
              openMenus[item.label] || isSubmenuActive(item.subItems);

            const active =
              isActive(item.path, item.exact) ||
              isSubmenuActive(item.subItems);

            return (
              <div key={item.label} className="mb-1">
                {hasSubmenu ? (
                  <button
                    onClick={() => toggleSubmenu(item.label)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${active
                        ? "bg-[#0B3A63]/5 text-[#0B3A63] font-semibold"
                        : "text-slate-600 hover:bg-slate-100 hover:text-[#0B3A63]"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          active ? "text-[#0B3A63]" : "text-slate-400"
                        }
                      >
                        {item.icon}
                      </span>

                      <span className="text-sm">{item.label}</span>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-180" : ""
                        }`}
                    />
                  </button>
                ) : (
                  <Link
                    to={item.path!}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${active
                        ? "bg-[#0B3A63]/5 text-[#0B3A63] font-semibold border-l-4 border-[#F2A900]"
                        : "text-slate-600 hover:bg-slate-100 hover:text-[#0B3A63] border-l-4 border-transparent"
                      }`}
                  >
                    <span
                      className={
                        active ? "text-[#0B3A63]" : "text-slate-400"
                      }
                    >
                      {item.icon}
                    </span>

                    <span className="text-sm">{item.label}</span>
                  </Link>
                )}

                {/* Submenu */}
                {hasSubmenu && menuOpen && (
                  <div className="mt-1 ml-4 pl-4 border-l border-slate-200 space-y-1">
                    {item.subItems!.map((sub) => {
                      const subActive = isActive(sub.path, true);

                      return (
                        <Link
                          key={sub.path}
                          to={sub.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`block px-3 py-2 text-sm rounded-md transition-colors ${subActive
                              ? "text-[#0B3A63] font-medium bg-[#0B3A63]/5"
                              : "text-slate-500 hover:text-[#0B3A63] hover:bg-slate-50"
                            }`}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 shrink-0">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden text-slate-500 hover:text-[#0B3A63] transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>

            <h2 className="text-xl font-bold text-[#0B3A63] hidden sm:block">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {/* Current Time */}
            <div className="hidden md:flex items-center text-sm text-slate-500 font-medium">
              {currentTime.toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })}
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className="p-2 text-slate-400 hover:text-[#0B3A63] hover:bg-slate-100 rounded-full transition-colors flex items-center gap-2"
              title="Refresh Page"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="sr-only">Refresh</span>
            </button>

            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

            {/* User */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-[#0B3A63]">
                  {user?.name || "Admin User"}
                </p>

                <p className="text-xs text-slate-500">Administrator</p>
              </div>

              <div className="w-9 h-9 bg-[#0B3A63] text-white rounded-full flex items-center justify-center font-bold shadow-sm border-2 border-[#F2A900]">
                {user?.name
                  ? user.name.charAt(0).toUpperCase()
                  : "A"}
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}