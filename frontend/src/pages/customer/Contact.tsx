import { useState } from "react";
import { COMPANY_ADDRESS } from "../../constants/companyInfo";
import { inquiriesApi } from "../../api/inquiries";

export default function Contact() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name || !form.phone || !form.subject || !form.message) {
      setError("Please fill out all required fields.");
      return;
    }

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
      setError(err?.message || "Failed to submit message. Please check the details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-[#0B3A63] mb-2">Contact Us</h1>
      <p className="text-[#667085] text-sm mb-8">Get in touch with our team for product inquiries, bulk orders, or support.</p>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Info */}
        <div className="space-y-4">
          {[
            { icon: "📍", title: "Visit Us", lines: [COMPANY_ADDRESS] },
            { icon: "📞", title: "Call Us", lines: ["+91 8610359797", "+91 9443441058", "Mon–Sat: 9AM – 7PM"] },
            { icon: "✉️", title: "Email Us", lines: ["veepower.cbe@gmail.com"] },
          ].map(item => (
            <div key={item.title} className="bg-white border border-[#D9E1E8] rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <h3 className="font-semibold text-[#0B3A63] mb-1">{item.title}</h3>
                  {item.lines.map(line => <p key={line} className="text-sm text-[#667085]">{line}</p>)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="md:col-span-2 bg-white border border-[#D9E1E8] rounded-xl p-6 shadow-sm">
          {sent ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-[#0B3A63] mb-2">Message Sent!</h3>
              <p className="text-[#667085] text-sm">We'll get back to you within 24 hours.</p>
              <button onClick={() => setSent(false)} className="mt-4 text-[#1769AA] underline text-sm font-medium">Send another message</button>
            </div>
          ) : (
            <>
              <h2 className="font-bold text-[#0B3A63] text-lg mb-5">Send a Message</h2>
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 flex items-center gap-2">
                  <span>⚠️</span> {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Name *</label>
                    <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="Your full name" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Phone *</label>
                    <input required value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="your@email.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Subject *</label>
                  <select required value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] bg-white">
                    <option value="">Select subject</option>
                    <option>Product Inquiry</option>
                    <option>Bulk Order / Quote</option>
                    <option>Order Support</option>
                    <option>Technical Query</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Message *</label>
                  <textarea required rows={4} value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] resize-none" placeholder="Tell us how we can help..." />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send Message"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
