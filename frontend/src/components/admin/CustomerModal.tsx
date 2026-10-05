import { useState, useEffect } from "react";
import { X, User, Mail, Phone, Lock, MapPin, AlertCircle, Loader2 } from "lucide-react";
import { Customer, CustomerCreateInput, CustomerUpdateInput } from "../../types/api";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate: (data: CustomerCreateInput) => Promise<void>;
  onSubmitUpdate: (id: number, data: CustomerUpdateInput) => Promise<void>;
  initialCustomer?: Customer | null;
}

export default function CustomerModal({
  isOpen,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
  initialCustomer,
}: CustomerModalProps) {
  const isEditing = Boolean(initialCustomer);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    isActive: true,
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    addressType: "home" as "home" | "work" | "other",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setServerError(null);
      setFormErrors({});
      if (initialCustomer) {
        setFormData({
          firstName: initialCustomer.first_name || "",
          lastName: initialCustomer.last_name || "",
          email: initialCustomer.email || "",
          phone: initialCustomer.phone || "",
          password: "",
          isActive: initialCustomer.is_active,
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "",
          pincode: "",
          addressType: "home",
        });
      } else {
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          password: "",
          isActive: true,
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "",
          pincode: "",
          addressType: "home",
        });
      }
    }
  }, [isOpen, initialCustomer]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const validate = () => {
    const errors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      errors.firstName = "First name is required.";
    }

    if (!formData.email.trim()) {
      errors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    if (formData.phone.trim() && !/^\+?[0-9\s\-()]{7,20}$/.test(formData.phone.trim())) {
      errors.phone = "Please enter a valid phone number (min 7 digits).";
    }

    if (!isEditing && formData.password.trim() && formData.password.trim().length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    if (!isEditing && formData.pincode.trim() && !/^[1-9][0-9]{5}$/.test(formData.pincode.trim())) {
      errors.pincode = "PIN code must be a valid 6-digit Indian postal code.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerError(null);

    try {
      if (isEditing && initialCustomer) {
        await onSubmitUpdate(initialCustomer.id, {
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          is_active: formData.isActive,
        });
      } else {
        await onSubmitCreate({
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          password: formData.password.trim() || undefined,
          is_active: formData.isActive,
          address_line1: formData.addressLine1.trim() || undefined,
          address_line2: formData.addressLine2.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || undefined,
          pincode: formData.pincode.trim() || undefined,
          address_type: formData.addressType,
        });
      }
      onClose();
    } catch (err: any) {
      setServerError(err?.message || "Failed to save customer. Please verify input data.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto flex flex-col relative animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-modal-title"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0B3A63] text-white p-5 px-6 flex justify-between items-center z-10 rounded-t-2xl">
          <div>
            <h2 id="customer-modal-title" className="font-bold text-lg">
              {isEditing ? "Edit Customer Profile" : "Register New Customer"}
            </h2>
            <p className="text-xs text-white/80 mt-0.5">
              {isEditing 
                ? `Updating account details for ${initialCustomer?.name || initialCustomer?.email}` 
                : "Add an individual or corporate buyer account to Vee Power Electricals"}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            type="button"
            className="p-1.5 text-white/70 hover:bg-white/10 hover:text-white rounded-lg transition-colors focus:outline-hidden"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5" noValidate>
          {serverError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-semibold">Unable to save customer</p>
                <p className="mt-0.5">{serverError}</p>
              </div>
            </div>
          )}

          {/* Profile Details */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B3A63] mb-3 flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> Basic Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, firstName: e.target.value }));
                    if (formErrors.firstName) setFormErrors(prev => ({ ...prev, firstName: "" }));
                  }}
                  placeholder="e.g. Rajesh"
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border ${
                    formErrors.firstName ? "border-rose-400 bg-rose-50/30" : "border-slate-300"
                  } focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors`}
                />
                {formErrors.firstName && (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.firstName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="e.g. Kumar"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => {
                      setFormData(prev => ({ ...prev, email: e.target.value }));
                      if (formErrors.email) setFormErrors(prev => ({ ...prev, email: "" }));
                    }}
                    placeholder="customer@domain.com"
                    className={`w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border ${
                      formErrors.email ? "border-rose-400 bg-rose-50/30" : "border-slate-300"
                    } focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors`}
                  />
                </div>
                {formErrors.email && (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => {
                      setFormData(prev => ({ ...prev, phone: e.target.value }));
                      if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: "" }));
                    }}
                    placeholder="+91 9876543210"
                    className={`w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border ${
                      formErrors.phone ? "border-rose-400 bg-rose-50/30" : "border-slate-300"
                    } focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors`}
                  />
                </div>
                {formErrors.phone && (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.phone}</p>
                )}
              </div>
            </div>
          </div>

          {/* Account Password & Status */}
          <div className="pt-2 border-t border-slate-100">
            {!isEditing && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Temporary Password <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={formData.password}
                    onChange={e => {
                      setFormData(prev => ({ ...prev, password: e.target.value }));
                      if (formErrors.password) setFormErrors(prev => ({ ...prev, password: "" }));
                    }}
                    placeholder="Leave blank to auto-generate a secure key"
                    className={`w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border ${
                      formErrors.password ? "border-rose-400 bg-rose-50/30" : "border-slate-300"
                    } focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors`}
                  />
                </div>
                {formErrors.password ? (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.password}</p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    If omitted, the server generates a cryptographically secure random password.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <input
                id="is-active-toggle"
                type="checkbox"
                checked={formData.isActive}
                onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 text-[#0B3A63] rounded border-slate-300 focus:ring-[#0B3A63]"
              />
              <label htmlFor="is-active-toggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Account Active
                <span className="block text-[11px] text-slate-500 font-normal">
                  Active customers can log in, place orders, and manage saved addresses.
                </span>
              </label>
            </div>
          </div>

          {/* Optional Initial Address for New Customer */}
          {!isEditing && (
            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B3A63] mb-3 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> Initial Shipping Address <span className="text-slate-400 font-normal text-[11px]">(Optional)</span>
              </h3>
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={formData.addressLine1}
                    onChange={e => setFormData(prev => ({ ...prev, addressLine1: e.target.value }))}
                    placeholder="Address Line 1 (Street, Building, Flat No)"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="City (e.g. Coimbatore)"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="State (e.g. Tamil Nadu)"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={formData.pincode}
                      onChange={e => {
                        setFormData(prev => ({ ...prev, pincode: e.target.value }));
                        if (formErrors.pincode) setFormErrors(prev => ({ ...prev, pincode: "" }));
                      }}
                      placeholder="PIN (e.g. 641001)"
                      className={`w-full px-3.5 py-2 text-sm rounded-lg border ${
                        formErrors.pincode ? "border-rose-400 bg-rose-50/30" : "border-slate-300"
                      } focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors`}
                    />
                    {formErrors.pincode && (
                      <p className="text-xs text-rose-600 mt-1">{formErrors.pincode}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
                  <span>Address Type:</span>
                  {(['home', 'work', 'other'] as const).map(type => (
                    <label key={type} className="inline-flex items-center gap-1.5 cursor-pointer capitalize">
                      <input
                        type="radio"
                        name="addressType"
                        value={type}
                        checked={formData.addressType === type}
                        onChange={() => setFormData(prev => ({ ...prev, addressType: type }))}
                        className="text-[#0B3A63] focus:ring-[#0B3A63]"
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-[#0B3A63] bg-[#F2A900] hover:bg-[#d99800] rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                "Update Customer"
              ) : (
                "Create Customer"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
