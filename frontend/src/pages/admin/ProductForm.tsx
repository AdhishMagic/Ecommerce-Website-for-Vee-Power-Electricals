import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShop } from "../../context/ShopContext";
import { catalogApi } from "../../api/catalog";
import {
  resolveProductImage,
  getCategoryDefaultImage,
  handleProductImageError,
} from "../../utils/productImageResolver";

interface SpecificationItem {
  key: string;
  value: string;
}

const GST_SLABS = [
  { value: "18", label: "18% - Standard Electrical Goods (Switches, Wires, Breakers, Cables)" },
  { value: "12", label: "12% - LED Lighting, Luminaires & Battens" },
  { value: "28", label: "28% - High-Capacity Equipment & Specialty Commercial Appliances" },
  { value: "5", label: "5% - Solar Devices & Concessional Renewable Supplies" },
  { value: "0", label: "0% - Exempt Goods / Unbranded Items" },
];

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { products, addProduct, updateProduct } = useShop();

  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInitializedExistingRef = useRef(false);

  // Field-level error validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Image management state
  const [isCustomImage, setIsCustomImage] = useState(false);
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageSuccessMsg, setImageSuccessMsg] = useState("");
  const [imageErrorMsg, setImageErrorMsg] = useState("");
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryImages, setLibraryImages] = useState<Array<{ key: string; name: string; image_url: string }>>([
    { key: "fans", name: "Fans", image_url: "/media/defaults/fans.webp" },
    { key: "wires-cables", name: "Wires & Cables", image_url: "/media/defaults/wires-cables.webp" },
    { key: "switches", name: "Switches", image_url: "/media/defaults/switches.webp" },
    { key: "modular-switches", name: "Modular Switches", image_url: "/media/defaults/modular-switches.webp" },
    { key: "led-lighting", name: "LED Lighting", image_url: "/media/defaults/led-lighting.webp" },
    { key: "led-luminaires", name: "LED Luminaires", image_url: "/media/defaults/led-luminaires.webp" },
    { key: "lighting", name: "Lighting", image_url: "/media/defaults/lighting.webp" },
    { key: "mcb-distribution", name: "MCB & Distribution", image_url: "/media/defaults/mcb-distribution.webp" },
    { key: "mcb-protection", name: "MCB & Protection", image_url: "/media/defaults/mcb-protection.webp" },
    { key: "electrical-accessories", name: "Electrical Accessories", image_url: "/media/defaults/electrical-accessories.webp" },
    { key: "generic-electrical", name: "Generic Electrical", image_url: "/media/defaults/generic-electrical.webp" },
  ]);

  const [categoriesList, setCategoriesList] = useState<Array<{ id: number | string; name: string; slug?: string }>>([
    { id: "Fans", name: "Fans", slug: "fans" },
    { id: "Wires & Cables", name: "Wires & Cables", slug: "wires-cables" },
    { id: "Switches", name: "Switches", slug: "switches" },
    { id: "Modular Switches", name: "Modular Switches", slug: "modular-switches" },
    { id: "Lighting", name: "LED & Lighting", slug: "lighting" },
    { id: "MCB & Protection", name: "MCB & Protection", slug: "mcb-protection" },
    { id: "Electrical Accessories", name: "Electrical Accessories", slug: "electrical-accessories" },
  ]);

  const [brandsList, setBrandsList] = useState<Array<{ id: number | string; name: string }>>([
    { id: "Schneider", name: "Schneider" },
    { id: "Havells", name: "Havells" },
    { id: "Polycab", name: "Polycab" },
    { id: "Finolex", name: "Finolex" },
    { id: "Crompton", name: "Crompton" },
    { id: "Anchor", name: "Anchor" },
    { id: "Legrand", name: "Legrand" },
    { id: "Philips", name: "Philips" },
    { id: "Vee Power", name: "Vee Power" },
  ]);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    brand: "",
    category: "",
    sku: "",
    description: "",
    price: "",
    mrp: "",
    gst_percent: "18",
    stock: "",
    lowStockThreshold: "10",
    active: true,
    image: "",
    meta_title: "",
    meta_description: "",
    canonical_url: "",
    is_indexable: true,
  });

  const [specs, setSpecs] = useState<SpecificationItem[]>([{ key: "", value: "" }]);

  // Fetch categories, brands, and default image catalog
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      catalogApi.getCategories().catch(() => []),
      catalogApi.getBrands().catch(() => []),
      catalogApi.getDefaultImages().catch(() => []),
    ]).then(([catData, brandData, imgData]) => {
      if (!isMounted) return;
      const cats = Array.isArray(catData) ? catData : (catData as any)?.results || [];
      const brs = Array.isArray(brandData) ? brandData : (brandData as any)?.results || [];
      if (cats.length > 0) {
        setCategoriesList(cats.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })));
      }
      if (brs.length > 0) {
        setBrandsList(brs.map((b: any) => ({ id: b.id, name: b.name })));
      }
      if (Array.isArray(imgData) && imgData.length > 0) {
        setLibraryImages(imgData);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Initialize existing product on Edit mode (fetch directly from API for complete data)
  useEffect(() => {
    let isMounted = true;
    if (id && !hasInitializedExistingRef.current) {
      catalogApi.getProductDetail(id).then((detail) => {
        if (!isMounted || !detail) return;
        hasInitializedExistingRef.current = true;

        const rawImg = detail.primary_image || (detail.images && detail.images[0]?.image) || "";
        const hasCustom = Boolean(
          rawImg &&
          !rawImg.includes('/media/defaults/') &&
          !rawImg.includes('/images/defaults/') &&
          (rawImg.includes('/media/products/') || rawImg.startsWith('data:') || rawImg.startsWith('http'))
        );

        // Map specs
        const mappedSpecs: SpecificationItem[] = [];
        if (detail.specifications && Array.isArray(detail.specifications)) {
          detail.specifications.forEach((s: any) => {
            const k = s.key || s.spec_key;
            const v = s.value || s.spec_value;
            if (k && v) mappedSpecs.push({ key: String(k), value: String(v) });
          });
        }

        // Detect GST Rate from specifications if present
        let existingGst = "18";
        const gstSpec = mappedSpecs.find(s => s.key && s.key.toLowerCase().includes("gst"));
        if (gstSpec && gstSpec.value) {
          const digits = gstSpec.value.replace(/[^0-9]/g, "");
          if (["0", "5", "12", "18", "28"].includes(digits)) {
            existingGst = digits;
          }
        }

        // Resolve category id or value
        let catIdVal = "";
        if (typeof detail.category === 'object' && detail.category !== null) {
          catIdVal = String((detail.category as any).id);
        } else if (detail.category !== undefined) {
          catIdVal = String(detail.category);
        }

        // Resolve brand id or value
        let brandIdVal = "";
        if (typeof detail.brand === 'object' && detail.brand !== null) {
          brandIdVal = String((detail.brand as any).id);
        } else if (detail.brand !== undefined) {
          brandIdVal = String(detail.brand);
        }

        const isProdActive = (detail as any).is_active !== undefined
          ? Boolean((detail as any).is_active)
          : (detail.active !== undefined ? Boolean(detail.active) : true);

        setFormData({
          name: detail.name || "",
          slug: detail.slug || "",
          brand: brandIdVal,
          category: catIdVal,
          sku: detail.sku || "",
          description: detail.description || "",
          price: detail.price !== undefined ? String(detail.price) : "",
          mrp: (detail as any).mrp !== undefined ? String((detail as any).mrp) : (detail.price ? String(detail.price) : ""),
          gst_percent: existingGst,
          stock: detail.stock !== undefined ? String(detail.stock) : "",
          lowStockThreshold: (detail as any).low_stock_threshold?.toString() || "10",
          active: isProdActive,
          image: rawImg,
          meta_title: (detail as any).meta_title || "",
          meta_description: (detail as any).meta_description || "",
          canonical_url: (detail as any).canonical_url || "",
          is_indexable: (detail as any).is_indexable !== undefined ? Boolean((detail as any).is_indexable) : true,
        });

        setIsCustomImage(hasCustom);

        if (mappedSpecs.length > 0) {
          setSpecs(mappedSpecs);
        }
      }).catch((err) => {
        console.warn("Could not fetch product detail via API, trying local state fallback:", err);
        const existing = products.find(p => String(p.id) === String(id));
        if (existing && isMounted) {
          hasInitializedExistingRef.current = true;
          const rawImg = existing.image || existing.primary_image || (existing.images && existing.images[0]) || "";
          setFormData(prev => ({
            ...prev,
            name: existing.name,
            slug: existing.slug || "",
            brand: String(existing.brandId || existing.brand || ""),
            category: String(existing.categoryId || existing.category || ""),
            sku: existing.sku || "",
            description: existing.description || "",
            price: existing.price !== undefined ? existing.price.toString() : "",
            mrp: existing.mrp !== undefined ? existing.mrp.toString() : (existing.price ? existing.price.toString() : ""),
            stock: existing.stock !== undefined ? existing.stock.toString() : "",
            active: existing.active !== undefined ? existing.active : true,
            image: rawImg,
          }));
        }
      });
    }
    return () => { isMounted = false; };
  }, [id, products]);

  // Sync category and brand IDs if they were strings/names
  useEffect(() => {
    if (formData.category && categoriesList.length > 0) {
      const match = categoriesList.find(
        c => String(c.id) === String(formData.category) || c.name.toLowerCase() === formData.category.toLowerCase() || c.slug === formData.category
      );
      if (match && String(formData.category) !== String(match.id)) {
        setFormData(prev => ({ ...prev, category: String(match.id) }));
      }
    }
  }, [categoriesList, formData.category]);

  useEffect(() => {
    if (formData.brand && brandsList.length > 0) {
      const match = brandsList.find(
        b => String(b.id) === String(formData.brand) || b.name.toLowerCase() === formData.brand.toLowerCase()
      );
      if (match && String(formData.brand) !== String(match.id)) {
        setFormData(prev => ({ ...prev, brand: String(match.id) }));
      }
    }
  }, [brandsList, formData.brand]);

  // Clean field errors on change
  const clearFieldError = (fieldName: string) => {
    setFieldErrors(prev => {
      if (!prev[fieldName]) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    setErrorMsg("");
  };

  // Category change handler with smart fallback
  const handleCategoryChange = (newCat: string) => {
    clearFieldError("category");
    setFormData(prev => {
      const updated = { ...prev, category: newCat };
      // Only set category default image if user hasn't explicitly uploaded/selected a custom image
      if (!isCustomImage && (!prev.image || prev.image.includes('/defaults/'))) {
        const catObj = categoriesList.find(c => String(c.id) === String(newCat) || c.slug === newCat || c.name === newCat);
        const defaultImg = getCategoryDefaultImage(catObj || newCat);
        updated.image = defaultImg;
        clearFieldError("image");
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
    { id: "seo", label: "SEO & Search" },
  ];

  // =========================================================================
  // STRICT STEP-BY-STEP VALIDATION LOGIC
  // =========================================================================

  const getStepErrors = (stepIndex: number): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (stepIndex === 0) {
      if (!formData.name.trim()) {
        errors.name = "Product Name is required.";
      }
      if (!formData.brand) {
        errors.brand = "Please select a Brand.";
      }
      if (!formData.category) {
        errors.category = "Please select a Category.";
      }
      if (!formData.sku.trim()) {
        errors.sku = "SKU is required.";
      }
    } else if (stepIndex === 1) {
      const priceNum = parseFloat(formData.price);
      if (!formData.price || isNaN(priceNum) || priceNum <= 0) {
        errors.price = "Selling price must be greater than ₹0.";
      }

      if (formData.mrp && parseFloat(formData.mrp) > 0) {
        const mrpNum = parseFloat(formData.mrp);
        if (mrpNum < priceNum) {
          errors.mrp = "MRP (Maximum Retail Price) cannot be less than Selling Price.";
        }
      }

      const gstNum = parseInt(formData.gst_percent, 10);
      if (formData.gst_percent === "" || isNaN(gstNum) || ![0, 5, 12, 18, 28].includes(gstNum)) {
        errors.gst_percent = "Please select a valid GST slab (0%, 5%, 12%, 18%, or 28%).";
      }
    } else if (stepIndex === 2) {
      const stockNum = parseInt(formData.stock, 10);
      if (formData.stock === "" || isNaN(stockNum) || stockNum < 0) {
        errors.stock = "Stock quantity cannot be negative and must be a valid integer.";
      }
    } else if (stepIndex === 3) {
      const activeImg = localImagePreview || formData.image;
      if (!activeImg || !activeImg.trim()) {
        errors.image = "At least 1 product image is required. Upload a custom image or select a category default.";
      }
    }

    return errors;
  };

  const isStepComplete = (stepIndex: number): boolean => {
    return Object.keys(getStepErrors(stepIndex)).length === 0;
  };

  // Check if user is permitted to navigate forward to a target step
  const canNavigateToStep = (targetIndex: number): { allowed: boolean; blockingStep?: number } => {
    if (targetIndex <= activeSectionIndex) {
      return { allowed: true };
    }
    for (let i = 0; i < targetIndex; i++) {
      if (!isStepComplete(i)) {
        return { allowed: false, blockingStep: i };
      }
    }
    return { allowed: true };
  };

  // Sidebar navigation handler
  const handleStepClick = (targetIndex: number) => {
    if (targetIndex === activeSectionIndex) return;

    // Backward navigation is freely allowed
    if (targetIndex < activeSectionIndex) {
      setErrorMsg("");
      setActiveSectionIndex(targetIndex);
      return;
    }

    // Forward navigation: validate all preceding steps
    const navCheck = canNavigateToStep(targetIndex);
    if (!navCheck.allowed && navCheck.blockingStep !== undefined) {
      const blockingIdx = navCheck.blockingStep;
      const errors = getStepErrors(blockingIdx);
      setFieldErrors(prev => ({ ...prev, ...errors }));
      setActiveSectionIndex(blockingIdx);
      setErrorMsg(`Please complete all required fields in Step ${blockingIdx + 1} (${sections[blockingIdx].label}) before skipping ahead.`);
      return;
    }

    // Step navigation allowed
    setErrorMsg("");
    setActiveSectionIndex(targetIndex);
  };

  // Next Step button handler
  const handleNext = () => {
    const currentErrors = getStepErrors(activeSectionIndex);
    if (Object.keys(currentErrors).length > 0) {
      setFieldErrors(prev => ({ ...prev, ...currentErrors }));
      const firstError = Object.values(currentErrors)[0];
      setErrorMsg(firstError || `Please complete all required fields in Step ${activeSectionIndex + 1}.`);
      return;
    }

    setErrorMsg("");
    setActiveSectionIndex(prev => Math.min(prev + 1, sections.length - 1));
  };

  // Previous Step button handler
  const handlePrev = () => {
    setErrorMsg("");
    setActiveSectionIndex(prev => Math.max(prev - 1, 0));
  };

  // Validate entire wizard before submit
  const validateAll = (): boolean => {
    for (let i = 0; i < sections.length; i++) {
      const errors = getStepErrors(i);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(prev => ({ ...prev, ...errors }));
        setActiveSectionIndex(i);
        const firstError = Object.values(errors)[0];
        setErrorMsg(`Step ${i + 1} (${sections[i].label}): ${firstError}`);
        return false;
      }
    }
    return true;
  };

  // =========================================================================
  // IMAGE UPLOAD & LOCAL PREVIEW HANDLERS (Issue 2)
  // =========================================================================

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageErrorMsg("");
    setImageSuccessMsg("");
    clearFieldError("image");

    // 1. Extension & MIME validation
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = allowedExtensions.some(ext => lowerName.endsWith(ext));
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedMime.includes(file.type) && !hasValidExt) {
      setImageErrorMsg("Invalid file format. Please upload a .jpg, .jpeg, .png, or .webp image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 2. Client-side Size limit check (20MB max)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      setImageErrorMsg(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 20MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 3. Instant local image preview using URL.createObjectURL
    const objectUrl = URL.createObjectURL(file);
    setLocalImagePreview(objectUrl);
    setIsCustomImage(true);

    // 4. Server-side upload via catalogApi with multipart/form-data
    setIsUploadingImage(true);
    try {
      const res = await catalogApi.uploadProductImage(file);
      const serverImageUrl = res.image_url || res.url;
      // Persist uploaded image URL into formData state
      setFormData(prev => ({ ...prev, image: serverImageUrl }));
      setIsCustomImage(true);
      setImageSuccessMsg(`✓ Custom image uploaded and verified successfully (${file.name})`);
    } catch (err: any) {
      console.error("Image upload failed:", err);
      setImageErrorMsg(err?.message || "Failed to upload image. Please verify your connection and image file.");
      // Fallback: keep local preview so user still sees what they picked
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Select Image from Library Modal
  const handleSelectLibraryImage = (item: { key: string; name: string; image_url: string }) => {
    setImageErrorMsg("");
    clearFieldError("image");
    setLocalImagePreview(null);
    setFormData(prev => ({ ...prev, image: item.image_url }));
    setIsCustomImage(false);
    setImageSuccessMsg(`✓ Selected "${item.name}" default image from library.`);
    setShowLibraryModal(false);
  };

  // Switch to Category Default Action
  const handleUseCategoryDefault = () => {
    setImageErrorMsg("");
    clearFieldError("image");
    setLocalImagePreview(null);
    const catObj = categoriesList.find(c => String(c.id) === String(formData.category) || c.slug === formData.category || c.name === formData.category);
    const defaultImg = getCategoryDefaultImage(catObj || formData.category);
    setFormData(prev => ({ ...prev, image: defaultImg }));
    setIsCustomImage(false);
    setImageSuccessMsg("✓ Using category-appropriate default image.");
  };

  // Remove / Reset Image Action
  const handleRemoveImage = () => {
    setImageErrorMsg("");
    clearFieldError("image");
    setLocalImagePreview(null);
    const catObj = categoriesList.find(c => String(c.id) === String(formData.category) || c.slug === formData.category || c.name === formData.category);
    const defaultImg = getCategoryDefaultImage(catObj || formData.category);
    setFormData(prev => ({ ...prev, image: defaultImg }));
    setIsCustomImage(false);
    setImageSuccessMsg("Custom image removed. Reverted to category default.");
  };

  // =========================================================================
  // SUBMIT HANDLER
  // =========================================================================

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    // Filter valid specs and ensure GST Rate is saved
    const validSpecs = specs.filter(s => s.key.trim() && s.value.trim());
    const hasGstSpec = validSpecs.some(s => s.key.toLowerCase().includes("gst"));
    if (!hasGstSpec && formData.gst_percent) {
      validSpecs.push({ key: "GST Rate", value: `${formData.gst_percent}%` });
    }

    const priceNum = parseFloat(formData.price);
    const mrpNum = formData.mrp ? parseFloat(formData.mrp) : priceNum;
    const finalImage = formData.image || getCategoryDefaultImage(formData.category);

    const submitData = {
      ...formData,
      image: finalImage,
      price: priceNum,
      mrp: mrpNum >= priceNum ? mrpNum : priceNum,
      stock: parseInt(formData.stock, 10),
      lowStockThreshold: parseInt(formData.lowStockThreshold, 10) || 10,
      specs: validSpecs,
      slug: formData.slug.trim(),
      meta_title: formData.meta_title.trim(),
      meta_description: formData.meta_description.trim(),
      canonical_url: formData.canonical_url.trim(),
      is_indexable: formData.is_indexable,
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
      setTimeout(() => {
        setSaved(false);
        navigate("/admin/products");
      }, 1200);
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

  // Compute live preview URL: local object URL takes precedence while uploading, else resolved server URL
  const activePreviewUrl = useMemo(() => {
    if (localImagePreview) return localImagePreview;
    return resolveProductImage({
      image: formData.image,
      category: selectedCategoryObj || formData.category,
    });
  }, [localImagePreview, formData.image, selectedCategoryObj, formData.category]);

  // Pricing calculations for live preview card
  const priceVal = parseFloat(formData.price) || 0;
  const gstRateVal = parseInt(formData.gst_percent, 10) || 0;
  const baseTaxable = priceVal > 0 ? priceVal / (1 + gstRateVal / 100) : 0;
  const gstAmount = priceVal > 0 ? priceVal - baseTaxable : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin/products")}
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#0A2540] hover:bg-slate-50 transition-colors shadow-xs"
            title="Back to products list"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#0A2540]">{id ? "Edit Product" : "Add New Product"}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Step {activeSectionIndex + 1} of {sections.length}: {sections[activeSectionIndex].label}
            </p>
          </div>
        </div>

        {/* Action Header Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${
            isSaving
              ? "opacity-60 cursor-not-allowed bg-[#F2A900] text-[#0A2540]"
              : saved
                ? "bg-[#12773D] text-white"
                : "bg-[#F2A900] hover:bg-[#e09b00] text-[#0A2540] hover:shadow"
          }`}
        >
          {isSaving ? "Saving..." : saved ? "✓ Saved!" : (id ? "Update Product" : "Save Product")}
        </button>
      </div>

      <form onSubmit={handleSave}>
        {/* Mobile / Tablet Horizontal Stepper (< lg) */}
        <div className="lg:hidden mb-4 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-xs">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {sections.map((s, idx) => {
              const isCurrent = activeSectionIndex === idx;
              const isCompleted = isStepComplete(idx);
              const navCheck = canNavigateToStep(idx);
              const isLocked = !navCheck.allowed;

              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => handleStepClick(idx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs whitespace-nowrap shrink-0 transition-all ${
                    isCurrent
                      ? "bg-[#0A2540] text-white font-bold shadow-xs"
                      : isLocked
                        ? "text-slate-400 bg-slate-50 opacity-60 cursor-not-allowed"
                        : "text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium cursor-pointer"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isCurrent
                        ? "bg-[#F2A900] text-[#0A2540]"
                        : isCompleted
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-300 text-slate-700"
                    }`}
                  >
                    {isCompleted ? "✓" : idx + 1}
                  </span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6 items-start">
          {/* 1. Left Sidebar Step Navigation (Desktop lg+) */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs sticky top-4 space-y-1.5">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Product Wizard</span>
              </div>

              {sections.map((s, idx) => {
                const isCurrent = activeSectionIndex === idx;
                const isCompleted = isStepComplete(idx);
                const navCheck = canNavigateToStep(idx);
                const isLocked = !navCheck.allowed;

                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => handleStepClick(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-xl transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-[#0A2540] text-white font-bold shadow-sm"
                        : isLocked
                          ? "text-slate-400 hover:bg-slate-50/50 cursor-not-allowed opacity-70"
                          : "text-slate-700 hover:bg-slate-100 font-medium"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          isCurrent
                            ? "bg-[#F2A900] text-[#0A2540]"
                            : isCompleted
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate">{s.label}</span>
                    </div>

                    <div className="shrink-0 flex items-center ml-2">
                      {isCompleted ? (
                        <span
                          className={`p-1 rounded-full ${isCurrent ? "bg-white/20 text-[#F2A900]" : "bg-emerald-100 text-emerald-700"}`}
                          title="Step completed"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : isLocked ? (
                        <span className="text-slate-300" title="Complete preceding steps to unlock">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Main Step Content Area */}
          <div className="lg:col-span-3 space-y-5">
            {/* Top Error Alert Banner */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 shadow-xs">
                <span className="text-base shrink-0">⚠</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* STEP 1: Basic Information */}
            {activeSectionIndex === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div>
                  <h2 className="font-bold text-[#0A2540] text-lg">Basic Information</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Core identification and classification for the catalog item.</p>
                </div>

                <div className="grid gap-4">
                  {/* Product Name */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => {
                        setFormData({ ...formData, name: e.target.value });
                        clearFieldError("name");
                      }}
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors ${
                        fieldErrors.name
                          ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                          : "border-slate-300 focus:border-[#0A2540]"
                      }`}
                      placeholder="e.g. Schneider Acti9 1P 16A C-Curve MCB"
                    />
                    {fieldErrors.name && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                        <span>⚠</span> {fieldErrors.name}
                      </p>
                    )}
                  </div>

                  {/* Brand & Category Grid */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Brand */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                        Brand / Manufacturer <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.brand}
                        onChange={e => {
                          setFormData({ ...formData, brand: e.target.value });
                          clearFieldError("brand");
                        }}
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none bg-white transition-colors cursor-pointer ${
                          fieldErrors.brand
                            ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                            : "border-slate-300 focus:border-[#0A2540]"
                        }`}
                      >
                        <option value="">Select Brand</option>
                        {brandsList.map(b => (
                          <option key={b.id} value={String(b.id)}>{b.name}</option>
                        ))}
                      </select>
                      {fieldErrors.brand && (
                        <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                          <span>⚠</span> {fieldErrors.brand}
                        </p>
                      )}
                    </div>

                    {/* Category */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.category}
                        onChange={e => handleCategoryChange(e.target.value)}
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none bg-white transition-colors cursor-pointer ${
                          fieldErrors.category
                            ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                            : "border-slate-300 focus:border-[#0A2540]"
                        }`}
                      >
                        <option value="">Select Category</option>
                        {categoriesList.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </select>
                      {fieldErrors.category && (
                        <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                          <span>⚠</span> {fieldErrors.category}
                        </p>
                      )}

                      {formData.category && (
                        <div className="mt-2.5 flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                          <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden shrink-0 flex items-center justify-center">
                            <img
                              src={getCategoryDefaultImage(selectedCategoryObj || formData.category)}
                              alt="Category Default"
                              className="w-full h-full object-contain"
                              onError={(e) => handleProductImageError(e, selectedCategoryObj || formData.category)}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-[#0A2540] truncate">
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

                  {/* SKU */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      SKU (Stock Keeping Unit) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={e => {
                        setFormData({ ...formData, sku: e.target.value.toUpperCase() });
                        clearFieldError("sku");
                      }}
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none font-mono uppercase transition-colors ${
                        fieldErrors.sku
                          ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                          : "border-slate-300 focus:border-[#0A2540]"
                      }`}
                      placeholder="e.g. SCH-MCB-1P-16A"
                    />
                    {fieldErrors.sku && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                        <span>⚠</span> {fieldErrors.sku}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">Product Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={4}
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#0A2540] resize-none"
                      placeholder="Detailed features, commercial warranty, standards (IS/IEC), and application notes..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Pricing & GST */}
            {activeSectionIndex === 1 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div>
                  <h2 className="font-bold text-[#0A2540] text-lg">Pricing &amp; GST Configuration</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Specify customer selling price, optional MRP, and applicable Indian GST tax slab.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Selling Price */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Selling Price (₹ INR) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price}
                        onChange={e => {
                          setFormData({ ...formData, price: e.target.value });
                          clearFieldError("price");
                        }}
                        className={`w-full pl-8 pr-3.5 py-2.5 border rounded-xl text-sm outline-none font-semibold transition-colors ${
                          fieldErrors.price
                            ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                            : "border-slate-300 focus:border-[#0A2540]"
                        }`}
                        placeholder="245.00"
                      />
                    </div>
                    {fieldErrors.price && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                        <span>⚠</span> {fieldErrors.price}
                      </p>
                    )}
                  </div>

                  {/* MRP */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Maximum Retail Price / MRP (₹ INR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.mrp}
                        onChange={e => {
                          setFormData({ ...formData, mrp: e.target.value });
                          clearFieldError("mrp");
                        }}
                        className={`w-full pl-8 pr-3.5 py-2.5 border rounded-xl text-sm outline-none transition-colors ${
                          fieldErrors.mrp
                            ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                            : "border-slate-300 focus:border-[#0A2540]"
                        }`}
                        placeholder="280.00"
                      />
                    </div>
                    {fieldErrors.mrp && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                        <span>⚠</span> {fieldErrors.mrp}
                      </p>
                    )}
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Must be greater than or equal to selling price. If blank, defaults to selling price.
                    </span>
                  </div>

                  {/* GST Percentage */}
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Applicable GST Slab (%) <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.gst_percent}
                      onChange={e => {
                        setFormData({ ...formData, gst_percent: e.target.value });
                        clearFieldError("gst_percent");
                      }}
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none bg-white transition-colors cursor-pointer ${
                        fieldErrors.gst_percent
                          ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                          : "border-slate-300 focus:border-[#0A2540]"
                      }`}
                    >
                      {GST_SLABS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    {fieldErrors.gst_percent && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                        <span>⚠</span> {fieldErrors.gst_percent}
                      </p>
                    )}
                  </div>
                </div>

                {/* Live Tax & Price Breakdown Card */}
                {priceVal > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium block">Base Value (Excl. Tax)</span>
                      <span className="text-sm font-bold text-slate-800">₹{baseTaxable.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Applicable GST ({gstRateVal}%)</span>
                      <span className="text-sm font-bold text-emerald-700">+₹{gstAmount.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Final Customer Price (Incl. GST)</span>
                      <span className="text-sm font-bold text-[#0A2540]">₹{priceVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: Inventory */}
            {activeSectionIndex === 2 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div>
                  <h2 className="font-bold text-[#0A2540] text-lg">Inventory &amp; Stock Levels</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Manage live warehouse quantity, low stock triggers, and store publication status.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Current Stock */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Current Stock Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.stock}
                      onChange={e => {
                        setFormData({ ...formData, stock: e.target.value });
                        clearFieldError("stock");
                      }}
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none font-semibold transition-colors ${
                        fieldErrors.stock
                          ? "border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-1 focus:ring-red-500"
                          : "border-slate-300 focus:border-[#0A2540]"
                      }`}
                      placeholder="50"
                    />
                    {fieldErrors.stock && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                        <span>⚠</span> {fieldErrors.stock}
                      </p>
                    )}
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Must be an integer greater than or equal to 0.
                    </span>
                  </div>

                  {/* Low Stock Threshold */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Low Stock Alert Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.lowStockThreshold}
                      onChange={e => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#0A2540]"
                      placeholder="10"
                    />
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Admin receives replenishment alerts when stock drops below this level.
                    </span>
                  </div>

                  {/* Active Toggle */}
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.active}
                        onChange={e => setFormData({ ...formData, active: e.target.checked })}
                        className="w-4 h-4 rounded text-[#0A2540] border-slate-300 focus:ring-[#0A2540]"
                      />
                      <div>
                        <span className="text-sm font-bold text-slate-800 block">Published in Online Store</span>
                        <span className="text-xs text-slate-500 block">
                          When checked, this product is immediately visible and purchasable by retail and B2B customers.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Product Image Management */}
            {activeSectionIndex === 3 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div>
                  <h2 className="font-bold text-[#0A2540] text-lg">Product Image Management</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Upload an authentic high-resolution product photograph or choose a verified category default image.
                  </p>
                </div>

                {/* Inline Red Error under Image section if missing */}
                {fieldErrors.image && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <span>⚠</span>
                    <span>{fieldErrors.image}</span>
                  </div>
                )}

                {/* Upload Status Messages */}
                {imageErrorMsg && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <span>⚠</span>
                    <span>{imageErrorMsg}</span>
                  </div>
                )}
                {imageSuccessMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <span>✓</span>
                    <span>{imageSuccessMsg}</span>
                  </div>
                )}

                {/* Image Preview & Controls Grid */}
                <div className="grid md:grid-cols-2 gap-6 items-start">
                  {/* Left: Active Image Preview Card */}
                  <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/70 flex flex-col items-center">
                    <div className="relative w-full max-w-[260px] aspect-square rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm flex items-center justify-center p-3 mb-3">
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center justify-center text-slate-500 gap-2.5">
                          <div className="w-9 h-9 border-3 border-[#0A2540] border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs font-semibold text-[#0A2540]">Uploading &amp; Verifying...</span>
                        </div>
                      ) : activePreviewUrl ? (
                        <img
                          key={activePreviewUrl}
                          src={activePreviewUrl}
                          alt={formData.name || "Product Preview"}
                          className="w-full h-full object-contain"
                          loading="eager"
                          onError={(e) => handleProductImageError(e, selectedCategoryObj || formData.category)}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                          <span className="text-3xl mb-1.5">⚡</span>
                          <span className="text-xs font-medium text-slate-500">No image assigned yet</span>
                        </div>
                      )}

                      {/* Image Source Badge */}
                      {!isUploadingImage && activePreviewUrl && (
                        <div className="absolute top-2.5 left-2.5">
                          {isCustomImage ? (
                            <span className="bg-[#0A2540] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                              <span>★</span> Custom Image
                            </span>
                          ) : (
                            <span className="bg-[#12773D] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                              <span>✓</span> Category Default
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-center w-full px-2">
                      <p className="text-xs font-bold text-slate-800 truncate mb-0.5">
                        {formData.name || "Product Image Preview"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {isCustomImage ? "Persisted in product wizard state" : `Default for ${displayCategoryName || "category"}`}
                      </p>
                    </div>
                  </div>

                  {/* Right: Upload Actions & Controls */}
                  <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Choose Image Source</h3>

                      {/* Action 1: Upload Custom File */}
                      <div>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          ref={fileInputRef}
                          onChange={handleImageFileChange}
                          className="hidden"
                          id="product-image-file-input"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingImage}
                          className="w-full flex items-center justify-center gap-2 bg-[#0A2540] hover:bg-[#153e66] text-white text-xs font-bold py-3 px-4 rounded-xl shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span>{isCustomImage ? "Replace With New Upload" : "Upload Custom Image"}</span>
                        </button>
                        <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                          JPG, PNG, or WebP • Up to 20MB • Instant local preview
                        </p>
                      </div>

                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-slate-200"></div>
                        <span className="flex-shrink mx-2 text-[10px] text-slate-400 uppercase font-bold">Or</span>
                        <div className="flex-grow border-t border-slate-200"></div>
                      </div>

                      {/* Action 2: Use Category Default */}
                      <button
                        type="button"
                        onClick={handleUseCategoryDefault}
                        className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 px-4 rounded-xl border transition-all cursor-pointer ${
                          !isCustomImage && formData.image && !formData.image.includes('/defaults/')
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Use Category Default Image</span>
                      </button>

                      {/* Action 3: Browse Catalog Default Library */}
                      <button
                        type="button"
                        onClick={() => setShowLibraryModal(true)}
                        className="w-full flex items-center justify-center gap-2 bg-blue-50/70 hover:bg-blue-100 text-[#0A2540] text-xs font-semibold py-2.5 px-4 rounded-xl border border-blue-200 transition-all cursor-pointer"
                      >
                        <svg className="w-4 h-4 text-[#0A2540] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Browse Default Library ({libraryImages.length})</span>
                      </button>

                      {/* Action 4: Reset Custom Image */}
                      {isCustomImage && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="w-full text-xs text-red-600 hover:text-red-700 font-semibold py-1.5 text-center transition-colors cursor-pointer"
                        >
                          Reset to category default
                        </button>
                      )}
                    </div>

                    {/* Direct Image URL input */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">
                        Direct Image URL (Optional)
                      </label>
                      <input
                        type="text"
                        value={formData.image && formData.image.startsWith('data:') ? '' : formData.image}
                        onChange={e => {
                          const val = e.target.value.trim();
                          setFormData({ ...formData, image: val });
                          setIsCustomImage(Boolean(val && !val.includes('/defaults/')));
                          clearFieldError("image");
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#0A2540] bg-white font-mono"
                        placeholder="e.g. /media/products/... or https://..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Technical Specifications */}
            {activeSectionIndex === 4 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div>
                  <h2 className="font-bold text-[#0A2540] text-lg">Technical Specifications</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add key parameters (Poles, Rated Current, Wire Gauge, Breaking Capacity, Voltage, Color).
                  </p>
                </div>

                <div className="space-y-3">
                  {specs.map((spec, i) => (
                    <div key={i} className="flex gap-2.5 items-center">
                      <input
                        value={spec.key}
                        onChange={e => setSpecs(s => s.map((sp, j) => j === i ? { ...sp, key: e.target.value } : sp))}
                        className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#0A2540]"
                        placeholder="Parameter Name (e.g. Poles / Sweep Size)"
                      />
                      <input
                        value={spec.value}
                        onChange={e => setSpecs(s => s.map((sp, j) => j === i ? { ...sp, value: e.target.value } : sp))}
                        className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#0A2540]"
                        placeholder="Specification Value (e.g. 1P / 1200 mm)"
                      />
                      <button
                        type="button"
                        onClick={() => setSpecs(s => s.filter((_, j) => j !== i))}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete parameter"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setSpecs(s => [...s, { key: "", value: "" }])}
                    className="text-xs font-bold text-[#0A2540] hover:text-[#1769AA] flex items-center gap-1.5 py-1.5"
                  >
                    <span>+ Add Technical Specification</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: SEO & Search */}
            {activeSectionIndex === 5 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div>
                  <h2 className="font-bold text-[#0A2540] text-lg">Search Engine Optimization (SEO)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Customize search engine indexing, page metadata title, and URL slug for Google search rankings.
                  </p>
                </div>

                {/* Google Result Preview */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Google Search Snippet Preview
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="w-4 h-4 rounded-full bg-[#0A2540] text-[#F2A900] inline-flex items-center justify-center text-[10px] font-bold">V</span>
                      <span className="truncate">https://veepowerelectricals.com › product › {formData.slug || "product-url-slug"}</span>
                    </div>
                    <div className="text-sm font-semibold text-[#1a0dab] hover:underline cursor-pointer truncate">
                      {formData.meta_title || `${formData.name || "Product Name"} | ${formData.brand || "Brand"} | Vee Power Electricals`}
                    </div>
                    <p className="text-xs text-[#4d5156] line-clamp-2 leading-relaxed">
                      {formData.meta_description || `Buy genuine ${formData.brand || "brand"} ${formData.name || "electrical equipment"} online at ₹${formData.price || "0.00"} INR from Vee Power Electricals. Fast delivery across India.`}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  {/* Meta Title */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700">SEO Meta Title</label>
                      <span className={`text-[10px] ${formData.meta_title.length > 60 ? "text-amber-600 font-bold" : "text-slate-400"}`}>
                        {formData.meta_title.length}/60 recommended (max 200)
                      </span>
                    </div>
                    <input
                      type="text"
                      value={formData.meta_title}
                      onChange={e => setFormData({ ...formData, meta_title: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-[#0A2540]"
                      placeholder={`${formData.name || "Product Name"} | ${formData.brand || "Brand"} | Vee Power Electricals`}
                      maxLength={200}
                    />
                  </div>

                  {/* Meta Description */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700">SEO Meta Description</label>
                      <span className={`text-[10px] ${formData.meta_description.length > 160 ? "text-amber-600 font-bold" : "text-slate-400"}`}>
                        {formData.meta_description.length}/160 recommended (max 320)
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={formData.meta_description}
                      onChange={e => setFormData({ ...formData, meta_description: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-[#0A2540] resize-none"
                      placeholder="Brief customer-friendly description for Google snippets with key specs and fast shipping details..."
                      maxLength={320}
                    />
                  </div>

                  {/* URL Slug */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">URL Slug</label>
                    <div className="flex items-center rounded-xl border border-slate-300 overflow-hidden focus-within:border-[#0A2540]">
                      <span className="bg-slate-100 text-slate-500 text-xs px-3 py-2 border-r border-slate-300 shrink-0 font-mono">
                        /product/
                      </span>
                      <input
                        type="text"
                        value={formData.slug}
                        onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') })}
                        className="flex-1 px-3 py-2 text-xs outline-none font-mono"
                        placeholder="e.g. schneider-acti9-1p-16a"
                      />
                    </div>
                  </div>

                  {/* Indexing Checkbox */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_indexable}
                        onChange={e => setFormData({ ...formData, is_indexable: e.target.checked })}
                        className="mt-0.5 w-4 h-4 rounded text-[#0A2540] border-slate-300 focus:ring-[#0A2540]"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Allow Search Engine Indexing</span>
                        <span className="text-[11px] text-slate-500 block">
                          When checked, search engines will crawl and index this product page in search rankings.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Wizard Navigation Footer Buttons */}
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-200">
              {activeSectionIndex > 0 ? (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="px-5 py-2.5 border border-slate-300 bg-white rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  ← Previous Step
                </button>
              ) : (
                <div></div>
              )}

              {activeSectionIndex < sections.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-2.5 bg-[#0A2540] hover:bg-[#153e66] text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow"
                >
                  Next Step ({sections[activeSectionIndex + 1].label}) →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`px-8 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
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

      {/* Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-modal-title"
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 id="library-modal-title" className="font-bold text-[#0A2540] text-sm">
                  Default Product Image Library
                </h3>
                <p className="text-xs text-slate-500">
                  Select a category default image from the curated catalog library.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                aria-label="Close dialog"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
              {libraryImages.map((item) => {
                const isSelected = formData.image === item.image_url;
                const resolvedThumb = resolveProductImage({ image: item.image_url, category: item.key });
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectLibraryImage(item)}
                    className={`group relative text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col items-center ${
                      isSelected
                        ? "border-[#0A2540] bg-blue-50/50 ring-2 ring-[#0A2540]/20"
                        : "border-slate-200 hover:border-[#0A2540] hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-full aspect-square rounded-lg bg-white border border-slate-100 p-1 flex items-center justify-center overflow-hidden mb-2">
                      <img
                        src={resolvedThumb}
                        alt={item.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    </div>
                    <span className="font-bold text-slate-800 text-center line-clamp-1">{item.name}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Category Default</span>
                    {isSelected && (
                      <span className="absolute top-2 right-2 bg-[#12773D] text-white rounded-full p-0.5 shadow-xs">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
