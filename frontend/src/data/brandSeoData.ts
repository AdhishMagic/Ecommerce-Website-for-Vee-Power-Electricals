export interface BrandSeoInfo {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  tagline: string;
  companyOverview: string;
  originCountry: string;
  popularSeries: string[];
  keyStrengths: string[];
  procurementNote: string;
  categoriesSupplied: { name: string; slug: string }[];
  isIndexable: boolean;
}

export const BRAND_SEO_DATA: Record<string, BrandSeoInfo> = {
  "havells": {
    slug: "havells",
    name: "Havells",
    metaTitle: "Havells Electrical Products | Fans & Switchgear | Vee Power Electricals",
    metaDescription: "Buy genuine Havells ceiling fans, BLDC motors, and electrical equipment at Vee Power Electricals. Fast delivery across Tamil Nadu with manufacturer warranty.",
    canonicalUrl: "https://veepowerelectricals.com/brands/havells",
    tagline: "India's Fast Moving Electrical Goods Pioneer",
    companyOverview: "Havells India Limited is a leading Fast Moving Electrical Goods (FMEG) company with an extensive global footprint. Renowned for design excellence, energy efficiency, and durable engineering, Havells produces high-grade domestic and commercial fans, lighting, industrial switchgear, and cables. Vee Power Electricals supplies authentic Havells electrical products in Coimbatore and across Tamil Nadu.",
    originCountry: "India (Noida, Uttar Pradesh)",
    popularSeries: ["Stealth Air BLDC", "Efficiencia Neo", "Enticer Art", "Fabio Switches"],
    keyStrengths: ["100% pure copper motor windings", "BEE 5-star energy saving ratings", "Corrosion-resistant dust-resistant coatings", "Pan-India authorized service network"],
    procurementNote: "All Havells products are dispatched with manufacturer warranty cards and original GST invoices.",
    categoriesSupplied: [
      { name: "Ceiling & Exhaust Fans", slug: "fans" },
      { name: "Wires & Cables", slug: "wires-cables" },
      { name: "Modular Switches", slug: "switches" }
    ],
    isIndexable: true
  },
  "polycab": {
    slug: "polycab",
    name: "Polycab",
    metaTitle: "Polycab Wires & Cables | FR & FR-LSH Copper Cables | Vee Power",
    metaDescription: "Order certified Polycab single-core and multi-core copper building wires (0.75 sq mm to 6.0 sq mm) at Vee Power Electricals Coimbatore. 100% original factory coils.",
    canonicalUrl: "https://veepowerelectricals.com/brands/polycab",
    tagline: "India's #1 Wires and Cables Manufacturer",
    companyOverview: "Polycab India Limited is India's largest manufacturer of wires and cables, commanding premier market leadership across domestic and industrial electrification projects. Engineered from >99.97% pure electrolytic grade copper conductors and proprietary flame retardant (FR and FR-LSH) PVC compounds, Polycab cables guarantee low resistance, superior power savings, and high fire safety. Vee Power Electricals supplies genuine sealed 90m and 180m coils.",
    originCountry: "India (Mumbai, Maharashtra)",
    popularSeries: ["Polycab Optima FR", "Polycab Green Wire FR-LSH", "HFX Flexible Multicore", "Submersible Flat 3-Core"],
    keyStrengths: [">99.97% electrolytic pure copper conductor", "Flame Retardant Low Smoke (FR-LSH) technology", "1100V grade IS 694 certification", "Tamper-evident holographic packaging"],
    procurementNote: "Supplied in factory-sealed 90m cartons with verified batch numbers and test certificates upon request.",
    categoriesSupplied: [
      { name: "Wires & Cables", slug: "wires-cables" },
      { name: "Fans", slug: "fans" },
      { name: "LED & Lighting", slug: "led-lighting" }
    ],
    isIndexable: true
  },
  "finolex": {
    slug: "finolex",
    name: "Finolex",
    metaTitle: "Finolex Cables & Wires | 100% Annealed Copper | Vee Power",
    metaDescription: "Purchase authentic Finolex flame retardant (FR) electrical copper wires at Vee Power Electricals. High dielectric strength, lead-free PVC insulation.",
    canonicalUrl: "https://veepowerelectricals.com/brands/finolex",
    tagline: "Total Cable Solutions & Unmatched Trust",
    companyOverview: "Finolex Cables Limited is one of India's most trusted manufacturers of electrical and telecommunication cables. Finolex electrical wires are manufactured using high-purity electrolytic grade bright annealed bare copper conductors drawn in-house and formulated with lead-free, flame retardant (FR) PVC compounds to prevent fire propagation during severe electrical faults.",
    originCountry: "India (Pune, Maharashtra)",
    popularSeries: ["Finolex Flame Retardant (FR)", "Finolex FR-LSH", "3-Core Submersible Cables", "LAN & Coaxial Cables"],
    keyStrengths: ["High-purity bare annealed copper", "High oxygen and temperature index PVC", "Smooth conduit glide formulation", "IS 694 / RoHS compliant"],
    procurementNote: "Genuine Finolex coils available for domestic wiring and commercial contractors across Tamil Nadu.",
    categoriesSupplied: [
      { name: "Wires & Cables", slug: "wires-cables" }
    ],
    isIndexable: true
  },
  "legrand": {
    slug: "legrand",
    name: "Legrand",
    metaTitle: "Legrand Modular Switches, Sockets & MCBs | Vee Power Electricals",
    metaDescription: "Shop Legrand Mylinc, Arteor, and DX3 circuit protection devices. Premium French electrical engineering, spark-resistant contacts, and architectural finishes.",
    canonicalUrl: "https://veepowerelectricals.com/brands/legrand",
    tagline: "Global Specialist in Electrical & Digital Building Infrastructures",
    companyOverview: "Legrand is a world leader in electrical and digital building infrastructures, headquartered in France with state-of-the-art manufacturing facilities in India. Renowned for safety, tactile ergonomics, and architectural elegance, Legrand products range from modular switches and sockets (Mylinc, Britzy, Arteor) to high-breaking-capacity DIN-rail MCBs and distribution boards (DX3).",
    originCountry: "France (India operations: Mumbai)",
    popularSeries: ["Mylinc Modular", "Arteor Luxury Series", "DX3 10kA Circuit Breakers", "Practibox S Enclosures"],
    keyStrengths: ["Virgin flame-retardant polycarbonate housing", "10,000A short circuit breaking capacity on MCBs", "Captive screw terminals with insulated safety barriers", "Tested for > 100,000 switching operations"],
    procurementNote: "Authentic Legrand modules and plates supplied for residential, hospitality, and corporate office projects.",
    categoriesSupplied: [
      { name: "Modular Switches", slug: "switches" },
      { name: "MCB & Protection", slug: "mcb-protection" }
    ],
    isIndexable: true
  },
  "philips": {
    slug: "philips",
    name: "Philips",
    metaTitle: "Philips LED Lighting & Battens | Vee Power Electricals Coimbatore",
    metaDescription: "Explore Philips EyeComfort LED bulbs, T5 tubelights, and recessed downlights. Energy-efficient, flicker-free illumination with genuine manufacturer warranty.",
    canonicalUrl: "https://veepowerelectricals.com/brands/philips",
    tagline: "Signify - World Leader in Lighting",
    companyOverview: "Philips Lighting (now Signify) is the undisputed global benchmark for energy-efficient lighting. Featuring proprietary EyeComfort design parameters, Philips LED lamps and surface battens eliminate invisible stroboscopic flicker, reduce harmful blue light, and maintain steady lumen output for up to 25,000 hours. Vee Power Electricals distributes genuine Philips LED solutions for homes, showrooms, and commercial facilities.",
    originCountry: "Netherlands (India operations: Gurugram)",
    popularSeries: ["Stellar Bright LED Bulbs", "T5 Batten Tubelights", "Star Surface Downlights", "Deco Ring Panels"],
    keyStrengths: ["EyeComfort certified flicker-free technology", "High luminous efficacy (>100 lm/Watt)", "Integrated 2.5kV to 4kV surge suppression", "High Colour Rendering Index (CRI >80)"],
    procurementNote: "All Philips LED lamps are covered by official replacement warranty across Tamil Nadu.",
    categoriesSupplied: [
      { name: "LED & Lighting", slug: "led-lighting" }
    ],
    isIndexable: true
  },
  "crompton": {
    slug: "crompton",
    name: "Crompton",
    metaTitle: "Crompton Fans & Home Electricals | Vee Power Electricals",
    metaDescription: "Buy Crompton high-speed ceiling fans, BLDC motors, and exhaust fans at Vee Power Electricals. Reliable performance and durable copper motors.",
    canonicalUrl: "https://veepowerelectricals.com/brands/crompton",
    tagline: "Let's Hangout Kool - 85+ Years of Engineering Heritage",
    companyOverview: "Crompton Greaves Consumer Electricals Limited has over 85 years of brand legacy in Indian electrical appliances. Known for high air delivery, silent operation, and long motor lifespan, Crompton ceiling and exhaust fans feature double ball bearings and dynamically balanced blades to withstand Indian tropical operating conditions.",
    originCountry: "India (Mumbai, Maharashtra)",
    popularSeries: ["Sea Breeze High Speed", "Energion BLDC", "Aura Decorative", "Brisk Air Exhaust"],
    keyStrengths: ["Double ball bearing motors for silent operation", "Dynamic balanced ribbed aluminum blades", "High air delivery up to 230 CMM", "Extensive national service center network"],
    procurementNote: "Packaged with manufacturer warranty cards and factory-verified dynamic balancing.",
    categoriesSupplied: [
      { name: "Fans", slug: "fans" },
      { name: "LED & Lighting", slug: "led-lighting" }
    ],
    isIndexable: true
  },
  "schneider": {
    slug: "schneider",
    name: "Schneider Electric",
    metaTitle: "Schneider Electric MCBs & Switchgear | Vee Power Electricals",
    metaDescription: "Buy genuine Schneider Electric miniature circuit breakers (MCBs), isolators, and modular switches. High-performance industrial and domestic safety.",
    canonicalUrl: "https://veepowerelectricals.com/brands/schneider",
    tagline: "Life Is On - Global Energy Management Specialist",
    companyOverview: "Schneider Electric is a global leader in energy management and electrical automation. Known for its Acti9 and EasyPact circuit protection ranges and AvatarOn modular switches, Schneider devices provide superior short-circuit response, bimetallic overload precision, and elegant aesthetics.",
    originCountry: "France (India operations: Bengaluru)",
    popularSeries: ["Acti9 MCBs", "Easy9 Protection", "AvatarOn Switches", "Resi9 Distribution Boards"],
    keyStrengths: ["VisiTrip technology for instant fault detection", "Bi-connect terminals for flexible wiring", "High breaking capacity up to 10kA", "EcoStruxure compatible components"],
    procurementNote: "Supplied for mission-critical commercial and residential switchboard assemblies.",
    categoriesSupplied: [
      { name: "MCB & Protection", slug: "mcb-protection" },
      { name: "Modular Switches", slug: "switches" }
    ],
    isIndexable: true
  },
  "anchor": {
    slug: "anchor",
    name: "Anchor",
    metaTitle: "Anchor by Panasonic Electricals | Vee Power Electricals",
    metaDescription: "Information on Anchor by Panasonic modular switches, Roma series, and wires. Inquire for project procurement and supply availability at Vee Power Electricals.",
    canonicalUrl: "https://veepowerelectricals.com/brands/anchor",
    tagline: "Anchor by Panasonic - Quality That Endures",
    companyOverview: "Anchor Electricals, acquired by Panasonic in 2007, is a household name in Indian wiring accessories. Renowned for its iconic Roma modular switches and Rider electrical devices, Anchor represents Japanese manufacturing standards combined with Indian accessibility.",
    originCountry: "India (Panasonic Corporation, Japan)",
    popularSeries: ["Roma Classic", "Roma Plus", "Rider Modular", "Advance Wires"],
    keyStrengths: ["Pioneer of modular switches in India", "Flame retardant polycarbonate construction", "Affordable domestic electrification"],
    procurementNote: "Currently accepting project inquiries and backorder requests for Anchor by Panasonic catalog lines.",
    categoriesSupplied: [
      { name: "Modular Switches", slug: "switches" },
      { name: "Wires & Cables", slug: "wires-cables" },
      { name: "Electrical Accessories", slug: "electrical-accessories" }
    ],
    isIndexable: false
  },
  "gloster": {
    slug: "gloster",
    name: "Gloster",
    metaTitle: "Gloster Cables | Industrial LT & HT Power Cables | Vee Power",
    metaDescription: "Overview of Gloster LT, HT, and specialty industrial cables. Contact Vee Power Electricals for heavy infrastructure and industrial cable inquiries.",
    canonicalUrl: "https://veepowerelectricals.com/brands/gloster",
    tagline: "Pioneers in Heavy Industrial & Underground Cables",
    companyOverview: "Gloster Cables Limited is an established Indian manufacturer specializing in high-voltage (HT) and low-voltage (LT) armored power cables, control cables, and fire-survival instrumentation cables for industrial plants, mining, and power generation facilities.",
    originCountry: "India (Kolkata, West Bengal)",
    popularSeries: ["XLPE Armoured LT Power Cables", "HT 11kV/33kV Cables", "FS Fire Survival Cables"],
    keyStrengths: ["Heavy-duty steel wire/tape armoring", "CPRI and NABL certified test reports", "Industrial infrastructure standard compliance"],
    procurementNote: "Gloster cables are procured on a project basis against specific Bill of Quantities (BOQ).",
    categoriesSupplied: [
      { name: "Wires & Cables", slug: "wires-cables" }
    ],
    isIndexable: false
  },
  "jaquar": {
    slug: "jaquar",
    name: "Jaquar",
    metaTitle: "Jaquar Lighting | Architectural & Commercial LED | Vee Power",
    metaDescription: "Jaquar Lighting premium decorative fixtures, chandeliers, and outdoor architectural LEDs. Inquire for luxury residential and hospitality lighting projects.",
    canonicalUrl: "https://veepowerelectricals.com/brands/jaquar",
    tagline: "Complete LED Lighting Solutions",
    companyOverview: "Jaquar Lighting, an extension of the prestigious Jaquar Group, provides complete commercial, decorative, and architectural LED lighting solutions. Offering high-efficacy chips and premium die-cast fixtures, Jaquar Lighting is widely specified in luxury residences and hotels.",
    originCountry: "India (Manesar, Haryana)",
    popularSeries: ["Vivid Architectural LED", "Decorative Chandeliers", "Landscape & Facade Lighting"],
    keyStrengths: ["High architectural aesthetics", "High CRI (>85) illumination", "Heavy die-cast heat sinks for thermal management"],
    procurementNote: "Architectural lighting catalogs and sample kits available for architects and interior designers.",
    categoriesSupplied: [
      { name: "LED & Lighting", slug: "led-lighting" }
    ],
    isIndexable: false
  },
  "khaitan": {
    slug: "khaitan",
    name: "Khaitan",
    metaTitle: "Khaitan Fans & Home Appliances | Vee Power Electricals",
    metaDescription: "Khaitan heritage fans, heavy-duty industrial air circulators, and ventilation fans. Project procurement and wholesale inquiries at Vee Power Electricals.",
    canonicalUrl: "https://veepowerelectricals.com/brands/khaitan",
    tagline: "The Name Is Enough - Heritage Fan Engineering",
    companyOverview: "Khaitan is a historic Indian brand synonymous with ceiling and industrial ventilation fans. Renowned for rugged heavy-duty copper motors and high air throw, Khaitan specializes in industrial air circulators, exhaust systems, and domestic ceiling fans.",
    originCountry: "India (Kolkata, West Bengal)",
    popularSeries: ["Khaitan Magna", "Heavy Duty Industrial Exhaust", "Ayush Air Circulator"],
    keyStrengths: ["High air throw in tropical conditions", "Heavy-gauge motor stampings", "Robust industrial mechanical design"],
    procurementNote: "Wholesale industrial ventilation inquiries handled by our engineering sales team.",
    categoriesSupplied: [
      { name: "Fans", slug: "fans" }
    ],
    isIndexable: false
  }
};

// Support both standard brand slugs
BRAND_SEO_DATA["schneider-electric"] = {
  ...BRAND_SEO_DATA["schneider"],
  slug: "schneider-electric",
  canonicalUrl: "https://veepowerelectricals.com/brands/schneider-electric",
  isIndexable: true,
};
