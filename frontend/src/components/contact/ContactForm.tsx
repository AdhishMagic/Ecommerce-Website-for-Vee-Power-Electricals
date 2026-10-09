import { useState } from "react";
import { inquiriesApi } from "../../api/inquiries";

interface FormState {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
  general?: string;
}

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const validate = (): boolean => {
    const errs: FormErrors = {};

    if (!form.name.trim()) {
      errs.name = "Full name is required.";
    }

    if (!form.phone.trim()) {
      errs.phone = "Phone number is required.";
    } else if (form.phone.trim().length < 8) {
      errs.phone = "Please enter a valid phone number.";
    }

    if (form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        errs.email = "Please enter a valid email address.";
      }
    }

    if (!form.subject) {
      errs.subject = "Please select a subject for your enquiry.";
    }

    if (!form.message.trim()) {
      errs.message = "Message content is required.";
    } else if (form.message.trim().length < 5) {
      errs.message = "Please provide more details in your message.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!validate()) return;

    setLoading(true);

    try {
      await inquiriesApi.submitInquiry({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        subject: form.subject,
        message: form.message.trim(),
      });

      setSent(true);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err: any) {
      console.error("Failed to submit inquiry:", err);
      setErrors({
        general: err?.message || "Failed to submit message. Please verify details and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 sm:p-12 text-center shadow-xs animate-fadeIn">
        <div className="w-16 h-16 bg-[#ECFDF5] border border-[#A7F3D0] rounded-full flex items-center justify-center text-[#12773D] text-3xl mx-auto mb-4">
          ✓
        </div>
        <h3
          className="text-2xl font-extrabold text-[#0B3A63] mb-2"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Message Submitted Successfully!
        </h3>
        <p className="text-slate-600 text-sm sm:text-base max-w-md mx-auto mb-6">
          Thank you for reaching out to Vee Power Electricals. Our support team will get back to you within 24 business hours.
        </p>
        <button
          onClick={() => setSent(false)}
          className="px-6 py-2.5 bg-[#0B3A63] text-white text-sm font-semibold rounded-xl hover:bg-[#1769AA] transition-colors shadow-2xs"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-xs">
      <h2
        className="text-xl sm:text-2xl font-extrabold text-[#0B3A63] mb-6"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        Send a Message
      </h2>

      {errors.general && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm mb-6 flex items-start gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <span>{errors.general}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Row 1: Name and Phone */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-name" className="block text-xs font-bold text-[#17212B] uppercase tracking-wider mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="contact-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Your full name"
              aria-invalid={Boolean(errors.name)}
              className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm text-[#17212B] placeholder-slate-400 outline-none focus:bg-white transition-all ${
                errors.name
                  ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  : "border-[#CBD5E1] focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20"
              }`}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1 font-medium">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="contact-phone" className="block text-xs font-bold text-[#17212B] uppercase tracking-wider mb-1.5">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              id="contact-phone"
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91 98765 43210"
              aria-invalid={Boolean(errors.phone)}
              className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm text-[#17212B] placeholder-slate-400 outline-none focus:bg-white transition-all ${
                errors.phone
                  ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  : "border-[#CBD5E1] focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20"
              }`}
            />
            {errors.phone && <p className="text-xs text-red-600 mt-1 font-medium">{errors.phone}</p>}
          </div>
        </div>

        {/* Row 2: Email (Optional) */}
        <div>
          <label htmlFor="contact-email" className="block text-xs font-bold text-[#17212B] uppercase tracking-wider mb-1.5">
            Email Address <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            id="contact-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="your@email.com"
            aria-invalid={Boolean(errors.email)}
            className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm text-[#17212B] placeholder-slate-400 outline-none focus:bg-white transition-all ${
              errors.email
                ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-[#CBD5E1] focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20"
            }`}
          />
          {errors.email && <p className="text-xs text-red-600 mt-1 font-medium">{errors.email}</p>}
        </div>

        {/* Row 3: Subject */}
        <div>
          <label htmlFor="contact-subject" className="block text-xs font-bold text-[#17212B] uppercase tracking-wider mb-1.5">
            Subject <span className="text-red-500">*</span>
          </label>
          <select
            id="contact-subject"
            required
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            aria-invalid={Boolean(errors.subject)}
            className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm text-[#17212B] outline-none focus:bg-white cursor-pointer transition-all ${
              errors.subject
                ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-[#CBD5E1] focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20"
            }`}
          >
            <option value="">Select subject option</option>
            <option value="Product Inquiry">Product Inquiry</option>
            <option value="Bulk Order / Quote">Bulk Order / Quote</option>
            <option value="Order Support">Order Support</option>
            <option value="Technical Query">Technical Query</option>
            <option value="Other">Other</option>
          </select>
          {errors.subject && <p className="text-xs text-red-600 mt-1 font-medium">{errors.subject}</p>}
        </div>

        {/* Row 4: Message */}
        <div>
          <label htmlFor="contact-message" className="block text-xs font-bold text-[#17212B] uppercase tracking-wider mb-1.5">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            id="contact-message"
            required
            rows={4}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Tell us how we can help with your electrical requirements..."
            aria-invalid={Boolean(errors.message)}
            className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm text-[#17212B] placeholder-slate-400 outline-none focus:bg-white resize-none transition-all ${
              errors.message
                ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-[#CBD5E1] focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20"
            }`}
          />
          {errors.message && <p className="text-xs text-red-600 mt-1 font-medium">{errors.message}</p>}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-6 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-bold text-sm rounded-xl transition-all duration-200 shadow-2xs hover:shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Sending Message...</span>
            </>
          ) : (
            <span>Send Message</span>
          )}
        </button>
      </form>
    </div>
  );
}
