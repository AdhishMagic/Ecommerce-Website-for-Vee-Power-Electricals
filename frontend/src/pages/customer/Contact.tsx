import ContactHero from "../../components/contact/ContactHero";
import ContactInfoCard from "../../components/contact/ContactInfoCard";
import ContactForm from "../../components/contact/ContactForm";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import SEOHead from "../../components/common/SEOHead";

export default function Contact() {
  const contactJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      "name": "Contact Vee Power Electricals",
      "description": "Contact Vee Power Electricals in Coimbatore for electrical inquiries, quotations, and bulk contractor pricing.",
      "url": "https://veepowerelectricals.com/contact",
    },
    {
      "@context": "https://schema.org",
      "@type": "ElectricalSupplyStore",
      "name": "Vee Power Electricals",
      "image": "https://veepowerelectricals.com/favicon.png",
      "url": "https://veepowerelectricals.com",
      "telephone": "+91-94432-23456",
      "priceRange": "₹₹",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Cross Cut Road, Gandhipuram",
        "addressLocality": "Coimbatore",
        "addressRegion": "Tamil Nadu",
        "postalCode": "641012",
        "addressCountry": "IN"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 11.0168,
        "longitude": 76.9558
      },
      "openingHoursSpecification": [
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          "opens": "09:00",
          "closes": "20:30"
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://veepowerelectricals.com" },
        { "@type": "ListItem", "position": 2, "name": "Contact Us", "item": "https://veepowerelectricals.com/contact" },
      ],
    },
  ];

  return (
    <div className="bg-white min-h-screen py-8 sm:py-12">
      <SEOHead
        title="Contact Us - Wholesale & Retail Electricals in Coimbatore"
        description="Contact Vee Power Electricals in Coimbatore for electrical inquiries, contractor quotations, and wholesale orders. Phone: +91-94432-23456."
        canonicalUrl="https://veepowerelectricals.com/contact"
        jsonLd={contactJsonLd}
      />
      <div className="site-container">
        <Breadcrumbs items={[{ label: "Contact Us" }]} className="mb-6" />

        {/* Hero Header */}
        <ContactHero />

        {/* Contact Layout */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Contact Cards */}
          <div className="lg:col-span-5">
            <ContactInfoCard />
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-7">
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
