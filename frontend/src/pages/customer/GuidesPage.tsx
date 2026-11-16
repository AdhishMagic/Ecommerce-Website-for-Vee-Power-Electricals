import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import SEOHead from "../../components/common/SEOHead";
import { EDUCATIONAL_GUIDES, BuyerGuide } from "../../data/educationalGuides";

export default function GuidesPage() {
  const { slug } = useParams<{ slug: string }>();

  // If a slug is present, render the individual guide
  if (slug) {
    return <GuideDetail slug={slug} />;
  }

  // Otherwise, render the guides index
  return <GuidesIndex />;
}

function GuidesIndex() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const allGuides = useMemo(() => Object.values(EDUCATIONAL_GUIDES), []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    allGuides.forEach((g) => set.add(g.category));
    return ["all", ...Array.from(set)];
  }, [allGuides]);

  const filteredGuides = useMemo(() => {
    return allGuides.filter((g) => {
      const matchesCat = selectedCategory === "all" || g.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [allGuides, selectedCategory, searchQuery]);

  const jsonLdData = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Electrical Buyer & Installation Guides | Vee Power Electricals",
      "description": "Technical electrical guides covering copper wire sizing, MCB vs RCCB selection, modular switches, BLDC fan energy calculations, and contractor procurement.",
      "url": "https://veepowerelectricals.com/guides",
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": allGuides.map((g, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "name": g.title,
          "url": g.canonicalUrl
        }))
      }
    }
  ];

  return (
    <div className="w-full bg-[#F6F8FA] min-h-screen py-6 sm:py-8 lg:py-10">
      <SEOHead
        title="Electrical Technical & Buying Guides | Vee Power Electricals"
        description="Comprehensive technical guides on wire gauge sizing, MCB & RCCB circuit protection, modular switches, LED lighting, and commercial contractor procurement."
        canonicalUrl="https://veepowerelectricals.com/guides"
        jsonLd={jsonLdData}
      />

      <div className="site-container mx-auto">
        <Breadcrumbs items={[{ label: "Guides" }]} className="mb-5 sm:mb-6" />

        {/* Hero Section */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs mb-8">
          <div className="max-w-3xl">
            <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1769AA] rounded-full mb-3 border border-[#BFDBFE]">
              Technical Authority & Education
            </span>
            <h1
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0B3A63] tracking-tight leading-tight mb-3"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Electrical Buyer & Engineering Guides
            </h1>
            <p className="text-sm sm:text-base text-[#475467] font-medium leading-relaxed mb-4">
              Written by electrical engineers and certified technicians at Vee Power Electricals Coimbatore.
            </p>
            <p className="text-xs sm:text-sm text-[#667085] leading-relaxed">
              Explore practical, code-compliant selection guides designed for homeowners, builders, architects, and electrical contractors. Learn how to calculate wire gauges, size circuit breakers, select architectural switchgear, and verify genuine ISI certifications.
            </p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-6 border-b border-[#D9E1E8] mb-8">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedCategory === cat
                    ? "bg-[#0B3A63] text-white shadow-2xs"
                    : "bg-white border border-[#D9E1E8] text-[#475467] hover:border-[#1769AA] hover:text-[#1769AA]"
                }`}
              >
                {cat === "all" ? "All Topics (10)" : cat}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-72 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides by keyword..."
              className="w-full px-3.5 py-2 bg-white border border-[#D9E1E8] rounded-xl text-xs sm:text-sm text-[#17212B] placeholder-[#667085] focus:outline-none focus:border-[#1769AA] shadow-2xs"
            />
          </div>
        </div>

        {/* Guides Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {filteredGuides.map((guide) => (
            <article
              key={guide.slug}
              className="bg-white border border-[#D9E1E8] hover:border-[#1769AA]/40 rounded-2xl p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1769AA] px-2.5 py-0.5 rounded-full border border-[#BFDBFE]">
                    {guide.category}
                  </span>
                  <span className="text-xs text-[#667085]">{guide.readingTime}</span>
                </div>

                <h2
                  className="text-lg font-bold text-[#0B3A63] mb-2.5 leading-snug line-clamp-2 hover:text-[#1769AA] transition-colors"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  <Link to={`/guides/${guide.slug}`}>{guide.title}</Link>
                </h2>

                <p className="text-xs sm:text-sm text-[#667085] leading-relaxed mb-4 line-clamp-3">
                  {guide.summary}
                </p>
              </div>

              <div className="pt-4 border-t border-[#F1F5F9] flex items-center justify-between">
                <span className="text-xs text-[#667085]">{guide.publishDate}</span>
                <Link
                  to={`/guides/${guide.slug}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#1769AA] hover:text-[#0B3A63]"
                >
                  <span>Read Full Guide</span>
                  <span>→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function GuideDetail({ slug }: { slug: string }) {
  const guide = EDUCATIONAL_GUIDES[slug.toLowerCase().trim()];

  if (!guide) {
    return (
      <div className="site-container py-12 text-center">
        <SEOHead
          title="Guide Not Found | Vee Power Electricals"
          description="The requested electrical guide could not be found."
          robots="noindex, follow"
        />
        <h1 className="text-2xl font-bold text-[#0B3A63] mb-4">Guide Not Found</h1>
        <p className="text-[#667085] mb-6">We could not locate the guide you were searching for.</p>
        <Link
          to="/guides"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1769AA] text-white rounded-xl text-sm font-semibold hover:bg-[#0B3A63] transition-colors"
        >
          View All Technical Guides
        </Link>
      </div>
    );
  }

  // Schema.org Article Structured Data
  const jsonLdData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": guide.title,
      "description": guide.metaDescription,
      "datePublished": guide.publishDate,
      "dateModified": guide.publishDate,
      "author": {
        "@type": "Organization",
        "name": "Vee Power Electricals Engineering Team",
        "url": "https://veepowerelectricals.com"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Vee Power Electricals",
        "logo": {
          "@type": "ImageObject",
          "url": "https://veepowerelectricals.com/favicon.png"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": guide.canonicalUrl
      }
    }
  ];

  return (
    <div className="w-full bg-[#F6F8FA] min-h-screen py-6 sm:py-8 lg:py-10">
      <SEOHead
        title={guide.metaTitle}
        description={guide.metaDescription}
        canonicalUrl={guide.canonicalUrl}
        jsonLd={jsonLdData}
      />

      <div className="site-container mx-auto">
        <Breadcrumbs
          items={[
            { label: "Guides", path: "/guides" },
            { label: guide.title }
          ]}
          className="mb-5 sm:mb-6"
        />

        <div className="max-w-4xl mx-auto">
          {/* Article Header */}
          <header className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs mb-8">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1769AA] rounded-full border border-[#BFDBFE]">
                {guide.category}
              </span>
              <span className="text-xs text-[#667085]">⏱ {guide.readingTime}</span>
              <span className="text-xs text-[#667085]">📅 {guide.publishDate}</span>
            </div>

            <h1
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0B3A63] tracking-tight leading-tight mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {guide.title}
            </h1>

            <p className="text-sm sm:text-base text-[#475467] leading-relaxed font-medium">
              {guide.summary}
            </p>
          </header>

          {/* Key Takeaways Callout Box */}
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-6 sm:p-8 mb-8">
            <h2
              className="text-lg font-bold text-[#0B3A63] mb-3 flex items-center gap-2"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              <span>⚡</span> Key Engineering Takeaways
            </h2>
            <ul className="space-y-2 text-xs sm:text-sm text-[#1E3A8A]">
              {guide.keyTakeaways.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-bold text-[#1769AA] mt-0.5">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Article Body Sections */}
          <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs mb-8 space-y-8">
            {guide.sections.map((section, idx) => (
              <section key={idx} className="border-b border-[#F1F5F9] pb-8 last:border-0 last:pb-0">
                <h2
                  className="text-xl sm:text-2xl font-bold text-[#0B3A63] mb-3 leading-snug"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {section.heading}
                </h2>
                <p className="text-xs sm:text-sm text-[#475467] leading-relaxed mb-4">
                  {section.content}
                </p>

                {section.recommendations && section.recommendations.length > 0 && (
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 sm:p-5 mt-4">
                    <h3 className="text-xs font-bold text-[#0B3A63] uppercase tracking-wider mb-2.5">
                      Technical Recommendations
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-[#334155]">
                      {section.recommendations.map((rec, rIdx) => (
                        <li key={rIdx} className="flex items-start gap-2">
                          <span className="text-[#10B981] font-bold">✓</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Related Products & Categories Callout */}
          <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 shadow-xs mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit, sans-serif" }}>
                Ready to Order Certified Materials?
              </h3>
              <p className="text-xs text-[#667085] mt-1">
                Explore our in-stock range related to this guide.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/categories/${guide.relatedCategorySlug}`}
                className="px-4 py-2 bg-[#1769AA] hover:bg-[#0B3A63] text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
              >
                Browse Category
              </Link>
              <Link
                to="/shop"
                className="px-4 py-2 bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#0B3A63] rounded-xl text-xs font-semibold transition-colors"
              >
                Full Shop Catalog
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
