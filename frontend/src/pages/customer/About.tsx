import AboutHero from "../../components/about/AboutHero";
import CompanyOverview from "../../components/about/CompanyOverview";
import BusinessStatistics from "../../components/about/BusinessStatistics";
import BusinessStrengths from "../../components/about/BusinessStrengths";
import BrandPartnerships from "../../components/about/BrandPartnerships";
import BusinessInfo from "../../components/about/BusinessInfo";
import AboutCTA from "../../components/about/AboutCTA";
import SEOHead from "../../components/common/SEOHead";

export default function About() {
  const aboutJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "name": "About Vee Power Electricals",
      "description": "Learn about Vee Power Electricals, Coimbatore's leading electrical goods distributor, supplying authorized brands like Havells, Polycab, Philips, and Schneider Electric.",
      "url": "https://veepowerelectricals.com/about",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://veepowerelectricals.com" },
        { "@type": "ListItem", "position": 2, "name": "About Us", "item": "https://veepowerelectricals.com/about" },
      ],
    },
  ];

  return (
    <div className="bg-white min-h-screen">
      <SEOHead
        title="About Us - Trusted Electrical Distributor in Coimbatore"
        description="Learn about Vee Power Electricals, Coimbatore's leading electrical goods distributor, supplying authorized brands like Havells, Polycab, Philips, and Schneider Electric."
        canonicalUrl="https://veepowerelectricals.com/about"
        jsonLd={aboutJsonLd}
      />
      <AboutHero />
      <CompanyOverview />
      <BusinessStatistics />
      <BusinessStrengths />
      <BrandPartnerships />
      <BusinessInfo />
      <AboutCTA />
    </div>
  );
}
