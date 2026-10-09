export default function BrandGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6"
      aria-busy="true"
      aria-label="Loading brands"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs animate-pulse flex flex-col justify-between h-[210px]"
        >
          {/* Logo container skeleton */}
          <div className="w-full h-20 bg-slate-100 rounded-lg flex items-center justify-center mb-4" />
          
          {/* Brand details skeleton */}
          <div className="space-y-2 text-center">
            <div className="h-4 bg-slate-200 rounded-md w-3/4 mx-auto" />
            <div className="h-3 bg-slate-100 rounded-md w-1/2 mx-auto" />
          </div>

          {/* Action skeleton */}
          <div className="h-3 bg-slate-100 rounded-md w-2/3 mx-auto mt-4" />
        </div>
      ))}
    </div>
  );
}
