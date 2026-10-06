import { ChevronLeft, ChevronRight } from "lucide-react";

interface AdminPaginationProps {
  /** Authoritative row count reported by the backend pagination metadata. */
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Noun used in the "Showing X to Y of Z <label>" copy. */
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
}

/**
 * Shared server-side pagination footer.
 *
 * Every value shown here comes from the backend pagination envelope (`count`,
 * `page`, `total_pages`). Nothing is derived from the length of the current page,
 * so totals stay correct no matter how large the underlying table grows.
 */
export default function AdminPagination({
  totalCount,
  page,
  pageSize,
  totalPages,
  label,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: AdminPaginationProps) {
  if (disabled || totalCount <= 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  return (
    <div className="bg-[#F8FAFC] border-t border-[#E5E9EB] p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
      <div>
        Showing <strong className="text-slate-800">{startItem.toLocaleString("en-IN")}</strong> to{" "}
        <strong className="text-slate-800">{endItem.toLocaleString("en-IN")}</strong> of{" "}
        <strong className="text-slate-800">{totalCount.toLocaleString("en-IN")}</strong> {label}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1 font-semibold text-slate-700">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
