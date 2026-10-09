import { Link } from "react-router-dom";
import ContactHero from "../../components/contact/ContactHero";
import ContactInfoCard from "../../components/contact/ContactInfoCard";
import ContactForm from "../../components/contact/ContactForm";

export default function Contact() {
  return (
    <div className="bg-white min-h-screen py-8 sm:py-12">
      <div className="site-container">
        {/* Breadcrumb */}
        <nav className="text-xs text-slate-500 mb-6 flex items-center gap-2 font-medium" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-[#1769AA] transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-[#0B3A63] font-semibold">Contact Us</span>
        </nav>

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
