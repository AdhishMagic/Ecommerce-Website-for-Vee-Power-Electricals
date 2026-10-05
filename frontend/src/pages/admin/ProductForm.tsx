import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShop } from "../../context/ShopContext";
import { catalogApi } from "../../api/catalog";

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { products, addProduct, updateProduct } = useShop();

  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categoriesList, setCategoriesList] = useState<Array<{ id: number | string; name: string }>>([
    { id: "Fans", name: "Fans" },
    { id: "Wires & Cables", name: "Wires & Cables" },
    { id: "Switches", name: "Switches" },
    { id: "Lighting", name: "Lighting" },
    { id: "MCB & Protection", name: "MCB & Protection" },
    { id: "Accessories", name: "Accessories" },
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
    name: "", brand: "", category: "", sku: "", description: "",
    price: "", stock: "", lowStockThreshold: "10", active: true, image: ""
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
        setCategoriesList(cats.map((c: any) => ({ id: c.id, name: c.name })));
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
          image: existing.image || ""
        });
        if (existing.specs && existing.specs.length > 0) {
          setSpecs(existing.specs);
        }
      }
    }
  }, [id, products]);

  const sections = [
    { id: "basic", label: "Basic Info" },
    { id: "pricing", label: "Pricing" },
    { id: "inventory", label: "Inventory" },
    { id: "images", label: "Images" },
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    const validSpecs = specs.filter(s => s.key.trim() && s.value.trim());

    const submitData = {
      ...formData,
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
                        value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                        className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] bg-white">
                        <option value="">Select Category</option>
                        {categoriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
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

            {activeSectionIndex === 3 && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Product Images</h2>
                
                {formData.image ? (
                  <div className="relative inline-block border border-[#D9E1E8] rounded-xl overflow-hidden">
                    <img src={formData.image} alt="Preview" className="h-48 object-cover" />
                    <button type="button" onClick={() => setFormData({...formData, image: ""})} className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded hover:bg-red-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#D9E1E8] rounded-xl p-10 text-center hover:border-[#1769AA] transition-colors cursor-pointer mb-4">
                    <div className="text-4xl mb-3">📷</div>
                    <p className="font-medium text-[#17212B] mb-1">Click to upload image</p>
                    <p className="text-sm text-[#667085]">PNG, JPG up to 5MB.</p>
                  </div>
                )}
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

                <div>
                  <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Or Enter Direct Image URL</label>
                  <input
                    value={formData.image && formData.image.startsWith('data:') ? '' : formData.image}
                    onChange={e => setFormData({...formData, image: e.target.value})}
                    className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]"
                    placeholder="https://images.unsplash.com/photo-..."
                  />
                  {formData.image && formData.image.startsWith('data:') && (
                    <p className="text-xs text-green-600 mt-1 font-medium">✓ Local image file selected and ready to save</p>
                  )}
                </div>
              </div>
            )}

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
