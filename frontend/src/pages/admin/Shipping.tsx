import { useState, useEffect } from "react";
import { Plus, Trash2, Save, Truck, CheckCircle2, AlertCircle } from "lucide-react";
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
  const [baseDeliveryCharge, setBaseDeliveryCharge] = useState<number>(99);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(3999);
  const [freeDeliveryEnabled, setFreeDeliveryEnabled] = useState<boolean>(true);
  const [rules, setRules] = useState<ShippingRule[]>([]);
  const [newState, setNewState] = useState<string>("");
  const [newCost, setNewCost] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadShippingConfig = async () => {
    setLoading(true);
    try {
      const [configs, backendRules] = await Promise.all([
        configApi.getDeliveryConfig().catch(() => []),
        configApi.getShippingRules().catch(() => []),
      ]);

      const active = Array.isArray(configs) && configs.length > 0 ? configs[0] : null;
      if (active) {
        setConfigId(active.id);
        setBaseDeliveryCharge(Number(active.base_delivery_charge ?? 99));
        setFreeShippingThreshold(Number(active.free_delivery_threshold ?? 3999));
        setFreeDeliveryEnabled(active.free_delivery_enabled !== false);
      }

      if (Array.isArray(backendRules)) {
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

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setStatusMessage(null);
    try {
      const payload = {
        base_delivery_charge: baseDeliveryCharge,
        fallback_regional_rate: baseDeliveryCharge,
        free_delivery_threshold: freeShippingThreshold,
        free_delivery_enabled: freeDeliveryEnabled,
        is_active: true,
      };

      if (configId) {
        await configApi.updateDeliveryConfig(configId, payload);
      } else {
        const created = await configApi.createDeliveryConfig(payload);
        setConfigId(created.id);
      }

      setStatusMessage({
        type: 'success',
        text: `Shipping settings saved! Base Delivery: ₹${baseDeliveryCharge} | Free shipping above: ₹${freeShippingThreshold}`,
      });
      await loadShippingConfig();
    } catch (err: any) {
      console.error("Failed to update delivery config:", err);
      setStatusMessage({
        type: 'error',
        text: err?.message || "Failed to update shipping configuration. Please check your network or try again.",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddRule = async () => {
    if (!newState || !newCost) return;
    
    // Check if state already exists
    if (rules.some(r => r.state.toLowerCase() === newState.toLowerCase())) {
      alert(`A rule for "${newState}" already exists! Remove the existing rule first to change its cost.`);
      return;
    }

    setAddingRule(true);
    setStatusMessage(null);
    try {
      const res = await configApi.createShippingRule({
        state: newState,
        cost: Number(newCost),
        is_active: true,
      });
      setRules(prev => [...prev, { id: String(res.id), state: res.state || newState, cost: Number(res.cost || newCost) }]);
      setNewState("");
      setNewCost("");
      setStatusMessage({
        type: 'success',
        text: `Added shipping rule for ${newState}: ₹${newCost}`,
      });
    } catch (err: any) {
      console.error("Failed to create shipping rule:", err);
      setStatusMessage({
        type: 'error',
        text: err?.message || "Failed to save state rule to server.",
      });
    } finally {
      setAddingRule(false);
    }
  };

  const handleRemoveRule = async (id: string, stateName: string) => {
    setStatusMessage(null);
    try {
      await configApi.deleteShippingRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      setStatusMessage({
        type: 'success',
        text: `Removed shipping rule for ${stateName}`,
      });
    } catch (err: any) {
      console.error("Failed to delete shipping rule:", err);
      setStatusMessage({
        type: 'error',
        text: err?.message || "Failed to delete rule from server.",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3A63] font-['Outfit']">Shipping & Delivery Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Configure standard shipping charges, free shipping thresholds, and state-specific rates.</p>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm animate-in fade-in duration-150 ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <p className="font-medium">{statusMessage.text}</p>
          </div>
          <button 
            type="button" 
            onClick={() => setStatusMessage(null)}
            className="text-xs p-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form Controls */}
        <div className="space-y-6 md:col-span-1">
          {/* General Delivery & Free Shipping Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-full bg-[#0B3A63]/10 flex items-center justify-center text-[#0B3A63]">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-[#0B3A63] text-base font-['Outfit']">Delivery Charges</h2>
                <p className="text-xs text-slate-400">Default base and free delivery</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Standard Delivery Charge (₹)
              </label>
              <input 
                type="number"
                min="0"
                value={baseDeliveryCharge}
                onChange={(e) => setBaseDeliveryCharge(Math.max(0, Number(e.target.value)))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm font-semibold"
                placeholder="e.g. 99"
              />
              <p className="text-xs text-slate-500 mt-1">Charged on orders below the free shipping threshold.</p>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Free Shipping Threshold (₹)
              </label>
              <input 
                type="number"
                min="0"
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(Math.max(0, Number(e.target.value)))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm font-semibold"
                placeholder="e.g. 3999"
              />
              <p className="text-xs text-slate-500 mt-1">Orders with subtotal above this get ₹0 free shipping.</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input 
                type="checkbox"
                id="freeDeliveryEnabledCheck"
                checked={freeDeliveryEnabled}
                onChange={(e) => setFreeDeliveryEnabled(e.target.checked)}
                className="w-4 h-4 text-[#0B3A63] accent-[#0B3A63] rounded cursor-pointer"
              />
              <label htmlFor="freeDeliveryEnabledCheck" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                Enable Free Shipping Threshold
              </label>
            </div>

            <button 
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0B3A63] hover:bg-[#17212B] text-white text-sm font-bold rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {savingSettings ? "Saving Settings..." : "Save Shipping Charges"}
            </button>
          </div>

          {/* Add State Rule Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-bold text-[#0B3A63] mb-4 text-base font-['Outfit']">Add State Rule</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Select State</label>
                <select 
                  value={newState}
                  onChange={(e) => setNewState(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm bg-white"
                >
                  <option value="">-- Choose a state --</option>
                  {INDIAN_STATES.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Delivery Cost (₹)</label>
                <input 
                  type="number" 
                  min="0"
                  placeholder="e.g. 150"
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm"
                />
              </div>
              <button 
                type="button"
                onClick={handleAddRule}
                disabled={!newState || !newCost || addingRule}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F2A900] hover:bg-[#D4920A] text-[#0A2540] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {addingRule ? "Adding..." : "+ Add Rule"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Rules Table */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#0B3A63] text-base font-['Outfit']">State Shipping Rules</h2>
                <p className="text-xs text-slate-500 mt-0.5">State-specific delivery costs applied when an order does not qualify for free shipping.</p>
              </div>
              <span className="text-xs font-bold text-[#1769AA] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                {rules.length} {rules.length === 1 ? 'Rule' : 'Rules'} Active
              </span>
            </div>
            
            <div className="flex-1 overflow-x-auto">
              {rules.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Truck className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="font-semibold text-slate-600 text-sm">No state-specific rules configured</p>
                  <p className="text-xs text-slate-400 mt-1">All states will automatically use the standard base delivery charge of ₹{baseDeliveryCharge}.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">State</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Delivery Cost</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map(rule => (
                      <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 text-sm font-semibold text-[#0B3A63]">{rule.state}</td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-800 text-right">
                          ₹{rule.cost}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button 
                            type="button"
                            onClick={() => handleRemoveRule(rule.id, rule.state)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex cursor-pointer"
                            title={`Delete rule for ${rule.state}`}
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
