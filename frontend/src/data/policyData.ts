import { COMPANY_NAME, COMPANY_ADDRESS } from "../constants/companyInfo";

export interface PolicySection {
  id: string;
  title: string;
  badge?: string;
  paragraphs?: string[];
  bulletPoints?: string[];
  callout?: {
    type: "info" | "warning" | "note";
    text: string;
  };
}

export interface PolicyData {
  slug: string;
  title: string;
  shortTitle: string;
  metaDescription: string;
  summary: string;
  lastReviewed: string;
  sections: PolicySection[];
  relatedPolicies: { title: string; slug: string }[];
}

export const POLICIES: Record<string, PolicyData> = {
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    shortTitle: "Privacy",
    metaDescription: "Learn how Vee Power Electricals collects, uses, protects, and handles your personal and order data in compliance with Indian privacy standards.",
    summary: `At ${COMPANY_NAME}, we are committed to safeguarding the privacy and security of your personal data. This Privacy Policy transparently explains what information we collect when you browse our website, create an account, purchase electrical products, or contact our team, how your data is processed, and your rights under applicable Indian privacy regulations.`,
    lastReviewed: "April 2026",
    relatedPolicies: [
      { title: "Terms & Conditions", slug: "terms" },
      { title: "Shipping Policy", slug: "shipping" },
      { title: "Return & Cancellation", slug: "returns" },
    ],
    sections: [
      {
        id: "information-we-collect",
        title: "1. Information We Collect",
        paragraphs: [
          "We collect only the information necessary to provide you with secure e-commerce services, fulfill your electrical product orders, and communicate order progress.",
        ],
        bulletPoints: [
          "Account & Profile Information: Full name, email address, mobile phone number, and encrypted password hash when you register.",
          "Delivery & Address Information: Recipient name, contact phone, delivery address lines, landmarks, city, state, and postal PIN code saved in your address book.",
          "Commercial & B2B Billing Data: Business company name and statutory Goods and Services Tax Identification Number (GSTIN) when you request B2B tax invoices.",
          "Order & Transaction Records: Products ordered, quantities, prices, order IDs, fulfillment status, shipping tracking numbers, and order timestamps.",
          "Inquiries & Support Communications: Messages, inquiries, or quotation requests submitted through our contact forms or direct communications.",
        ],
      },
      {
        id: "payment-information",
        title: "2. Payment Information Security",
        paragraphs: [
          "We prioritize financial transaction security. All online payments on our platform are processed directly by certified, PCI-DSS compliant third-party payment gateways (supporting UPI, Net Banking, Credit/Debit cards).",
        ],
        callout: {
          type: "info",
          text: `${COMPANY_NAME} does NOT capture, process, or store sensitive payment credentials—such as credit/debit card numbers, CVV codes, UPI PINs, or net banking passwords—on our servers at any point.`,
        },
      },
      {
        id: "how-we-use-information",
        title: "3. How We Use Your Information",
        paragraphs: [
          "The information we collect is strictly utilized for legitimate business and fulfillment purposes:",
        ],
        bulletPoints: [
          "Processing, packaging, and dispatching your orders from our Coimbatore distribution hub.",
          "Generating statutory GST-compliant tax invoices, e-way bills, and delivery challans.",
          "Sending automated order confirmations, dispatch notifications, invoice copies, and live shipment tracking links via email and SMS.",
          "Responding promptly to customer service inquiries, quotation requests, and technical product assistance.",
          "Preventing fraudulent transactions and ensuring the security of customer accounts.",
        ],
        callout: {
          type: "note",
          text: "We do not sell, rent, lease, or monetize your personal information to third-party advertisers or data brokers under any circumstances.",
        },
      },
      {
        id: "information-sharing",
        title: "4. Information Sharing & Third Parties",
        paragraphs: [
          "We share your data only with verified operational partners strictly to the extent required to complete your transactions:",
        ],
        bulletPoints: [
          "Logistics & Courier Partners: Delivery recipient name, phone number, destination address, and parcel dimensions are shared with courier and cargo transport carriers solely to complete physical transit and delivery.",
          "Authorized Payment Processors: Transaction identifiers and order totals are transmitted securely to payment gateways to authorize and verify settlements or refunds.",
          "Statutory & Legal Requirements: We may disclose transaction records to Indian tax authorities (e.g., GST portal filings) or law enforcement agencies when strictly mandated by applicable laws or court orders.",
        ],
      },
      {
        id: "cookies-and-storage",
        title: "5. Cookies & Local Storage",
        paragraphs: [
          "We use modern client-side storage (session tokens and local storage) strictly for essential site functionality:",
        ],
        bulletPoints: [
          "Session & Authentication: Storing authentication tokens to keep you logged in securely across page visits.",
          "Shopping Cart Persistence: Remembering items placed in your shopping cart so your selections are preserved as you browse.",
          "We do not employ invasive third-party tracking scripts or cross-site behavioral tracking cookies.",
        ],
      },
      {
        id: "data-retention-rights",
        title: "6. Data Retention & Your Rights",
        paragraphs: [
          "We retain your account details as long as your account remains active. Commercial order records, invoices, and payment confirmations are preserved for statutory durations as required by Indian accounting and taxation laws (typically 6 to 8 financial years for GST documentation).",
          "You have the right to review, update, or correct your personal profile information at any time through your Customer Dashboard. If you wish to close your account or request data correction, you may reach out to our support team.",
        ],
      },
      {
        id: "privacy-contact",
        title: "7. Contact Us Regarding Privacy",
        paragraphs: [
          `For any questions, clarifications, or requests concerning this Privacy Policy or how your data is handled, please contact our team at:`,
          `${COMPANY_NAME}\nAttn: Customer Privacy & Support\nAddress: ${COMPANY_ADDRESS}\nGST No: 33CKXPK4525R1Z9\nEmail: veepower.cbe@gmail.com\nPhone: +91 8610359797 / +91 9443441058\nWorking Hours: Monday – Saturday: 9:00 AM – 7:00 PM IST`,
        ],
      },
    ],
  },

  terms: {
    slug: "terms",
    title: "Terms & Conditions",
    shortTitle: "Terms",
    metaDescription: "Read the terms of service governing website usage, orders, pricing, warranties, and dispute resolution at Vee Power Electricals.",
    summary: `These Terms and Conditions govern your access to and use of the ${COMPANY_NAME} website, online store, and commercial transactions. By accessing our platform or purchasing electrical products from us, you agree to be bound by these terms in accordance with applicable laws in India.`,
    lastReviewed: "April 2026",
    relatedPolicies: [
      { title: "Privacy Policy", slug: "privacy" },
      { title: "Shipping Policy", slug: "shipping" },
      { title: "Return & Cancellation", slug: "returns" },
    ],
    sections: [
      {
        id: "acceptance-eligibility",
        title: "1. Acceptance of Terms & Eligibility",
        paragraphs: [
          `By browsing this website, creating an account, or placing an order with ${COMPANY_NAME}, you represent and warrant that you are at least 18 years of age and legally competent to enter into a binding contract under the Indian Contract Act, 1872.`,
          "If you are ordering on behalf of a registered company, electrical contracting firm, or commercial enterprise, you confirm that you have the requisite authority to bind that entity to these terms.",
        ],
      },
      {
        id: "account-responsibility",
        title: "2. Customer Account & Security",
        paragraphs: [
          "You are responsible for maintaining the confidentiality of your login credentials and password, and for restricting unauthorized access to your devices. You agree to accept responsibility for all activities that occur under your account.",
          "Please inform us immediately if you suspect unauthorized use of your account so we can take protective security measures.",
        ],
      },
      {
        id: "product-info-pricing",
        title: "3. Product Descriptions, Pricing & Availability",
        paragraphs: [
          `${COMPANY_NAME} is an authorized distributor and dealer for premium electrical brands including Havells, Finolex, Crompton, Polycab, Legrand, Anchor, Philips, and other leading manufacturers. We supply 100% genuine products with manufacturer warranty support.`,
        ],
        bulletPoints: [
          "Product Specifications: Technical parameters (voltage ratings, breaking capacity, cable conductor grade, lumens) are sourced directly from manufacturer specifications. Minor visual variations in product packaging may occur due to manufacturer updates.",
          "Pricing: All prices are listed in Indian Rupees (INR) and clearly indicate applicable statutory GST taxes.",
          "Price Changes & Errors: Prices are subject to market adjustments without prior notice. In the rare event of a genuine typographical or system pricing error, we reserve the right to cancel the affected order prior to dispatch with a prompt, complete refund.",
          "Stock Availability: Stock availability is updated in real time. In the event an item becomes temporarily out of stock after order receipt, our support team will promptly notify you with an estimated dispatch timeline or full cancellation option.",
        ],
      },
      {
        id: "orders-and-contracts",
        title: "4. Ordering & Order Confirmation",
        paragraphs: [
          "Placing an order constitutes a binding commercial offer to purchase selected goods. An automated order receipt acknowledgement does not constitute final legal acceptance; our contract is finalized when the order is confirmed, packed, and released for dispatch.",
          "For bulk electrical procurement, custom contractor quotes, and institutional supply orders, separate offline purchase orders (POs) and proforma invoices may apply with agreed commercial payment terms.",
        ],
      },
      {
        id: "payment-processing",
        title: "5. Payment Terms & Invoicing",
        paragraphs: [
          "We offer multiple verified payment avenues including UPI, Debit/Credit Cards, Net Banking, and Cash on Delivery (where eligible for parcel orders).",
          "Every order placed with us is accompanied by an authoritative, GST-compliant tax invoice. B2B buyers must supply a valid 15-character GSTIN at checkout to receive an input tax credit (ITC) invoice.",
        ],
      },
      {
        id: "shipping-delivery",
        title: "6. Shipping & Delivery Terms",
        paragraphs: [
          "Orders are dispatched from our central Coimbatore distribution facility and delivered across India through reputable logistics carriers.",
          "Estimated transit times are delivery estimates and may vary due to destination PIN code accessibility, weather conditions, or local courier operational constraints.",
          "Full details regarding delivery tariffs, free shipping thresholds, and tracking are detailed in our dedicated Shipping Policy.",
        ],
      },
      {
        id: "cancellation-returns",
        title: "7. Cancellations, Returns & Refunds",
        paragraphs: [
          "Order cancellations are accepted prior to consignment dispatch without penalty. Once an order is dispatched and in transit, cancellations cannot be processed mid-route, and standard return procedures apply.",
          "Eligible returns for defective, damaged, or incorrect products are processed in accordance with our Return & Cancellation Policy within the specified inspection window.",
        ],
      },
      {
        id: "manufacturer-warranty",
        title: "8. Product Warranty & Service",
        paragraphs: [
          "All branded electrical products (fans, luminaires, MCBs, switchgear, pumps) sold by us carry standard warranty coverage provided directly by their respective manufacturers.",
        ],
        bulletPoints: [
          "Warranty claims, in-warranty repair servicing, and replacement of defective components are handled directly by the authorized brand service centers across India.",
          `${COMPANY_NAME} assists customers by issuing authentic GST tax invoices, which serve as proof of purchase required for all manufacturer warranty claims.`,
          "Damages caused by improper installation, improper wiring, voltage surges, unauthorized tampering, or normal wear and tear are not covered under manufacturer warranty.",
        ],
      },
      {
        id: "intellectual-property",
        title: "9. Intellectual Property",
        paragraphs: [
          `All brand trademarks, trade names, manufacturer logos (such as Havells, Finolex, Crompton, Polycab, etc.) displayed on this website belong to their respective proprietary brand owners. Website design, UI, curated catalog data, and brand assets of ${COMPANY_NAME} are protected under applicable Indian copyright and intellectual property laws.`,
        ],
      },
      {
        id: "governing-law-jurisdiction",
        title: "10. Governing Law & Dispute Resolution",
        paragraphs: [
          `These Terms and Conditions and any commercial dispute arising out of website usage or purchases shall be governed by and construed in accordance with the laws of India and the State of Tamil Nadu.`,
          `Any legal claim or proceeding arising under or in connection with these terms shall be subject to the exclusive jurisdiction of the competent courts in Coimbatore, Tamil Nadu, India.`,
        ],
        callout: {
          type: "info",
          text: "We strongly encourage customers to reach out to our support desk first to resolve any commercial or delivery concern amicably and efficiently.",
        },
      },
    ],
  },

  shipping: {
    slug: "shipping",
    title: "Shipping & Delivery Policy",
    shortTitle: "Shipping",
    metaDescription: "Comprehensive delivery guide for Vee Power Electricals: Pan-India coverage, dispatch hub in Coimbatore, timelines, and shipping charges.",
    summary: `At ${COMPANY_NAME}, we understand the critical importance of reliable, timely delivery for electrical installations and projects. All orders are carefully inspected, securely packaged, and dispatched from our primary distribution hub in Coimbatore, Tamil Nadu, to destinations across India.`,
    lastReviewed: "April 2026",
    relatedPolicies: [
      { title: "Privacy Policy", slug: "privacy" },
      { title: "Terms & Conditions", slug: "terms" },
      { title: "Return & Cancellation", slug: "returns" },
    ],
    sections: [
      {
        id: "delivery-regions",
        title: "1. Serviceable Delivery Regions",
        paragraphs: [
          `We provide reliable Pan-India shipping to serviceable PIN codes across all Indian States and Union Territories.`,
          `Our central fulfillment facility is located at:\n${COMPANY_NAME} Coimbatore Hub\n${COMPANY_ADDRESS}`,
          "Serviceability is verified based on delivery PIN code coverage supported by our network of surface, express, and freight courier partners. If your destination PIN code is in an unserviceable remote sector, our dispatch team will contact you to arrange delivery to the nearest accessible hub.",
        ],
      },
      {
        id: "processing-timelines",
        title: "2. Order Processing & Dispatch",
        paragraphs: [
          "We strive for swift turnaround from order confirmation to carrier handover:",
        ],
        bulletPoints: [
          "Standard Stocked Items: Orders verified before 2:00 PM IST (Monday through Saturday) are typically processed and packed within 24 to 48 business hours.",
          "Industrial & Heavy Consignments: Large commercial orders, industrial switchgear, and cut-to-length heavy industrial cables may require 48 to 72 business hours for precision spooling, crating, and carrier scheduling.",
          "Sundays & Public Holidays: Orders placed on Sundays or statutory Tamil Nadu / national public holidays are processed on the next operating business day.",
        ],
      },
      {
        id: "estimated-timelines",
        title: "3. Estimated Delivery Timelines",
        paragraphs: [
          "Estimated transit times from dispatch at our Coimbatore hub are as follows:",
        ],
        bulletPoints: [
          "Coimbatore & Immediate Suburbs: 1 to 2 business days.",
          "Tamil Nadu & Neighboring Southern States (Kerala, Karnataka, Andhra Pradesh, Telangana): 2 to 4 business days.",
          "Metro Cities (Mumbai, Delhi NCR, Kolkata, Hyderabad, Bengaluru, Chennai): 3 to 5 business days.",
          "Rest of India (Tier 2/3 Cities & Regional Centers): 5 to 7 business days.",
          "Remote Areas, North-East States, and Special Territorials: 7 to 10 business days depending on surface transit logistics.",
        ],
        callout: {
          type: "note",
          text: "Delivery timelines are transit estimates provided by our freight and courier partners. Actual delivery dates may experience minor delays during festival peak seasons, severe weather conditions, or local transport restrictions.",
        },
      },
      {
        id: "shipping-charges",
        title: "4. Shipping Charges & Free Delivery Threshold",
        paragraphs: [
          "We offer transparent, competitive shipping rates calculated during checkout based on order value, destination, and parcel dimensions:",
        ],
        bulletPoints: [
          "Free Standard Delivery: Qualified retail consumer orders with a cart subtotal above ₹999.00 receive complimentary standard delivery across India.",
          "Standard Orders Below ₹999: A nominal base delivery charge (typically starting from ₹99.00 to ₹100.00 depending on distance and weight) is applied at checkout.",
          "Heavy & Volumetric Consignments: Bulk industrial consignments (such as heavy cable drums, multiple industrial exhaust fans, bulk conduit pipes) are handled via commercial road transport/lorry services. Any specialized freight charges or unloading requirements are communicated for confirmation prior to dispatch.",
        ],
      },
      {
        id: "order-tracking",
        title: "5. Real-Time Order Tracking",
        paragraphs: [
          "Once your consignment is handed over to our courier partner:",
        ],
        bulletPoints: [
          "An Air Waybill (AWB) / consignment tracking number is generated and assigned to your order.",
          "You will receive an automated dispatch notification with your tracking number and direct tracking URL via email and SMS.",
          "You can also monitor the live fulfillment and delivery status at any time by logging into your account and visiting the 'My Orders' section.",
        ],
      },
      {
        id: "address-accuracy",
        title: "6. Delivery Address & Undelivered Orders",
        paragraphs: [
          "To avoid delivery failures, please ensure that your delivery address, nearest landmark, recipient mobile number, and 6-digit postal PIN code are entered accurately during checkout.",
          "Our courier partners will make up to 3 delivery attempts. If a shipment cannot be delivered due to an incorrect address, recipient unreachability, or refusal to accept without valid cause, the package will return to our Coimbatore hub (RTO). Re-dispatch charges will apply for sending the package again.",
        ],
      },
      {
        id: "transit-damage",
        title: "7. Damage or Missing Packages in Transit",
        paragraphs: [
          "All electrical products are carefully packed with protective cushioning and tamper-evident sealing tape prior to dispatch.",
          "We advise customers to inspect the external condition of the package upon receipt. If the outer carton is noticeably torn, crushed, or tampered with, please note the damage with the delivery executive on the proof-of-delivery (POD) document and contact our support team within 24 to 48 hours with photographs of the package.",
        ],
      },
    ],
  },

  returns: {
    slug: "returns",
    title: "Return & Cancellation Policy",
    shortTitle: "Returns & Cancellation",
    metaDescription: "Understand Vee Power Electricals cancellation window, return eligibility, non-returnable categories, and verified refund timelines.",
    summary: `At ${COMPANY_NAME}, customer satisfaction and genuine product quality are our foremost commitments. We maintain clear, structured rules regarding order cancellations, returns of damaged or defective items, and refund processing in accordance with our warehouse verification workflows.`,
    lastReviewed: "April 2026",
    relatedPolicies: [
      { title: "Privacy Policy", slug: "privacy" },
      { title: "Terms & Conditions", slug: "terms" },
      { title: "Shipping Policy", slug: "shipping" },
    ],
    sections: [
      {
        id: "order-cancellation",
        title: "1. Order Cancellation Policy",
        paragraphs: [
          "You may cancel an order placed on our platform without any deduction or penalty prior to dispatch:",
        ],
        bulletPoints: [
          "Pre-Dispatch Cancellation: Orders in 'Pending', 'Confirmed', or 'Packed' status can be cancelled directly through your Customer Dashboard or by contacting customer support (+91 8610359797 / veepower.cbe@gmail.com).",
          "Post-Dispatch Orders: Once an order has reached 'Shipped' status (handed over to the carrier with an active tracking number), cancellation is no longer possible mid-transit. The customer should accept delivery and submit a formal return request under eligible criteria.",
          "Merchant Cancellation: We reserve the right to cancel an order due to unforeseen circumstances, including genuine stock depletion, pricing discrepancies, or unserviceable destination PIN codes. In such events, a full refund is immediately credited.",
        ],
      },
      {
        id: "return-window-eligibility",
        title: "2. Return Eligibility & Window",
        paragraphs: [
          "We offer a 7-day return window from the confirmed date of delivery under the following specific circumstances:",
        ],
        bulletPoints: [
          "Dead on Arrival (DOA) / Defective Product: The item does not operate or has an inherent manufacturing defect upon unboxing.",
          "Damaged in Transit: The product was received physically broken, cracked, dented, or damaged during transit (must be reported within 48 hours of delivery with photographic evidence).",
          "Incorrect Item Received: The delivered product SKU, brand, model, rating, or color does not match your confirmed order.",
          "Missing Components / Accessories: Essential accessories, hardware, or components specified in the manufacturer package were missing.",
        ],
      },
      {
        id: "condition-requirements",
        title: "3. Condition & Packaging Requirements",
        paragraphs: [
          "To qualify for an approved return, the product must meet the following mandatory inspection criteria:",
        ],
        bulletPoints: [
          "The product must be in its original, unused condition.",
          "The manufacturer original packaging, brand carton, inner foam inserts, protective wraps, user manual, and warranty documentation must be completely intact without defacement.",
          "The original physical/printed GST tax invoice or invoice copy must be provided with the return parcel.",
          "Electrical items that have been installed, wired, fitted into switchboards, soldered, or altered in any manner cannot be returned for safety and compliance reasons.",
        ],
      },
      {
        id: "non-returnable-items",
        title: "4. Non-Returnable Products",
        paragraphs: [
          "Certain categories of electrical products are non-returnable due to custom sizing or technical safety standards:",
        ],
        bulletPoints: [
          "Custom Cut Wires & Cables: Wires or cables cut to specific custom lengths from bulk factory drums per customer specifications.",
          "Installed Electrical Hardware: Components (switches, sockets, MCBs, DBs, distribution switchgear, luminaire modules) that have been installed, mounted, or connected to electrical mains.",
          "Products damaged due to electrical short-circuit, voltage spikes, improper earthing, or incorrect contractor installation.",
          "Consumable accessories or insulation tapes once unsealed.",
        ],
      },
      {
        id: "return-workflow",
        title: "5. How to Initiate a Return",
        paragraphs: [
          "Initiating a return is simple and transparent:",
        ],
        bulletPoints: [
          "Step 1 — Submit Request: Log in to your account, visit 'My Orders', select the order, and choose 'Request Return', or contact us via email (veepower.cbe@gmail.com) with your Order ID, reason, and photo/video evidence.",
          "Step 2 — Return Approval: Our fulfillment desk reviews the submission within 24 business hours. If eligible, your request is marked 'Return Approved'.",
          "Step 3 — Reverse Pickup or Dispatch: In serviceable pickup zones, a reverse courier pickup is arranged. For areas without reverse courier pickup, customers are guided on dispatching the parcel securely to our Coimbatore hub.",
          `Step 4 — Warehouse Inspection: Returned items are received at our facility:\nReturns Department, ${COMPANY_NAME}\n${COMPANY_ADDRESS}\nOur technical quality inspection team verifies product condition within 48 business hours of receipt.`,
          "Step 5 — Resolution: Upon verified inspection, your refund or replacement order is promptly initiated.",
        ],
      },
      {
        id: "refund-timelines",
        title: "6. Refund Timelines & Settlement Method",
        paragraphs: [
          "Once a returned item is received, inspected, and approved by our quality team:",
        ],
        bulletPoints: [
          "Prepaid Online Payments (UPI, Cards, Net Banking): Refunds are initiated within 2 to 4 business days directly to the original payment source. Funds typically reflect in your bank account in 3 to 7 banking business days in accordance with banking network clearing times.",
          "Cash on Delivery (COD) / Direct Bank Transfers: For COD orders or direct bank payments, refunds are processed via NEFT / IMPS bank transfer to the verified bank account provided by the customer within 3 to 5 business days of inspection approval.",
          "Free Replacement Alternative: In lieu of a refund, customers may opt for an immediate free replacement of the identical product, which is dispatched promptly with fresh tracking.",
        ],
      },
      {
        id: "pending-commercial-decisions",
        title: "7. Important Operating Clarifications",
        paragraphs: [
          "Please note the following operational clarifications regarding commercial returns:",
        ],
        callout: {
          type: "warning",
          text: "Change of Mind / Discretionary Returns: While returns for defective, damaged, or incorrect items are completely free, return requests solely due to customer change-of-mind or ordering an incorrect technical rating by customer error require prior support authorization and may be subject to return freight and restocking handling fees.",
        },
      },
    ],
  },
};
