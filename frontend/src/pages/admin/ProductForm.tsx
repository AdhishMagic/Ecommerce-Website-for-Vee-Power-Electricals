import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShop } from "../../context/ShopContext";
import { catalogApi } from "../../api/catalog";
import {
  resolveProductImage,
  getCategoryDefaultImage,
  normalizeMediaUrl,
  handleProductImageError,
} from "../../utils/productImageResolver";

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { products, addProduct, updateProduct } = useShop();

  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image management state
  const [isCustomImage, setIsCustomImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageSuccessMsg, setImageSuccessMsg] = useState("");
  const [imageErrorMsg, setImageErrorMsg] = useState("");

  const [categoriesList, setCategoriesList] = useState<Array<{ id: number | string; name: string; slug?: string }>>([
    { id: "Fans", name: "Fans", slug: "fans" },
    { id: "Wires & Cables", name: "Wires & Cables", slug: "wires-cables" },
    { id: "Switches", name: "Switches", slug: "switches" },
    { id: "Modular Switches", name: "Modular Switches", slug: "modular-switches" },
    { id: "Lighting", name: "LED & Lighting", slug: "lighting" },
    { id: "MCB & Protection", name: "MCB & Protection", slug: "mcb" },
    { id: "Accessories", name: "Electrical Accessories", slug: "electrical-accessories" },
  ]);

  const [brandsList, setBrandsList] = useState<Array<{ id: number | string; name: string }>>([
    { id: "Havells", name: "Havells" },
    { id: "Finolex", name: "Finolex" },
    { id: "Crompton", name: "Crompton" },
    { id: "Anchor", name: "Anchor" },
    { id: "Jaquar", name: "Jaquar" },
    { id: "Khaitan", name: "Khaitan" },
    { id: "Legrand", name: "Legrand" },
    { id: "Polycab", name: "Polycab" },
    { id: "Philips", name: "Philips" },
    { id: "Gloster", name: "Gloster" },
  ]);

  const [formData, setFormData] = useState({
    name: "",
    brand: "",
    category: "",
    sku: "",
    description: "",
    price: "",
    stock: "",
    lowStockThreshold: "10",
    active: true,
    image: "",
  });

  const [specs, setSpecs] = useState([{ key: "", value: "" }]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      catalogApi.getCategories().catch(() => []),
      catalogApi.getBrands().catch(() => []),
    ]).then(([catData, brandData]) => {
      if (!isMounted) return;
      const cats = Array.isArray(catData) ? catData : (catData as any)?.results || [];
      const brs = Array.isArray(brandData) ? brandData : (brandData as any)?.results || [];
      if (cats.length > 0) {
        setCategoriesList(cats.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })));
      }
      if (brs.length > 0) {
        setBrandsList(brs.map((b: any) => ({ id: b.id, name: b.name })));
      }
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (id) {
      const existing = products.find(p => p.id === id);
      if (existing) {
        const rawImg = existing.image || existing.primary_image || (existing.images && existing.images[0]) || "";
        const hasCustom = Boolean(
          rawImg &&
          !rawImg.includes('/media/defaults/') &&
          !rawImg.includes('/images/defaults/') &&
          (rawImg.includes('/media/products/') || rawImg.startsWith('data:') || rawImg.startsWith('http'))
        );

        setFormData({
          name: existing.name,
          brand: existing.brand,
          category: existing.category,
          sku: existing.sku,
          description: existing.description || "",
          price: existing.price.toString(),
          stock: existing.stock.toString(),
          lowStockThreshold: existing.lowStockThreshold?.toString() || "10",
          active: existing.active,
          image: rawImg,
        });

        setIsCustomImage(hasCustom);

        if (existing.specs && existing.specs.length > 0) {
          setSpecs(existing.specs);
        }
      }
    }
  }, [id, products]);

  // When category changes in form, if no custom image is selected, update image to category default
  const handleCategoryChange = (newCat: string) => {
    setFormData(prev => {
      const updated = { ...prev, category: newCat };
      if (!isCustomImage || !prev.image) {
        const catObj = categoriesList.find(c => String(c.id) === String(newCat) || c.slug === newCat || c.name === newCat);
        updated.image = getCategoryDefaultImage(catObj || newCat);
      }
      return updated;
    });
  };

  const sections = [
    { id: "basic", label: "Basic Info" },
    { id: "pricing", label: "Pricing" },
    { id: "inventory", label: "Inventory" },
    { id: "images", label: "Product Image" },
    { id: "specs", label: "Specifications" },
  ];

  const validateCurrentSection = () => {
    setErrorMsg("");
    if (activeSectionIndex === 0) {
      if (!formData.name.trim()) {
        setErrorMsg("Please enter a Product Name.");
        return false;
      }
      if (!formData.brand) {
        setErrorMsg("Please select a Brand.");
        return false;
      }
      if (!formData.category) {
        setErrorMsg("Please select a Category.");
        return false;
      }
      if (!formData.sku.trim()) {
        setErrorMsg("Please enter a SKU.");
        return false;
      }
    } else if (activeSectionIndex === 1) {
      if (!formData.price || parseFloat(formData.price) <= 0 || isNaN(parseFloat(formData.price))) {
        setErrorMsg("Please enter a valid price greater than 0.");
        return false;
      }
    } else if (activeSectionIndex === 2) {
      if (formData.stock === "" || parseInt(formData.stock) < 0 || isNaN(parseInt(formData.stock))) {
        setErrorMsg("Stock cannot be negative.");
        return false;
      }
    }
    return true;
  };

  const validateAll = () => {
    setErrorMsg("");
    if (!formData.name.trim()) {
      setErrorMsg("Product Name is required (Basic Info tab).");
      setActiveSectionIndex(0);
      return false;
    }
    if (!formData.brand) {
      setErrorMsg("Brand is required (Basic Info tab).");
      setActiveSectionIndex(0);
      return false;
    }
    if (!formData.category) {
      setErrorMsg("Category is required (Basic Info tab).");
      setActiveSectionIndex(0);
      return false;
    }
    if (!formData.sku.trim()) {
      setErrorMsg("SKU is required (Basic Info tab).");
      setActiveSectionIndex(0);
      return false;
    }
    if (!formData.price || parseFloat(formData.price) <= 0 || isNaN(parseFloat(formData.price))) {
      setErrorMsg("Please enter a valid price greater than 0 (Pricing tab).");
      setActiveSectionIndex(1);
      return false;
    }
    if (formData.stock === "" || parseInt(formData.stock) < 0 || isNaN(parseInt(formData.stock))) {
      setErrorMsg("Stock cannot be negative (Inventory tab).");
      setActiveSectionIndex(2);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateCurrentSection()) {
      setActiveSectionIndex(prev => Math.min(prev + 1, sections.length - 1));
    }
  };

  const handlePrev = () => {
    setErrorMsg("");
    setActiveSectionIndex(prev => Math.max(prev - 1, 0));
  };

  // Image Upload handler with client-side & authoritative server-side validation
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageErrorMsg("");
    setImageSuccessMsg("");

    // 1. Client-side MIME type and extension validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp');

    if (!allowedTypes.includes(file.type) && !hasValidExt) {
      setImageErrorMsg("Invalid file format. Please upload a JPEG, PNG, or WebP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 2. Client-side Size limit validation (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setImageErrorMsg(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 5MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 3. Server-side upload with Pillow validation
    setIsUploadingImage(true);
    try {
      const res = await catalogApi.uploadProductImage(file);
      setFormData(prev => ({ ...prev, image: res.image_url || res.url }));
      setIsCustomImage(true);
      setImageSuccessMsg(`✓ Custom image uploaded and verified successfully (${file.name})`);
    } catch (err: any) {
      console.error("Image upload failed:", err);
      setImageErrorMsg(err?.message || "Failed to upload image. Please verify the file is a valid image.");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Switch to Category Default Action
  const handleUseCategoryDefault = () => {
    setImageErrorMsg("");
    const catObj = categoriesList.find(c => String(c.id) === String(formData.category) || c.slug === formData.category || c.name === formData.category);
    const defaultImg = getCategoryDefaultImage(catObj || formData.category);
    setFormData(prev => ({ ...prev, image: defaultImg }));
    setIsCustomImage(false);
    setImageSuccessMsg("✓ Using category-appropriate default image.");
  };

  // Remove / Reset Image Action
  const handleRemoveImage = () => {
    setImageErrorMsg("");
    const catObj = categoriesList.find(c => String(c.id) === String(formData.category) || c.slug === formData.category || c.name === formData.category);
    const defaultImg = getCategoryDefaultImage(catObj || formData.category);
    setFormData(prev => ({ ...prev, image: defaultImg }));
    setIsCustomImage(false);
    setImageSuccessMsg("Image removed. Switched to category default.");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    const validSpecs = specs.filter(s => s.key.trim() && s.value.trim());

    // Resolve final image to persist
    const finalImage = formData.image || getCategoryDefaultImage(formData.category);

    const submitData = {
      ...formData,
      image: finalImage,
      price: parseFloat(formData.price),
      stock: parseInt(formData.stock),
      lowStockThreshold: parseInt(formData.lowStockThreshold) || 10,
      specs: validSpecs,
    };

    setIsSaving(true);
    setErrorMsg("");
    try {
      if (id) {
        await updateProduct(id, submitData);
      } else {
        await addProduct(submitData);
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); navigate("/admin/products"); }, 1500);
    } catch (err: any) {
      console.error("Failed to save product:", err);
      setErrorMsg(err?.message || "Failed to save product to backend API.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCategoryObj = categoriesList.find(
    c => String(c.id) === String(formData.category) || c.name === formData.category || c.slug === formData.category
  );
  const displayCategoryName = selectedCategoryObj ? selectedCategoryObj.name : formData.category;

  // Compute preview URL
  const previewImageUrl = resolveProductImage({
    image: formData.image,
    category: selectedCategoryObj || formData.category,
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/admin/products")} className="text-[#667085] hover:text-[#17212B]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <h1 className="text-xl font-bold text-[#0B3A63]">{id ? "Edit Product" : "Add New Product"}</h1>
      </div>

      <form onSubmit={handleSave}>
        <div className="grid lg:grid-cols-4 gap-5">
          {/* Section nav */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-3 sticky top-4 space-y-1">
              {sections.map((s, idx) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => {
                    setErrorMsg("");
                    setActiveSectionIndex(idx);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors cursor-pointer ${
                    activeSectionIndex === idx
                      ? "bg-[#EFF6FF] text-[#1769AA] font-semibold"
                      : "text-[#667085] hover:bg-slate-50"
                  }`}
                >
                  {idx + 1}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form content */}
          <div className="lg:col-span-3 space-y-5">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
                {errorMsg}
              </div>
            )}

            {/* Section 0: Basic Information */}
            {activeSectionIndex === 0 && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Basic Information</h2>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Product Name *</label>
                    <input 
                      value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="e.g. Havells Stealth Ceiling Fan" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Brand *</label>
                      <select 
                        value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})}
                        className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] bg-white">
                        <option value="">Select Brand</option>
                        {brandsList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Category *</label>
                      <select 
                        value={formData.category} onChange={e => handleCategoryChange(e.target.value)}
                        className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] bg-white">
                        <option value="">Select Category</option>
                        {categoriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {formData.category && (
                        <div className="mt-2.5 flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="w-10 h-10 rounded-md bg-white border border-slate-200 p-0.5 overflow-hidden shrink-0 flex items-center justify-center">
                            <img
                              src={getCategoryDefaultImage(selectedCategoryObj || formData.category)}
                              alt="Category Default"
                              className="w-full h-full object-contain"
                              onError={(e) => handleProductImageError(e, selectedCategoryObj || formData.category)}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-[#0B3A63] truncate">
                              Default Image: {displayCategoryName}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              Assigned automatically • Change in Product Image tab
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">SKU *</label>
                    <input 
                      value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})}
                      className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] font-mono" placeholder="e.g. HVL-CF-STL-1200" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Description</label>
                    <textarea 
                      value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                      rows={4} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] resize-none" placeholder="Detailed product description..." />
                  </div>
                </div>
              </div>
            )}

            {/* Section 1: Pricing */}
            {activeSectionIndex === 1 && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Pricing</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Selling Price (₹) *</label>
                    <input 
                      type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})}
                      className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="0" />
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: Inventory */}
            {activeSectionIndex === 2 && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Inventory</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Current Stock *</label>
                    <input 
                      type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})}
                      className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="0" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Low Stock Threshold</label>
                    <input 
                      type="number" value={formData.lowStockThreshold} onChange={e => setFormData({...formData, lowStockThreshold: e.target.value})}
                      className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="10" />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm font-medium text-[#17212B] cursor-pointer">
                      <input 
                        type="checkbox" checked={formData.active} onChange={e => setFormData({...formData, active: e.target.checked})}
                        className="w-4 h-4 text-[#1769AA] border-[#D9E1E8] rounded" />
                      Active / Visible in Store
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Product Image Management */}
            {activeSectionIndex === 3 && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                  <div>
                    <h2 className="font-bold text-[#0B3A63] text-lg">Product Image Management</h2>
                    <p className="text-xs text-[#667085] mt-0.5">
                      Choose to upload a custom product image or automatically use the recommended category default.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs font-semibold text-slate-600">Category:</label>
                    <select
                      value={formData.category}
                      onChange={e => handleCategoryChange(e.target.value)}
                      className="border border-[#D9E1E8] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#0B3A63] outline-none focus:border-[#1769AA] bg-white cursor-pointer shadow-xs"
                    >
                      <option value="">Select Category</option>
                      {categoriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Upload Feedback Messages */}
                {imageErrorMsg && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2">
                    <span>⚠</span>
                    <span>{imageErrorMsg}</span>
                  </div>
                )}
                {imageSuccessMsg && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2">
                    <span>✓</span>
                    <span>{imageSuccessMsg}</span>
                  </div>
                )}

                {/* Image Preview & Controls Grid */}
                <div className="grid md:grid-cols-2 gap-6 items-start">
                  {/* Left: Active Image Preview Card */}
                  <div className="border border-[#D9E1E8] rounded-2xl p-4 bg-[#F8FAFC] flex flex-col items-center">
                    <div className="relative w-full max-w-[240px] aspect-square rounded-xl overflow-hidden bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-center p-2 mb-3">
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                          <div className="w-8 h-8 border-3 border-[#1769AA] border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs font-medium">Validating &amp; Uploading...</span>
                        </div>
                      ) : previewImageUrl ? (
                        <img
                          key={previewImageUrl}
                          src={previewImageUrl}
                          alt={formData.name || "Product Preview"}
                          className="w-full h-full object-contain"
                          loading="eager"
                          decoding="async"
                          onError={(e) => handleProductImageError(e, selectedCategoryObj || formData.category)}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                          <span className="text-3xl mb-1.5">⚡</span>
                          <span className="text-xs font-medium text-slate-500">Select a category to view default image</span>
                        </div>
                      )}

                      {/* Image Source Badge */}
                      {!isUploadingImage && previewImageUrl && (
                        <div className="absolute top-2 left-2">
                          {isCustomImage ? (
                            <span className="bg-[#1769AA] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                              <span>★</span> Custom Image
                            </span>
                          ) : (
                            <span className="bg-[#12773D] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                              <span>✓</span> Category Default
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-center w-full">
                      <p className="text-xs font-semibold text-[#17212B] truncate mb-0.5">
                        {formData.name || "Product Image Preview"}
                      </p>
                      <p className="text-[11px] text-[#667085] truncate">
                        {isCustomImage ? "Stored in secure media storage" : `Automatic default for ${displayCategoryName || "category"}`}
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions & Upload Controls */}
                  <div className="space-y-4">
                    <div className="bg-white border border-[#D9E1E8] rounded-xl p-4 space-y-3">
                      <h3 className="text-sm font-bold text-[#0B3A63]">Select Image Source</h3>
                      
                      {/* Action 1: Upload Custom Image */}
                      <div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          ref={fileInputRef}
                          onChange={handleImageFileChange}
                          className="hidden"
                          id="product-image-file-input"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingImage}
                          className="w-full flex items-center justify-center gap-2 bg-[#0B3A63] hover:bg-[#1769AA] text-white text-sm font-semibold py-2.5 px-4 rounded-lg shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span>{isCustomImage ? "Replace With New Upload" : "Upload Custom Image"}</span>
                        </button>
                        <p className="text-[11px] text-[#667085] mt-1.5 text-center">
                          JPEG, PNG, or WebP • Max 5MB • Validated on server
                        </p>
                      </div>

                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-slate-200"></div>
                        <span className="flex-shrink mx-2 text-[10px] text-slate-400 uppercase font-semibold">Or</span>
                        <div className="flex-grow border-t border-slate-200"></div>
                      </div>

                      {/* Action 2: Use Category Default */}
                      <button
                        type="button"
                        onClick={handleUseCategoryDefault}
                        className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 px-4 rounded-lg border transition-all cursor-pointer ${
                          !isCustomImage
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400"
                        }`}
                      >
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Use Category Default Image</span>
                      </button>

                      {/* Action 3: Remove custom image */}
                      {isCustomImage && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="w-full text-xs text-[#C0392B] hover:text-red-700 font-medium py-1.5 text-center transition-colors cursor-pointer"
                        >
                          Reset to category default
                        </button>
                      )}
                    </div>

                    {/* Direct URL entry optional fallback */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="text-xs font-medium text-slate-700 mb-1 block">
                        Direct Image URL (Optional)
                      </label>
                      <input
                        value={formData.image && formData.image.startsWith('data:') ? '' : formData.image}
                        onChange={e => {
                          const val = e.target.value.trim();
                          setFormData({ ...formData, image: val });
                          setIsCustomImage(Boolean(val && !val.includes('/defaults/')));
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#1769AA] bg-white font-mono"
                        placeholder="e.g. /media/products/... or https://..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section 4: Specifications */}
            {activeSectionIndex === 4 && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Technical Specifications</h2>
                <div className="space-y-3">
                  {specs.map((spec, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        value={spec.key}
                        onChange={e => setSpecs(s => s.map((sp, j) => j === i ? {...sp, key: e.target.value} : sp))}
                        className="flex-1 border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1769AA]"
                        placeholder="e.g. Sweep Size"
                      />
                      <input
                        value={spec.value}
                        onChange={e => setSpecs(s => s.map((sp, j) => j === i ? {...sp, value: e.target.value} : sp))}
                        className="flex-1 border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1769AA]"
                        placeholder="e.g. 1200 mm"
                      />
                      <button type="button" onClick={() => setSpecs(s => s.filter((_, j) => j !== i))} className="text-[#C0392B] hover:text-red-700 p-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setSpecs(s => [...s, { key: "", value: "" }])} className="text-sm text-[#1769AA] hover:text-[#0B3A63] flex items-center gap-1">
                    + Add Specification
                  </button>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-4">
              {activeSectionIndex > 0 && (
                <button type="button" onClick={handlePrev} className="px-5 py-3 border border-[#D9E1E8] rounded-lg font-medium text-[#667085] hover:text-[#17212B] hover:bg-slate-50 transition-colors">
                  Previous
                </button>
              )}
              
              {activeSectionIndex < sections.length - 1 ? (
                <button type="button" onClick={handleNext} className="flex-1 bg-[#0B3A63] hover:bg-[#1769AA] text-white py-3 font-semibold rounded-lg transition-colors">
                  Next Step
                </button>
              ) : (
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className={`flex-1 py-3 font-semibold rounded-lg transition-colors ${
                    isSaving 
                      ? "opacity-60 cursor-not-allowed bg-[#F2A900] text-[#0A2540]" 
                      : saved 
                        ? "bg-[#12773D] text-white" 
                        : "bg-[#F2A900] hover:bg-[#e09b00] text-[#0A2540]"
                  }`}
                >
                  {isSaving ? "Saving..." : saved ? "✓ Saved!" : (id ? "Update Product" : "Save Product")}
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
