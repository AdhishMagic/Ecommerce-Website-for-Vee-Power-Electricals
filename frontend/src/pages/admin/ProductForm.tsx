import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ProductForm() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("basic");
  const [specs, setSpecs] = useState([{ key: "", value: "" }]);
  const [saved, setSaved] = useState(false);

  const sections = [
    { id: "basic", label: "Basic Info" },
    { id: "pricing", label: "Pricing" },
    { id: "inventory", label: "Inventory" },
    { id: "images", label: "Images" },
    { id: "specs", label: "Specifications" },
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate("/admin/products"); }, 1500);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/admin/products")} className="text-[#667085] hover:text-[#17212B]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <h1 className="text-xl font-bold text-[#0B3A63]">Add New Product</h1>
      </div>

      <form onSubmit={handleSave}>
        <div className="grid lg:grid-cols-4 gap-5">
          {/* Section nav */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-3 sticky top-4">
              {sections.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors ${activeSection === s.id ? "bg-[#EFF6FF] text-[#1769AA] font-medium" : "text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA]"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form content */}
          <div className="lg:col-span-3 space-y-5">
            {activeSection === "basic" && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Basic Information</h2>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Product Name *</label>
                    <input required className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="e.g. Havells Stealth 1200mm Ceiling Fan" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Brand *</label>
                      <select required className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] bg-white">
                        <option value="">Select Brand</option>
                        {["Havells", "Finolex", "Crompton", "Anchor", "Jaquar", "Khaitan", "Legrand", "Polycab", "Philips", "Gloster"].map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Category *</label>
                      <select required className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] bg-white">
                        <option value="">Select Category</option>
                        {["Fans", "Wires & Cables", "Switches", "LED & Lighting", "MCB & Protection", "Accessories"].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">SKU *</label>
                    <input required className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] font-mono" placeholder="e.g. HVL-CF-STL-1200" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Description</label>
                    <textarea rows={4} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] resize-none" placeholder="Detailed product description..." />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "pricing" && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Pricing</h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { label: "MRP (₹) *", placeholder: "3850" },
                    { label: "Selling Price (₹) *", placeholder: "3199" },
                    { label: "Tax Rate (%)", placeholder: "18" },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">{f.label}</label>
                      <input type="number" className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder={f.placeholder} />
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-[#F6F8FA] rounded-lg">
                  <p className="text-sm text-[#667085]">Discount will be automatically calculated from MRP and Selling Price.</p>
                </div>
              </div>
            )}

            {activeSection === "inventory" && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Inventory</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Current Stock *</label>
                    <input type="number" className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="0" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Low Stock Threshold</label>
                    <input type="number" className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="5" />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "images" && (
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <h2 className="font-bold text-[#0B3A63] mb-5">Product Images</h2>
                <div className="border-2 border-dashed border-[#D9E1E8] rounded-xl p-10 text-center hover:border-[#1769AA] transition-colors">
                  <div className="text-4xl mb-3">📷</div>
                  <p className="font-medium text-[#17212B] mb-1">Drop images here or click to upload</p>
                  <p className="text-sm text-[#667085]">PNG, JPG up to 5MB. First image will be the main product image.</p>
                  <button type="button" className="mt-4 bg-[#0B3A63] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#1769AA] transition-colors">
                    Choose Files
                  </button>
                </div>
              </div>
            )}

            {activeSection === "specs" && (
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

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                className={`flex-1 py-3 font-semibold rounded-lg transition-colors ${saved ? "bg-[#12773D] text-white" : "bg-[#0B3A63] hover:bg-[#1769AA] text-white"}`}
              >
                {saved ? "✓ Product Saved!" : "Save Product"}
              </button>
              <button type="button" onClick={() => navigate("/admin/products")} className="px-5 py-3 border border-[#D9E1E8] rounded-lg text-sm text-[#667085] hover:text-[#17212B]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
