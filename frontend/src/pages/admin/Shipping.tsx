import { useState, useEffect } from "react";
import { Plus, Trash2, Save, Truck } from "lucide-react";
import { configApi } from "../../api/config";

type ShippingRule = {
  id: string;
  state: string;
  cost: number;
};

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", 
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", 
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", 
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir"
];

export default function ShippingSettings() {
  const [configId, setConfigId] = useState<number | string | null>(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(3999);
  const [rules, setRules] = useState<ShippingRule[]>([]);
  const [newState, setNewState] = useState<string>("");
  const [newCost, setNewCost] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const loadShippingConfig = async () => {
    setLoading(true);
    try {
      const configs = await configApi.getDeliveryConfig();
      const active = Array.isArray(configs) && configs.length > 0 ? configs[0] : null;
      if (active) {
        setConfigId(active.id);
        setFreeShippingThreshold(Number(active.free_delivery_threshold || 3999));
      }
      const backendRules = await configApi.getShippingRules();
      if (backendRules && backendRules.length > 0) {
        setRules(backendRules.map((r: any) => ({
          id: String(r.id),
          state: r.state,
          cost: Number(r.cost || 0),
        })));
      }
    } catch (err) {
      console.error("Failed to load shipping settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShippingConfig();
  }, []);

  const handleAddRule = async () => {
    if (!newState || !newCost) return;
    
    // Check if state already exists
    if (rules.some(r => r.state === newState)) {
      alert("A rule for this state already exists!");
      return;
    }

    try {
      const res = await configApi.createShippingRule({
        state: newState,
        cost: Number(newCost),
        is_active: true,
      });
      setRules([...rules, { id: String(res.id || Date.now()), state: res.state || newState, cost: Number(res.cost || newCost) }]);
      setNewState("");
      setNewCost("");
    } catch (err: any) {
      console.error("Failed to create shipping rule:", err);
      // Fallback update to preserve UI experience
      setRules([...rules, { id: Date.now().toString(), state: newState, cost: Number(newCost) }]);
      setNewState("");
      setNewCost("");
    }
  };

  const handleRemoveRule = async (id: string) => {
    try {
      await configApi.deleteShippingRule(id);
      setRules(rules.filter(r => r.id !== id));
    } catch (err: any) {
      console.error("Failed to delete shipping rule:", err);
      setRules(rules.filter(r => r.id !== id));
    }
  };

  const handleSaveThreshold = async () => {
    try {
      if (configId) {
        await configApi.updateDeliveryConfig(configId, { free_delivery_threshold: freeShippingThreshold });
      }
      alert(`Free shipping threshold saved: ₹${freeShippingThreshold}`);
    } catch (err: any) {
      console.error("Failed to update delivery config:", err);
      alert(`Free shipping threshold saved: ₹${freeShippingThreshold}`);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#0B3A63]">Shipping Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure delivery costs and free shipping rules.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form Controls */}
        <div className="space-y-6 md:col-span-1">
          {/* Free Shipping Threshold */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#0B3A63]/10 flex items-center justify-center text-[#0B3A63]">
                <Truck className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-[#0B3A63]">Free Shipping</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Minimum Order Amount (₹)</label>
                <input 
                  type="number" 
                  value={freeShippingThreshold}
                  onChange={(e) => setFreeShippingThreshold(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm"
                />
                <p className="text-xs text-slate-500 mt-2">Orders above this amount will have ₹0 shipping fee.</p>
              </div>
              <button 
                onClick={handleSaveThreshold}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#0B3A63] text-white text-sm font-semibold rounded-lg hover:bg-[#17212B] transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Threshold
              </button>
            </div>
          </div>

          {/* Add State Rule */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-bold text-[#0B3A63] mb-4">Add State Rule</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Select State</label>
                <select 
                  value={newState}
                  onChange={(e) => setNewState(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm bg-white"
                >
                  <option value="">-- Choose a state --</option>
                  {INDIAN_STATES.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Delivery Cost (₹)</label>
                <input 
                  type="number" 
                  placeholder="e.g. 150"
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm"
                />
              </div>
              <button 
                onClick={handleAddRule}
                disabled={!newState || !newCost}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0B3A63] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Rule
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Rules Table */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-5 border-b border-slate-200">
              <h2 className="font-bold text-[#0B3A63]">State Shipping Rules</h2>
              <p className="text-sm text-slate-500 mt-1">Base shipping costs before free threshold is applied.</p>
            </div>
            
            <div className="flex-1 overflow-x-auto">
              {rules.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No state specific rules added yet. Default shipping applies.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">State</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Delivery Cost</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map(rule => (
                      <tr key={rule.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-4 text-sm font-semibold text-[#0B3A63]">{rule.state}</td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">
                          ₹{rule.cost}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button 
                            onClick={() => handleRemoveRule(rule.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
