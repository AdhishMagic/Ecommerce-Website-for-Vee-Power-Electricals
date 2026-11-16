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
  const { addToCart, items, updateQty, removeFromCart } = useCart();
  const cartItem = items.find((i) => String(i.product.id) === String(product.id));
  const quantityInCart = cartItem ? cartItem.quantity : 0;

  const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);
  const stockStatus = calculateStockStatus(product.stock, product.lowStockThreshold);
  const inStock = stockStatus !== "OUT OF STOCK";
  const lowStock = stockStatus === "LOW STOCK";
  const cardImage = resolveProductImage(product);
  const productUrl = `/product/${product.slug || product.id}`;
  const descriptiveAlt = `${product.brand ? `${product.brand} ` : ''}${product.name} - Genuine Electrical Goods at Vee Power Electricals`;

  return (
    <div className={`bg-white rounded-xl border border-[#D9E1E8] hover:shadow-md hover:border-[#1769AA]/40 hover:-translate-y-0.5 transition-all duration-200 group flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-[#1769AA] ${compact ? "" : ""}`}>
      {/* Image */}
      <Link to={productUrl} className="block relative overflow-hidden bg-[#F8FAFC]">
        <div className={`w-full flex items-center justify-center p-2.5 ${compact ? "h-36" : "h-48"}`}>
          <img
            src={cardImage}
            alt={descriptiveAlt}
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
        <Link to={productUrl} className="text-sm font-medium text-[#17212B] hover:text-[#1769AA] leading-snug line-clamp-2 transition-colors duration-150">
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

          {inStock && quantityInCart > 0 ? (
            <div className="mt-2 flex items-center gap-1.5 w-full">
              {/* In-Card Quantity Adjuster */}
              <div className="flex items-center border border-[#1769AA]/40 rounded-lg bg-[#F8FAFC] overflow-hidden shrink-0 shadow-2xs">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (quantityInCart <= 1) {
                      removeFromCart(product.id);
                    } else {
                      updateQty(product.id, quantityInCart - 1);
                    }
                  }}
                  className="w-7 h-8 flex items-center justify-center text-sm font-bold text-[#0B3A63] hover:bg-[#E2E8F0] active:scale-95 transition-colors cursor-pointer select-none"
                  title="Decrease quantity"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-7 text-center text-xs font-bold text-[#0B3A63] select-none">
                  {quantityInCart}
                </span>
                <button
                  type="button"
                  disabled={product.stock !== undefined && quantityInCart >= product.stock}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    updateQty(product.id, quantityInCart + 1);
                  }}
                  className="w-7 h-8 flex items-center justify-center text-sm font-bold text-[#0B3A63] hover:bg-[#E2E8F0] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                  title="Increase quantity"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              {/* Go to Cart button */}
              <Link
                to="/cart"
                onClick={(e) => e.stopPropagation()}
                className="flex-1 h-8 px-2 py-1 text-center text-xs font-bold rounded-lg bg-[#F2A900] hover:bg-[#DDA006] text-[#0B3A63] transition-colors shadow-2xs flex items-center justify-center gap-1 cursor-pointer truncate"
              >
                <span>Go to Cart</span>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          ) : (
            <button
              disabled={!inStock}
              onClick={(e) => { e.preventDefault(); addToCart(product); }}
              className={`mt-2 w-full py-2 text-xs font-semibold rounded-lg border transition-all duration-200 active:scale-[0.98] ${
                inStock 
                  ? "bg-[#0B3A63] text-white hover:bg-[#1769AA] border-transparent shadow-2xs hover:shadow-xs cursor-pointer flex items-center justify-center gap-1.5" 
                  : "bg-gray-200 text-gray-500 border-gray-200 cursor-not-allowed"
              }`}
            >
              {inStock ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span>Add to Cart</span>
                </>
              ) : (
                "Out of Stock"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
