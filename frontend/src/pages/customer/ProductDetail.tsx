import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { productService } from "../../services/productService";
import { Product } from "../../types/product";
import { useCart } from "../../context/CartContext";
import ProductCard from "../../components/common/ProductCard";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import SEOHead from "../../components/common/SEOHead";
import { resolveProductImage, handleProductImageError } from "../../utils/productImageResolver";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart, items, updateQty, removeFromCart } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<Product[]>([]);
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState("description");
  const [added, setAdded] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const cartItem = product ? items.find((i) => String(i.product.id) === String(product.id)) : undefined;
  const quantityInCart = cartItem ? cartItem.quantity : 0;

  useEffect(() => {
    let isMounted = true;
    const fetchProduct = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const prod = await productService.getProductById(id);
        if (!isMounted) return;
        setProduct(prod ?? null);

        // Fetch and prioritize related products:
        // 1. Same category
        // 2. Same brand
        // 3. Similar attributes / product type
        // 4. Other relevant products as fallback
        // Rules: Exclude current product, exclude inactive, prioritize in-stock, deduplicate, up to 8 products.
        if (prod) {
          try {
            const allProducts = await productService.getProducts();
            if (isMounted) {
              const currentId = String(prod.id);
              const candidates = allProducts.filter(
                (p) => String(p.id) !== currentId && p.active !== false
              );

              // 1. Same category
              const sameCategory = candidates.filter((p) => {
                const matchId = prod.categoryId !== undefined && p.categoryId !== undefined && String(p.categoryId) === String(prod.categoryId);
                const matchSlug = prod.categorySlug && p.categorySlug && prod.categorySlug.toLowerCase() === p.categorySlug.toLowerCase();
                const matchName = prod.category && p.category && prod.category.toLowerCase().trim() === p.category.toLowerCase().trim();
                return matchId || matchSlug || matchName;
              });

              // 2. Same brand
              const sameBrand = candidates.filter((p) => {
                const matchId = prod.brandId !== undefined && p.brandId !== undefined && String(p.brandId) === String(prod.brandId);
                const matchSlug = prod.brandSlug && p.brandSlug && prod.brandSlug.toLowerCase() === p.brandSlug.toLowerCase();
                const matchName = prod.brand && p.brand && prod.brand.toLowerCase().trim() === p.brand.toLowerCase().trim();
                return matchId || matchSlug || matchName;
              });

              // 3. Similar attributes or product type
              const prodWords = (prod.name || "").toLowerCase().split(/\s+/).filter(w => w.length > 2);
              const similarAttributes = candidates.filter((p) => {
                const matchSubcat = prod.subcategory && p.subcategory && prod.subcategory.toLowerCase() === p.subcategory.toLowerCase();
                const nameWords = (p.name || "").toLowerCase().split(/\s+/);
                const sharedWords = prodWords.filter(w => nameWords.includes(w));
                return matchSubcat || sharedWords.length >= 2;
              });

              // Build prioritized list without duplicates
              const seen = new Set<string>();
              const prioritized: Product[] = [];

              const addGroup = (items: Product[]) => {
                // In each group, prioritize in-stock products
                const sorted = [...items].sort((a, b) => {
                  const aInStock = (a.stock && a.stock > 0) ? 1 : 0;
                  const bInStock = (b.stock && b.stock > 0) ? 1 : 0;
                  return bInStock - aInStock;
                });
                for (const item of sorted) {
                  const key = String(item.id);
                  if (!seen.has(key)) {
                    seen.add(key);
                    prioritized.push(item);
                  }
                }
              };

              addGroup(sameCategory);
              addGroup(sameBrand);
              addGroup(similarAttributes);

              // 4. Other relevant products as fallback if fewer than 4 found
              if (prioritized.length < 4) {
                addGroup(candidates);
              }

              // Show up to 8 relevant products
              setRelated(prioritized.slice(0, 8));
            }
          } catch (relatedErr) {
            console.error("Failed to fetch related products:", relatedErr);
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
        <SEOHead
          title="Product Not Found"
          description="The electrical product you are looking for does not exist or has been removed."
          robots="noindex, follow"
        />
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

  const productCanonical = product.canonicalUrl || product.canonical_url || `https://veepowerelectricals.com/product/${product.slug || product.id}`;
  const productTitle = product.metaTitle || product.meta_title || `${product.name} | ${product.brand} | Vee Power Electricals`;
  const productDescription = product.metaDescription || product.meta_description || `Buy genuine ${product.brand} ${product.name} at ₹${product.price} INR from Vee Power Electricals. High quality ${product.category} with fast shipping across India.`;
  const primaryImgUrl = resolveProductImage({
    image: product.images?.[selectedImageIndex] || product.image,
    category: product.category,
  });

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.name,
      "image": [primaryImgUrl],
      "description": product.description || productDescription,
      "sku": product.sku,
      "brand": {
        "@type": "Brand",
        "name": product.brand,
      },
      "category": product.category,
      "offers": {
        "@type": "Offer",
        "url": productCanonical,
        "priceCurrency": "INR",
        "price": String(product.price),
        "priceValidUntil": "2027-12-31",
        "itemCondition": "https://schema.org/NewCondition",
        "availability": inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "seller": {
          "@type": "Organization",
          "name": "Vee Power Electricals",
          "url": "https://veepowerelectricals.com",
        }
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://veepowerelectricals.com" },
        { "@type": "ListItem", "position": 2, "name": "Shop", "item": "https://veepowerelectricals.com/shop" },
        { "@type": "ListItem", "position": 3, "name": product.category, "item": `https://veepowerelectricals.com/shop?category=${encodeURIComponent(product.categorySlug || product.category)}` },
        { "@type": "ListItem", "position": 4, "name": product.name, "item": productCanonical },
      ]
    }
  ];

  const handleAddToCart = () => {
    if (!product) return;
    addToCart(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (quantityInCart === 0) {
      addToCart(product, qty);
    }
    navigate("/checkout");
  };

  return (
    <div className="site-container py-6">
      <SEOHead
        title={productTitle}
        description={productDescription}
        canonicalUrl={productCanonical}
        ogImage={primaryImgUrl}
        ogType="product"
        robots={product.isIndexable !== false && product.is_indexable !== false ? "index, follow" : "noindex, follow"}
        jsonLd={jsonLd}
        productData={{
          price: product.price,
          currency: "INR",
          availability: inStock ? "InStock" : "OutOfStock",
          brand: product.brand,
          sku: product.sku,
        }}
      />

      {/* Semantic Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Shop", href: "/shop" },
          { label: product.subcategory || product.category, href: `/shop?category=${encodeURIComponent(product.categorySlug || product.category)}` },
          { label: product.name },
        ]}
        className="mb-6"
      />

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Image */}
        <div className="flex flex-col gap-3">
          <div className="border border-[#D9E1E8] rounded-2xl overflow-hidden shadow-xs p-6 flex items-center justify-center min-h-[340px] sm:min-h-[420px] bg-[#F8FAFC]">
            <img
              src={resolveProductImage({
                image: product.images?.[selectedImageIndex] || product.image,
                category: product.category,
              })}
              alt={`${product.brand ? `${product.brand} ` : ''}${product.name} - Vee Power Electricals`}
              loading="eager"
              fetchPriority="high"
              width={400}
              height={384}
              className="max-h-80 sm:max-h-96 w-full object-contain"
              onError={(e) => handleProductImageError(e, product.category)}
            />
          </div>
          {/* Gallery Thumbnails if more than 1 image */}
          {product.images && product.images.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`w-16 h-16 rounded-xl border-2 p-1 bg-white shrink-0 cursor-pointer transition-all ${
                    selectedImageIndex === idx ? "border-[#1769AA] shadow-xs" : "border-[#D9E1E8] hover:border-slate-400"
                  }`}
                >
                  <img
                    src={resolveProductImage({ image: img, category: product.category })}
                    alt={`${product.name} view ${idx + 1}`}
                    className="w-full h-full object-contain"
                    onError={(e) => handleProductImageError(e, product.category)}
                  />
                </button>
              ))}
            </div>
          )}
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
            <div className="flex items-center border border-[#D9E1E8] rounded-lg overflow-hidden bg-[#F8FAFC]">
              {quantityInCart > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (quantityInCart <= 1) {
                        removeFromCart(product.id);
                      } else {
                        updateQty(product.id, quantityInCart - 1);
                      }
                    }}
                    className="px-3.5 py-2 text-[#0B3A63] font-bold hover:bg-[#E2E8F0] active:scale-95 transition-colors cursor-pointer select-none"
                    title="Decrease cart quantity"
                    aria-label="Decrease cart quantity"
                  >
                    −
                  </button>
                  <span className="px-4 py-2 text-sm font-bold text-[#0B3A63] border-x border-[#D9E1E8] min-w-[3rem] text-center select-none">
                    {quantityInCart}
                  </span>
                  <button
                    type="button"
                    disabled={product.stock !== undefined && quantityInCart >= product.stock}
                    onClick={() => updateQty(product.id, quantityInCart + 1)}
                    className="px-3.5 py-2 text-[#0B3A63] font-bold hover:bg-[#E2E8F0] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                    title="Increase cart quantity"
                    aria-label="Increase cart quantity"
                  >
                    +
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={qty <= 1}
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="px-3.5 py-2 text-[#17212B] font-bold hover:bg-[#E2E8F0] disabled:opacity-40 transition-colors cursor-pointer select-none"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="px-4 py-2 text-sm font-semibold border-x border-[#D9E1E8] min-w-[3rem] text-center select-none">
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={product.stock !== undefined && qty >= product.stock}
                    onClick={() => setQty(q => q + 1)}
                    className="px-3.5 py-2 text-[#17212B] font-bold hover:bg-[#E2E8F0] disabled:opacity-40 transition-colors cursor-pointer select-none"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </>
              )}
            </div>
            {quantityInCart > 0 && (
              <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
                ✓ In Cart
              </span>
            )}
          </div>

          {/* CTAs */}
          <div className="flex gap-3 mb-6">
            {quantityInCart > 0 ? (
              <>
                <Link
                  to="/cart"
                  className="flex-1 py-3 font-bold rounded-lg bg-[#F2A900] hover:bg-[#DDA006] text-[#0B3A63] transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span>Go to Cart ({quantityInCart})</span>
                </Link>
                <button
                  type="button"
                  disabled={!inStock}
                  onClick={handleBuyNow}
                  className="flex-1 py-3 font-semibold rounded-lg border-2 border-[#0B3A63] text-[#0B3A63] hover:bg-[#0B3A63] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Proceed to Checkout
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!inStock}
                  onClick={handleAddToCart}
                  className="flex-1 py-3 font-semibold rounded-lg border-2 border-[#0B3A63] text-[#0B3A63] hover:bg-[#0B3A63] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span>{added ? "✓ Added to Cart!" : "Add to Cart"}</span>
                </button>
                <button
                  type="button"
                  disabled={!inStock}
                  onClick={handleBuyNow}
                  className="flex-1 py-3 font-semibold rounded-lg bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Buy Now
                </button>
              </>
            )}
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
                  <p>Free shipping on orders above ₹999. Standard delivery 3–5 business days all around India. Express delivery available on request.</p>
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

      {/* Related Products Section */}
      {related.length > 0 && (
        <section className="mt-12 sm:mt-16 pt-8 border-t border-[#D9E1E8]" aria-labelledby="related-products-heading">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
            <div>
              <h2
                id="related-products-heading"
                className="text-xl sm:text-2xl font-bold text-[#0B3A63] tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Related Products
              </h2>
              <p className="text-xs sm:text-sm text-[#667085] mt-0.5">
                Similar genuine electrical products you might be interested in
              </p>
            </div>
            {product.category && (
              <Link
                to={`/shop?category=${encodeURIComponent(product.categorySlug || product.category)}`}
                className="inline-flex items-center text-xs sm:text-sm font-semibold text-[#1769AA] hover:text-[#0B3A63] hover:underline transition-colors shrink-0"
              >
                View all {product.category} &rarr;
              </Link>
            )}
          </div>
          <div data-testid="related-products-grid" className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {related.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
