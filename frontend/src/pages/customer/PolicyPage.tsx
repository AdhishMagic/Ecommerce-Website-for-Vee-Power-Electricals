import { useParams } from "react-router-dom";

const policies: Record<string, { title: string; sections: { heading: string; content: string }[] }> = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      { heading: "Information We Collect", content: "We collect information you provide when placing orders, creating an account, or contacting us. This includes your name, address, phone number, email address, and payment information." },
      { heading: "How We Use Your Information", content: "We use your information to process and fulfill orders, send order confirmations and updates, respond to your inquiries, and improve our services. We do not sell your personal information to third parties." },
      { heading: "Data Security", content: "We implement appropriate security measures to protect your personal information. Payment transactions are encrypted using SSL technology." },
      { heading: "Contact Us", content: "If you have questions about this Privacy Policy, contact us at veepower.cbe@gmail.com or call +91 8610359797." },
    ],
  },
  terms: {
    title: "Terms & Conditions",
    sections: [
      { heading: "Acceptance of Terms", content: "By using this website, you agree to these terms and conditions. If you do not agree, please do not use this site." },
      { heading: "Product Information", content: "We strive to provide accurate product information, including descriptions, specifications, and prices. Prices are subject to change without notice." },
      { heading: "Orders", content: "Placing an order constitutes a binding offer to purchase. We reserve the right to cancel orders due to pricing errors, out-of-stock situations, or suspected fraud." },
      { heading: "Governing Law", content: "These terms are governed by the laws of Tamil Nadu, India. Any disputes shall be subject to the exclusive jurisdiction of courts in Coimbatore." },
    ],
  },
  shipping: {
    title: "Shipping Policy",
    sections: [
      { heading: "Delivery Area", content: "We currently deliver across Tamil Nadu. Pan-India shipping is available for select products. Please contact us for delivery to other states." },
      { heading: "Delivery Time", content: "Standard delivery: 3–5 business days within Coimbatore and nearby areas. Other Tamil Nadu locations: 5–7 business days. Delivery times may vary during peak seasons." },
      { heading: "Shipping Charges", content: "Free shipping on orders above ₹999. Orders below ₹999: ₹99 shipping charge. Bulk and heavy items may have additional charges." },
      { heading: "Order Tracking", content: "Once dispatched, you'll receive an SMS/email with your tracking number. Track your order in the 'My Orders' section of your account." },
    ],
  },
  returns: {
    title: "Return & Cancellation Policy",
    sections: [
      { heading: "Return Policy", content: "We accept returns within 7 days of delivery for defective or incorrect products. Products must be unused, in original packaging with all accessories and invoice." },
      { heading: "Non-Returnable Items", content: "Electrical components once installed cannot be returned. Customised or special-order products are non-returnable unless defective." },
      { heading: "Cancellation", content: "Orders can be cancelled before dispatch. Once dispatched, cancellation is not possible — please initiate a return after delivery." },
      { heading: "Refunds", content: "Approved refunds are processed within 5–7 business days to the original payment method. UPI/card refunds may take 3–5 additional banking days." },
    ],
  },
};

export default function PolicyPage() {
  const { type } = useParams<{ type: string }>();
  const policy = policies[type || ""];

  if (!policy) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h2 className="text-2xl font-bold text-[#0B3A63]">Page not found</h2>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="bg-white border border-[#D9E1E8] rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#0B3A63] to-[#1769AA] px-8 py-8 text-white">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Outfit" }}>{policy.title}</h1>
          <p className="text-white/70 text-sm mt-1">Vee Electricals · Last updated: December 2024</p>
        </div>
        <div className="p-8 space-y-6">
          {policy.sections.map(section => (
            <div key={section.heading}>
              <h2 className="text-lg font-bold text-[#0B3A63] mb-2">{section.heading}</h2>
              <p className="text-[#667085] text-sm leading-relaxed">{section.content}</p>
            </div>
          ))}
          <div className="mt-8 pt-6 border-t border-[#D9E1E8] text-sm text-[#667085]">
            <p>For any questions, contact us at <a href="mailto:veepower.cbe@gmail.com" className="text-[#1769AA]">veepower.cbe@gmail.com</a> or call <a href="tel:+918610359797" className="text-[#1769AA]">+91 8610359797</a>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
