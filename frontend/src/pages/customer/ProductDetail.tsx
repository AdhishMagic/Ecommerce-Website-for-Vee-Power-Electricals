import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { productService } from "../../services/productService";
import { Product } from "../../types/product";
import { useCart } from "../../context/CartContext";
import ProductCard from "../../components/common/ProductCard";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<Product[]>([]);
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState("description");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchProduct = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const prod = await productService.getProductById(id);
        if (isMounted) {
          if (prod) {
            setProduct(prod);
            // Load related products
            const allInCat = await productService.getProducts({ category: prod.category });
            if (isMounted) {
              setRelated(allInCat.filter(p => String(p.id) !== String(prod.id)).slice(0, 4));
            }
          } else {
            setProduct(null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch product detail:", err);
        if (isMounted) setProduct(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProduct();
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="site-container py-12">
        <div className="grid lg:grid-cols-2 gap-8 animate-pulse">
          <div className="bg-gray-100 rounded-xl h-96 border border-gray-200"></div>
          <div className="space-y-4">
            <div className="h-6 bg-gray-100 rounded w-1/4"></div>
            <div className="h-10 bg-gray-100 rounded w-3/4"></div>
            <div className="h-20 bg-gray-100 rounded"></div>
            <div className="h-12 bg-gray-100 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="site-container py-20 text-center">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-[#0B3A63] mb-2">Product Not Found</h2>
        <p className="text-gray-500 mb-4">The product you are looking for does not exist or has been removed.</p>
        <Link to="/shop" className="text-[#1769AA] underline font-medium">Back to Shop</Link>
      </div>
    );
  }

  const discount = product.mrp > product.price
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0;
  const inStock = product.stock > 0;
  const lowStock = product.stock > 0 && product.stock <= (product.lowStockThreshold || 5);

  const handleAddToCart = () => {
    addToCart(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuyNow = () => {
    addToCart(product, qty);
    navigate("/cart");
  };

  return (
    <div className="site-container py-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-[#667085] mb-6 flex items-center gap-1.5 flex-wrap">
        <Link to="/" className="hover:text-[#1769AA]">Home</Link>
        <span>/</span>
        <Link to="/shop" className="hover:text-[#1769AA]">Shop</Link>
        <span>/</span>
        <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-[#1769AA]">
          {product.subcategory || product.category}
        </Link>
        <span>/</span>
        <span className="text-[#17212B] line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Image */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden shadow-sm">
          <img
            src={product.images?.[0] || "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop&auto=format"}
            alt={product.name}
            className="w-full h-80 sm:h-96 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop&auto=format";
            }}
          />
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-[#EFF6FF] text-[#1769AA] font-semibold px-2 py-0.5 rounded">{product.brand}</span>
            <span className="text-xs text-[#667085] font-mono">SKU: {product.sku}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3A63] mb-3 leading-tight">{product.name}</h1>

          {/* Price */}
          <div className="bg-[#F6F8FA] rounded-xl p-4 mb-4">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold text-[#0B3A63]">₹{product.price.toLocaleString("en-IN")}</span>
              {discount > 0 && (
                <>
                  <span className="text-lg text-[#667085] line-through">₹{product.mrp.toLocaleString("en-IN")}</span>
                  <span className="bg-[#F2A900] text-[#0B3A63] font-bold text-sm px-2 py-0.5 rounded">{discount}% OFF</span>
                </>
              )}
            </div>
            <p className="text-xs text-[#667085]">Price inclusive of all taxes. Free shipping on orders above ₹999.</p>
          </div>

          {/* Stock */}
          <div className="mb-4">
            {!inStock ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C0392B] bg-[#FEF2F2] px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-[#C0392B]"></span> Out of Stock
              </span>
            ) : lowStock ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#B45309] bg-[#FFFBEB] px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-[#F2A900]"></span> Only {product.stock} units left
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#12773D] bg-[#ECFDF5] px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-[#12773D]"></span> In Stock ({product.stock} units)
              </span>
            )}
          </div>

          {/* Qty */}
          <div className="flex items-center gap-3 mb-5">
            <span className="text-sm font-medium text-[#17212B]">Quantity:</span>
            <div className="flex items-center border border-[#D9E1E8] rounded-lg overflow-hidden">
              <button disabled={qty <= 1} onClick={() => setQty(q => q - 1)} className="px-3 py-2 text-[#17212B] hover:bg-[#F6F8FA] disabled:opacity-40">−</button>
              <span className="px-4 py-2 text-sm font-semibold border-x border-[#D9E1E8] min-w-[3rem] text-center">{qty}</span>
              <button disabled={qty >= product.stock} onClick={() => setQty(q => q + 1)} className="px-3 py-2 text-[#17212B] hover:bg-[#F6F8FA] disabled:opacity-40">+</button>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-3 mb-6">
            <button
              disabled={!inStock}
              onClick={handleAddToCart}
              className="flex-1 py-3 font-semibold rounded-lg border-2 border-[#0B3A63] text-[#0B3A63] hover:bg-[#0B3A63] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {added ? "✓ Added to Cart!" : "Add to Cart"}
            </button>
            <button
              disabled={!inStock}
              onClick={handleBuyNow}
              className="flex-1 py-3 font-semibold rounded-lg bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Buy Now
            </button>
          </div>

          {/* Info snippets */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { icon: "🔒", label: "Secure Payment" },
              { icon: "🚚", label: "Fast Delivery" },
              { icon: "✅", label: "Genuine Product" },
              { icon: "↩️", label: "Easy Returns" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-[#667085] bg-[#F6F8FA] rounded-lg px-3 py-2">
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-10 bg-white border border-[#D9E1E8] rounded-xl overflow-hidden shadow-sm">
        <div className="border-b border-[#D9E1E8] flex">
          {["description", "specifications", "delivery"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3.5 text-sm font-medium capitalize transition-colors ${activeTab === tab ? "text-[#1769AA] border-b-2 border-[#1769AA] -mb-px bg-white" : "text-[#667085] hover:text-[#17212B]"}`}
            >
              {tab === "specifications" ? "Specifications" : tab === "delivery" ? "Delivery & Returns" : "Description"}
            </button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === "description" && (
            <div>
              <p className="text-[#17212B] leading-relaxed">{product.description || "High quality electrical component built for durability and performance."}</p>
            </div>
          )}
          {activeTab === "specifications" && (
            <div className="overflow-x-auto">
              {product.specifications && Object.keys(product.specifications).length > 0 ? (
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(product.specifications).map(([key, val], i) => (
                      <tr key={key} className={i % 2 === 0 ? "bg-[#F6F8FA]" : "bg-white"}>
                        <td className="px-4 py-3 font-medium text-[#17212B] w-1/3">{key}</td>
                        <td className="px-4 py-3 text-[#667085] font-mono">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-500 text-sm">No detailed technical specifications listed for this product.</p>
              )}
            </div>
          )}
          {activeTab === "delivery" && (
            <div className="space-y-4 text-sm text-[#667085]">
              <div className="flex gap-3 p-4 bg-[#F6F8FA] rounded-lg">
                <span className="text-xl">🚚</span>
                <div>
                  <h4 className="font-semibold text-[#17212B] mb-1">Delivery</h4>
                  <p>Free shipping on orders above ₹999. Standard delivery 3–5 business days within Tamil Nadu. Express delivery available on request.</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 bg-[#F6F8FA] rounded-lg">
                <span className="text-xl">↩️</span>
                <div>
                  <h4 className="font-semibold text-[#17212B] mb-1">Returns</h4>
                  <p>7-day return policy for defective or incorrect products. Products must be unused, in original packaging with all accessories.</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 bg-[#F6F8FA] rounded-lg">
                <span className="text-xl">🛡️</span>
                <div>
                  <h4 className="font-semibold text-[#17212B] mb-1">Warranty</h4>
                  <p>Brand warranty as specified. Warranty claims handled directly with manufacturer. Invoice provided for warranty claims.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold text-[#0B3A63] mb-5">Related Products</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {related.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}
