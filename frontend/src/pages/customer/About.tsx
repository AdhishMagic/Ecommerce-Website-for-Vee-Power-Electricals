import AboutHero from "../../components/about/AboutHero";
import CompanyOverview from "../../components/about/CompanyOverview";
import BusinessStatistics from "../../components/about/BusinessStatistics";
import BusinessStrengths from "../../components/about/BusinessStrengths";
import BrandPartnerships from "../../components/about/BrandPartnerships";
import BusinessInfo from "../../components/about/BusinessInfo";
import AboutCTA from "../../components/about/AboutCTA";

export default function About() {
  return (
    <div className="bg-white min-h-screen">
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
