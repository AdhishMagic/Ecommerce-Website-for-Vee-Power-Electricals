import { Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { calculateStockStatus } from "../../context/ShopContext";
import type { Product } from "../../types/product";

import { resolveProductImage, handleProductImageError } from "../../utils/productImageResolver";

interface Props {
  product: Product;
  compact?: boolean;
}

export default function ProductCard({ product, compact }: Props) {
  const { addToCart } = useCart();
  const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);
  const stockStatus = calculateStockStatus(product.stock, product.lowStockThreshold);
  const inStock = stockStatus !== "OUT OF STOCK";
  const lowStock = stockStatus === "LOW STOCK";
  const cardImage = resolveProductImage(product);

  return (
    <div className={`bg-white rounded-xl border border-[#D9E1E8] hover:shadow-md hover:border-[#1769AA]/40 hover:-translate-y-0.5 transition-all duration-200 group flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-[#1769AA] ${compact ? "" : ""}`}>
      {/* Image */}
      <Link to={`/product/${product.id}`} className="block relative overflow-hidden bg-[#F8FAFC]">
        <div className={`w-full flex items-center justify-center p-2.5 ${compact ? "h-36" : "h-48"}`}>
          <img
            src={cardImage}
            alt={`${product.name} - ${product.brand}`}
            loading="lazy"
            decoding="async"
            width={compact ? 240 : 320}
            height={compact ? 144 : 192}
            className="w-full h-full object-contain group-hover:scale-[1.04] transition-transform duration-300"
            onError={(e) => handleProductImageError(e, product.category)}
          />
        </div>
        {discount > 0 && (
          <span className="absolute top-2 left-2 bg-[#F2A900] text-[#0B3A63] text-xs font-bold px-2 py-0.5 rounded shadow-2xs">
            {discount}% OFF
          </span>
        )}
        {!inStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <span className="text-[#C0392B] font-semibold text-sm bg-white px-3 py-1 rounded border border-[#C0392B]/30 shadow-2xs">Out of Stock</span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-col flex-1 p-3.5 gap-1">
        <span className="text-[10px] text-[#1769AA] font-semibold uppercase tracking-wider">{product.brand}</span>
        <Link to={`/product/${product.id}`} className="text-sm font-medium text-[#17212B] hover:text-[#1769AA] leading-snug line-clamp-2 transition-colors duration-150">
          {product.name}
        </Link>
        {!compact && (
          <p className="text-xs text-[#667085] line-clamp-1">
            {Object.entries(product.specifications).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" | ")}
          </p>
        )}

        {/* Price */}
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold text-[#0B3A63]">₹{product.price.toLocaleString("en-IN")}</span>
            {discount > 0 && (
              <span className="text-xs text-[#667085] line-through">₹{product.mrp.toLocaleString("en-IN")}</span>
            )}
          </div>

          {/* Stock */}
          <div className="flex items-center justify-between mt-2">
            {lowStock ? (
              <span className="text-xs text-[#B45309] font-medium">⚠ Only {product.stock} left</span>
            ) : inStock ? (
              <span className="text-xs text-[#12773D] font-medium">✓ In Stock</span>
            ) : (
              <span className="text-xs text-[#C0392B] font-medium">Out of Stock</span>
            )}
          </div>

          <button
            disabled={!inStock}
            onClick={(e) => { e.preventDefault(); addToCart(product); }}
            className={`mt-2 w-full py-2 text-xs font-semibold rounded-lg border transition-all duration-200 active:scale-[0.98] ${
              inStock 
                ? "bg-[#0B3A63] text-white hover:bg-[#1769AA] border-transparent shadow-2xs hover:shadow-xs cursor-pointer" 
                : "bg-gray-200 text-gray-500 border-gray-200 cursor-not-allowed"
            }`}
          >
            {inStock ? "Add to Cart" : "Out of Stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
