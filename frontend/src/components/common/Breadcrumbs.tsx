import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = [{ label: 'Home', href: '/' }, ...items];

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center text-xs sm:text-sm text-slate-500 overflow-x-auto whitespace-nowrap py-2 ${className}`}
    >
      <ol className="flex items-center space-x-1 sm:space-x-2">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;
          const targetUrl = item.href || item.path;

          return (
            <li key={index} className="inline-flex items-center">
              {index > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 mx-1 shrink-0" aria-hidden="true" />
              )}
              {isLast || !targetUrl ? (
                <span
                  className="font-medium text-slate-800 truncate max-w-[200px] sm:max-w-[320px]"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={targetUrl}
                  className="inline-flex items-center hover:text-[#1769AA] hover:underline transition-colors cursor-pointer"
                >
                  {index === 0 && <Home className="w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
