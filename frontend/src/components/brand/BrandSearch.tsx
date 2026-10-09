export type BrandSortOption = "name-asc" | "name-desc" | "products-desc";

interface BrandSearchProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: BrandSortOption;
  onSortChange: (sort: BrandSortOption) => void;
  totalResults: number;
}

export default function BrandSearch({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  totalResults,
}: BrandSearchProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-white border border-[#E2E8F0] p-3 sm:p-4 rounded-xl shadow-xs">
      {/* Search Input Container */}
      <div className="relative flex-1 min-w-[200px]">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search brands..."
          id="brand-search-input"
          aria-label="Search brands"
          className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-[#CBD5E1] rounded-lg text-sm text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20 transition-all duration-150"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Clear search"
            title="Clear search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Controls / Sort Dropdown */}
      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
          {totalResults} {totalResults === 1 ? "brand" : "brands"}
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="brand-sort-select" className="text-xs text-slate-500 font-medium hidden md:inline-block">
            Sort by:
          </label>
          <select
            id="brand-sort-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as BrandSortOption)}
            aria-label="Sort brands"
            className="bg-slate-50 border border-[#CBD5E1] text-slate-700 text-xs sm:text-sm rounded-lg px-3 py-2 outline-none focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20 transition-all cursor-pointer font-medium"
          >
            <option value="name-asc">Name (A – Z)</option>
            <option value="name-desc">Name (Z – A)</option>
            <option value="products-desc">Most Products</option>
          </select>
        </div>
      </div>
    </div>
  );
}
