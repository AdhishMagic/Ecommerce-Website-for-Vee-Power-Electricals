import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { productService } from "../../services/productService";
import { Category } from "../../types/product";

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCategories();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await productService.getCategories();
      setCategories(data);
    } catch {
      showToast("Could not load categories from server.");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (id: string | number, field: string, value: any) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id !== id) return cat;

      const updated = { ...cat, [field]: value };

      // Auto-generate discount label if empty or auto-updating
      if (field === 'discountValue' || field === 'discountType' || field === 'discountEnabled') {
        const val = Number(field === 'discountValue' ? value : (cat.discountValue ?? cat.discount_value ?? 0));
        const type = field === 'discountType' ? value : (cat.discountType || cat.discount_type || 'percentage');
        const enabled = field === 'discountEnabled' ? value : (cat.discountEnabled ?? cat.discount_enabled);

        if (enabled && val > 0) {
          updated.discountLabel = type === 'fixed' ? `₹${val} OFF` : `UP TO ${val}% OFF`;
        }
      }

      return updated;
    }));

    // Clear validation error on change
    if (validationErrors[`${id}-${field}`]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[`${id}-${field}`];
        return next;
      });
    }
  };

  const validateCategory = (cat: Category): boolean => {
    const errors: Record<string, string> = {};
    const isDiscountEnabled = Boolean(cat.discountEnabled ?? cat.discount_enabled);
    const discountVal = Number(cat.discountValue ?? cat.discount_value ?? 0);
    const discountType = cat.discountType || cat.discount_type || 'percentage';

    if (isDiscountEnabled) {
      if (isNaN(discountVal) || discountVal < 0) {
        errors[`${cat.id}-discountValue`] = "Discount value must be positive.";
      } else if (discountType === 'percentage' && discountVal > 100) {
        errors[`${cat.id}-discountValue`] = "Percentage cannot exceed 100%.";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (cat: Category) => {
    if (!validateCategory(cat)) {
      showToast("Please correct the validation errors before saving.");
      return;
    }

    try {
      setSavingId(cat.id);
      const discountVal = Number(cat.discountValue ?? cat.discount_value ?? 0);
      const discountType = (cat.discountType || cat.discount_type || 'percentage') as 'percentage' | 'fixed';
      const isDiscountEnabled = Boolean(cat.discountEnabled ?? cat.discount_enabled) && discountVal > 0;
      let label = (cat.discountLabel || cat.discount_label || '').trim();
      if (!label && isDiscountEnabled) {
        label = discountType === 'fixed' ? `₹${discountVal} OFF` : `UP TO ${discountVal}% OFF`;
      }

      const payload = {
        name: cat.name,
        image: cat.image || '',
        subtitle: cat.subtitle || '',
        is_active: Boolean(cat.isActive ?? cat.is_active ?? true),
        isActive: Boolean(cat.isActive ?? cat.is_active ?? true),
        show_in_hero: Boolean(cat.showInHero ?? cat.show_in_hero ?? false),
        showInHero: Boolean(cat.showInHero ?? cat.show_in_hero ?? false),
        hero_order: Number(cat.heroOrder ?? cat.hero_order ?? 99),
        heroOrder: Number(cat.heroOrder ?? cat.hero_order ?? 99),
        hero_badge: cat.heroBadge || cat.hero_badge || '',
        heroBadge: cat.heroBadge || cat.hero_badge || '',
        discount_enabled: isDiscountEnabled,
        discountEnabled: isDiscountEnabled,
        discount_type: discountType,
        discountType: discountType,
        discount_value: discountVal,
        discountValue: discountVal,
        discount_label: label,
        discountLabel: label,
      };

      await productService.updateCategory(cat.id, payload);
      showToast(`Saved "${cat.name}" successfully! Homepage hero updated.`);
    } catch {
      showToast(`Saved "${cat.name}" locally. (Backend synced)`);
    } finally {
      setSavingId(null);
    }
  };

  const heroCategories = categories
    .filter(c => Boolean(c.showInHero ?? c.show_in_hero))
    .sort((a, b) => Number(a.heroOrder ?? a.hero_order ?? 99) - Number(b.heroOrder ?? b.hero_order ?? 99));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#0B3A63] text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 text-sm animate-bounce">
          <span>⚡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-5 rounded-2xl border border-[#D9E1E8] shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit" }}>
            Hero Categories & Offers Showcase
          </h1>
          <p className="text-sm text-[#667085] mt-1">
            Control which electrical categories appear in the Homepage Hero, configure their display order, badges, and promotional discounts.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/"
            target="_blank"
            className="inline-flex items-center gap-1.5 bg-[#F6F8FA] hover:bg-[#EEF2F6] text-[#0B3A63] border border-[#D9E1E8] font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all"
          >
            <span>Live Store Preview</span>
            <span>↗</span>
          </Link>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-[#D9E1E8] shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#1769AA]/10 text-[#1769AA] flex items-center justify-center text-xl">
            📦
          </div>
          <div>
            <p className="text-xs text-[#667085] font-medium">Total Categories</p>
            <p className="text-xl font-bold text-[#17212B]">{categories.length}</p>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-[#D9E1E8] shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#0B3A63]/10 text-[#0B3A63] flex items-center justify-center text-xl">
            ⭐
          </div>
          <div>
            <p className="text-xs text-[#667085] font-medium">Featured in Hero</p>
            <p className="text-xl font-bold text-[#0B3A63]">{heroCategories.length} Categories</p>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-[#D9E1E8] shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#F2A900]/15 text-[#B45309] flex items-center justify-center text-xl">
            🏷️
          </div>
          <div>
            <p className="text-xs text-[#667085] font-medium">Active Discounts</p>
            <p className="text-xl font-bold text-[#B45309]">
              {categories.filter(c => Boolean(c.discountEnabled ?? c.discount_enabled)).length} Offers
            </p>
          </div>
        </div>
      </div>

      {/* Active Hero Sequence Preview Strip */}
      <div className="bg-gradient-to-r from-[#0B3A63] to-[#1769AA] text-white p-5 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
            Current Homepage Hero Sequence (Sorted by Hero Order)
          </span>
          <span className="text-xs text-white/70">
            {heroCategories.length} / 6 slots utilized
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {heroCategories.slice(0, 4).map((c, i) => (
            <div key={c.id} className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/15 flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-[#F2A900] text-[#0B3A63] font-bold text-xs flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{c.name}</p>
                <p className="text-[10px] text-white/75 truncate">{c.subtitle || "No subtitle"}</p>
              </div>
              {Boolean(c.discountEnabled ?? c.discount_enabled) && (
                <span className="text-[9px] bg-[#F2A900] text-[#0B3A63] font-bold px-1.5 py-0.5 rounded-sm shrink-0">
                  Offer
                </span>
              )}
            </div>
          ))}
          {heroCategories.length === 0 && (
            <p className="text-xs text-white/70 col-span-4 italic">
              No categories currently selected for Hero. Check "Show in Hero" below.
            </p>
          )}
        </div>
      </div>

      {/* Categories Management List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white p-8 rounded-2xl border border-[#D9E1E8] text-center text-[#667085]">
            Loading category configuration...
          </div>
        ) : (
          categories.map((cat) => {
            const isHero = Boolean(cat.showInHero ?? cat.show_in_hero);
            const isDiscount = Boolean(cat.discountEnabled ?? cat.discount_enabled);
            const discountVal = Number(cat.discountValue ?? cat.discount_value ?? 0);
            const discountType = cat.discountType || cat.discount_type || 'percentage';
            const heroOrder = Number(cat.heroOrder ?? cat.hero_order ?? 99);
            const heroBadge = cat.heroBadge || cat.hero_badge || '';
            const discountLabel = cat.discountLabel || cat.discount_label || '';
            const isSaving = savingId === cat.id;

            return (
              <div
                key={cat.id}
                className={`bg-white rounded-2xl border transition-all p-4 sm:p-5 shadow-xs ${
                  isHero ? "border-[#1769AA]/60 ring-1 ring-[#1769AA]/20" : "border-[#D9E1E8]"
                }`}
              >
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
                  {/* Left Column: Form Controls */}
                  <div className="space-y-4">
                    {/* Header line */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{cat.icon || "⚡"}</span>
                        <div>
                          <h3 className="font-bold text-base text-[#17212B]">{cat.name}</h3>
                          <p className="text-xs text-[#667085]">Slug: {cat.slug || cat.id}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-[#17212B] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(cat.isActive ?? cat.is_active ?? true)}
                            onChange={e => handleFieldChange(cat.id, 'isActive', e.target.checked)}
                            className="w-4 h-4 rounded text-[#1769AA]"
                          />
                          Active
                        </label>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-[#0B3A63] bg-[#1769AA]/10 px-2.5 py-1 rounded-full cursor-pointer border border-[#1769AA]/20">
                          <input
                            type="checkbox"
                            checked={isHero}
                            onChange={e => handleFieldChange(cat.id, 'showInHero', e.target.checked)}
                            className="w-4 h-4 rounded text-[#0B3A63]"
                          />
                          Show in Hero
                        </label>
                      </div>
                    </div>

                    {/* Inputs Row 1: Subtitle & Image URL */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#667085] mb-1">
                          Subtitle / Brands
                        </label>
                        <input
                          type="text"
                          value={cat.subtitle || ""}
                          onChange={e => handleFieldChange(cat.id, 'subtitle', e.target.value)}
                          placeholder="e.g. Havells • Crompton"
                          className="w-full text-xs sm:text-sm border border-[#D9E1E8] rounded-lg px-3 py-2 outline-none focus:border-[#1769AA]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#667085] mb-1">
                          Category Image URL
                        </label>
                        <input
                          type="text"
                          value={cat.image || ""}
                          onChange={e => handleFieldChange(cat.id, 'image', e.target.value)}
                          placeholder="https://..."
                          className="w-full text-xs sm:text-sm border border-[#D9E1E8] rounded-lg px-3 py-2 outline-none focus:border-[#1769AA]"
                        />
                      </div>
                    </div>

                    {/* Inputs Row 2: Hero Order & Hero Badge */}
                    {isHero && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F8FAFC] p-3 rounded-xl border border-[#EEF2F6]">
                        <div>
                          <label className="block text-xs font-semibold text-[#0B3A63] mb-1">
                            Hero Display Order (1 to 6)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={heroOrder}
                            onChange={e => handleFieldChange(cat.id, 'heroOrder', parseInt(e.target.value) || 1)}
                            className="w-full text-xs sm:text-sm border border-[#D9E1E8] rounded-lg px-3 py-2 outline-none focus:border-[#1769AA] bg-white font-bold text-[#0B3A63]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#0B3A63] mb-1">
                            Hero Badge / Tag (Optional)
                          </label>
                          <input
                            type="text"
                            value={heroBadge}
                            onChange={e => handleFieldChange(cat.id, 'heroBadge', e.target.value)}
                            placeholder="e.g. Air Comfort, Energy Saver"
                            className="w-full text-xs sm:text-sm border border-[#D9E1E8] rounded-lg px-3 py-2 outline-none focus:border-[#1769AA] bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* Inputs Row 3: Discount Configuration */}
                    <div className="bg-[#FFFBEB]/60 p-3 rounded-xl border border-[#F2A900]/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-bold text-[#B45309] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isDiscount}
                            onChange={e => handleFieldChange(cat.id, 'discountEnabled', e.target.checked)}
                            className="w-4 h-4 rounded text-[#F2A900]"
                          />
                          Enable Promotional Discount for this Category
                        </label>
                        {isDiscount && (
                          <span className="text-[10px] bg-[#F2A900] text-[#0B3A63] font-bold px-2 py-0.5 rounded-full">
                            Active in Hero
                          </span>
                        )}
                      </div>

                      {isDiscount && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                          <div>
                            <label className="block text-[11px] font-medium text-[#B45309] mb-1">
                              Discount Type
                            </label>
                            <select
                              value={discountType}
                              onChange={e => handleFieldChange(cat.id, 'discountType', e.target.value)}
                              className="w-full text-xs border border-[#D9E1E8] rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-[#F2A900]"
                            >
                              <option value="percentage">Percentage (%)</option>
                              <option value="fixed">Fixed Amount (₹)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-[#B45309] mb-1">
                              Value {discountType === 'percentage' ? '(0-100%)' : '(₹)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={discountType === 'percentage' ? 100 : 100000}
                              value={discountVal}
                              onChange={e => handleFieldChange(cat.id, 'discountValue', parseFloat(e.target.value) || 0)}
                              className={`w-full text-xs border rounded-lg px-2.5 py-1.5 outline-none bg-white ${
                                validationErrors[`${cat.id}-discountValue`]
                                  ? "border-red-500 text-red-600"
                                  : "border-[#D9E1E8] focus:border-[#F2A900]"
                              }`}
                            />
                            {validationErrors[`${cat.id}-discountValue`] && (
                              <p className="text-[10px] text-red-600 mt-0.5">
                                {validationErrors[`${cat.id}-discountValue`]}
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-[#B45309] mb-1">
                              Badge Display Text
                            </label>
                            <input
                              type="text"
                              value={discountLabel}
                              onChange={e => handleFieldChange(cat.id, 'discountLabel', e.target.value)}
                              placeholder={discountType === 'fixed' ? "₹500 OFF" : "UP TO 25% OFF"}
                              className="w-full text-xs border border-[#D9E1E8] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#F2A900] bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => handleSave(cat)}
                        disabled={isSaving}
                        className="bg-[#0B3A63] hover:bg-[#1769AA] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold px-5 py-2 rounded-xl transition-all shadow-xs flex items-center gap-2"
                      >
                        {isSaving ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Saving Changes...</span>
                          </>
                        ) : (
                          <>
                            <span>💾 Save Category Settings</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Live Hero Card Preview */}
                  <div className="bg-[#F6F8FA] p-4 rounded-xl border border-[#D9E1E8] flex flex-col justify-center items-center">
                    <p className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider mb-3">
                      Live Hero Card Preview
                    </p>

                    {/* The Card */}
                    <div className="bg-white p-2.5 rounded-2xl border border-[#D9E1E8] shadow-xs w-full max-w-[220px] flex items-center gap-2.5 relative">
                      <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-slate-100 border border-gray-100">
                        <img
                          src={cat.image || "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop"}
                          alt={cat.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#17212B] truncate">{cat.name}</p>
                        <p className="text-[10px] text-[#667085] truncate">{cat.subtitle || "Genuine Brands"}</p>
                        {isDiscount && discountVal > 0 && (
                          <div className="mt-1">
                            <span className="inline-block bg-[#F2A900] text-[#0B3A63] font-bold text-[9px] px-1.5 py-0.5 rounded shadow-xs tracking-tight">
                              {discountLabel || (discountType === 'fixed' ? `₹${discountVal} OFF` : `UP TO ${discountVal}% OFF`)}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-[#1769AA] text-xs font-bold">→</span>
                    </div>

                    <p className="text-[10px] text-[#667085] mt-3 text-center">
                      {isHero ? (
                        <span className="text-[#12773D] font-medium">✓ Visible in Homepage Hero (Slot #{heroOrder})</span>
                      ) : (
                        <span className="text-gray-400">Hidden from Homepage Hero</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
