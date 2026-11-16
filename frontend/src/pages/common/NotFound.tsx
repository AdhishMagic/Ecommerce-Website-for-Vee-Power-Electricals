import { Link } from 'react-router-dom';
import { Home, ShoppingBag, ArrowLeft, Search, PhoneCall } from 'lucide-react';
import SEOHead from '../../components/common/SEOHead';
import CustomerLayout from '../../layouts/CustomerLayout';

export default function NotFound() {
  return (
    <CustomerLayout>
      <SEOHead
        title="404 - Page Not Found"
        description="The electrical product or page you are looking for might have been moved, renamed, or is temporarily unavailable."
        robots="noindex, follow"
      />
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-xl w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-50 text-[#0B3A63] mb-6">
            <span className="text-4xl font-extrabold tracking-tight">404</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
            Page or Product Not Found
          </h1>

          <p className="text-slate-600 mb-8 max-w-md mx-auto text-sm sm:text-base">
            The page or electrical item you are looking for might have been updated, had its URL changed, or is currently unavailable.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B3A63] text-white text-sm font-medium hover:bg-[#082846] transition-colors shadow-xs"
            >
              <Home className="w-4 h-4" />
              Return to Homepage
            </Link>

            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors shadow-xs"
            >
              <ShoppingBag className="w-4 h-4" />
              Browse Shop Catalog
            </Link>
          </div>

          <div className="border-t border-slate-200 pt-8">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Popular Product Categories
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to="/shop?category=wires-and-cables"
                className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors"
              >
                Wires & Cables
              </Link>
              <Link
                to="/shop?category=mcb-and-distribution"
                className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors"
              >
                MCB & Distribution
              </Link>
              <Link
                to="/shop?category=modular-switches"
                className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors"
              >
                Modular Switches
              </Link>
              <Link
                to="/shop?category=fans"
                className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors"
              >
                Ceiling Fans
              </Link>
              <Link
                to="/shop?category=led-lighting"
                className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors"
              >
                LED Lighting
              </Link>
            </div>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
