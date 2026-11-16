export interface CategorySeoInfo {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  heroHeading: string;
  heroSubheading: string;
  overviewHtml: string;
  subcategories: string[];
  dbCategorySlugs: string[]; // matching database slugs/names
  keySpecs: { label: string; value: string }[];
  buyingTips: string[];
  faqs: { question: string; answer: string }[];
}

export const CATEGORY_SEO_DATA: Record<string, CategorySeoInfo> = {
  "fans": {
    slug: "fans",
    name: "Fans",
    metaTitle: "Ceiling & Exhaust Fans | Havells & Crompton | Vee Power Electricals",
    metaDescription: "Shop energy-efficient BLDC ceiling fans, high-speed decorative fans, and exhaust ventilation fans by Havells and Crompton with express delivery across Tamil Nadu.",
    canonicalUrl: "https://veepowerelectricals.com/categories/fans",
    heroHeading: "High-Performance Ceiling & Ventilation Fans",
    heroSubheading: "Engineered for maximum air delivery, whisper-quiet operation, and 5-star energy savings.",
    overviewHtml: "Ceiling and ventilation fans are essential for domestic and commercial climate comfort across South India. At Vee Power Electricals, we supply genuine BEE 5-star rated energy-efficient ceiling fans and high-velocity exhaust fans manufactured by industry leaders Havells and Crompton. Featuring 100% copper motors, aerodynamic ribbed aluminum blades, and corrosion-resistant powder coatings, our fan collection ensures high air delivery (up to 230 CMM) at low wattages, drastically lowering household and commercial electricity bills.",
    subcategories: ["BLDC Energy Saving Fans", "Decorative Ceiling Fans", "High-Speed Commercial Fans", "Kitchen & Restroom Exhaust Fans"],
    dbCategorySlugs: ["fans", "ceiling-fans", "exhaust-fans"],
    keySpecs: [
      { label: "Sweep Sizes", value: "600mm, 900mm, 1200mm, 1400mm" },
      { label: "Motor Type", value: "100% Copper Winding / Brushless DC (BLDC)" },
      { label: "Air Delivery", value: "210 - 240 CMM (Cubic Metres per Minute)" },
      { label: "Energy Efficiency", value: "BEE 5-Star Rated (28W - 55W)" },
      { label: "Speed Rating", value: "350 - 400 RPM" }
    ],
    buyingTips: [
      "Select a 1200mm (48-inch) sweep for typical bedroom and living room spaces measuring 100 to 140 sq ft.",
      "Choose BLDC fans to save up to 60% power consumption compared to traditional induction motors.",
      "Ensure minimum 7 to 8 feet ceiling clearance from blade tip to floor for optimal aerodynamic airflow."
    ],
    faqs: [
      {
        question: "What is the standard ceiling fan size for a 12x12 bedroom?",
        answer: "A 1200 mm (48-inch) sweep fan is recommended for standard 100 to 140 sq ft bedrooms to ensure uniform air circulation across the entire room."
      },
      {
        question: "Do you supply genuine Havells and Crompton fans with warranty in Tamil Nadu?",
        answer: "Yes, every fan supplied by Vee Power Electricals comes with genuine manufacturer warranty cards and original GST tax invoices valid at all authorized service centers across Coimbatore and Tamil Nadu."
      },
      {
        question: "What is the power consumption difference between BLDC and regular fans?",
        answer: "Standard induction fans consume approximately 70-75 watts at full speed, whereas BLDC ceiling fans consume only 28-35 watts, cutting electricity consumption by over 50% while operating seamlessly on home inverters."
      }
    ]
  },
  "wires-cables": {
    slug: "wires-cables",
    name: "Wires & Cables",
    metaTitle: "FR & FR-LSH Copper Wires & Cables | Polycab & Finolex | Vee Power",
    metaDescription: "Buy certified 100% electrolytic copper building wires (0.75 to 6.0 sq mm) from Polycab and Finolex. High-flame retardant insulation for homes and industries.",
    canonicalUrl: "https://veepowerelectricals.com/categories/wires-cables",
    heroHeading: "Certified Flame Retardant Wires & Cables",
    heroSubheading: "High-conductivity pure copper conductors engineered for maximum safety and minimal line loss.",
    overviewHtml: "Electrical wiring is the safety backbone of every building. Vee Power Electricals stocks certified IS 694 compliant copper building wires and multi-core flexible cables from India's premier cable manufacturers Polycab and Finolex. Featuring >99.97% pure electrolytic grade copper and Flame Retardant (FR / FR-LSH) PVC compounds with high oxygen index ratings, our cables prevent fire propagation, eliminate current leakages, and ensure stable voltage transmission for domestic, commercial, and industrial loads.",
    subcategories: ["Single Core FR Building Wires", "FR-LSH Low Smoke Halogen Free Wires", "3 Core Flat Submersible Cables", "Multicore Flexible Industrial Cables"],
    dbCategorySlugs: ["wires", "cables", "wires-cables"],
    keySpecs: [
      { label: "Conductor Material", value: "Class 2 / Class 5 Electrolytic Annealed Pure Copper (>99.97%)" },
      { label: "Insulation Type", value: "Lead-Free FR / FR-LSH Grade PVC" },
      { label: "Voltage Grade", value: "Up to & including 1100 Volts AC" },
      { label: "Certifications", value: "IS 694:2010, RoHS, CE, CPRI Tested" },
      { label: "Standard Lengths", value: "90 Metre Projects Coils & 180 Metre Reels" }
    ],
    buyingTips: [
      "Use 1.0 sq mm or 1.5 sq mm copper wire for lighting and ceiling fan circuits.",
      "Use 2.5 sq mm wire for power socket circuits feeding refrigerators, televisions, and kitchen appliances.",
      "Use 4.0 sq mm or 6.0 sq mm wire for heavy inductive loads such as split air conditioners (1.5T / 2T), geysers, and EV chargers."
    ],
    faqs: [
      {
        question: "What is the difference between FR and FR-LSH wires?",
        answer: "FR (Flame Retardant) insulation resists catching fire and self-extinguishes when the flame source is removed. FR-LSH (Flame Retardant Low Smoke Low Halogen) also emits significantly less toxic smoke and acid gas during an emergency, dramatically improving visibility and survival time in enclosed spaces."
      },
      {
        question: "Are Polycab and Finolex wires supplied in sealed 90-meter boxes?",
        answer: "Yes, all our wire boxes are 100% factory-sealed tamper-evident 90-meter coils complete with holographic authentication marks and batch serial numbers."
      },
      {
        question: "Can I order project quantities for construction sites in Tamil Nadu?",
        answer: "Yes, Vee Power Electricals supplies electrical contractors, builders, and panel builders with bulk 90m and 180m reels, dispatched directly from our Coimbatore hub with GST B2B tax invoices."
      }
    ]
  },
  "switches": {
    slug: "switches",
    name: "Switches",
    metaTitle: "Modular Switches, Sockets & Faceplates | Legrand & Schneider | Vee Power",
    metaDescription: "Explore luxury and commercial modular switches, 6A/16A sockets, and designer cover plates by Legrand and Schneider Electric. Durable, spark-proof, ergonomic designs.",
    canonicalUrl: "https://veepowerelectricals.com/categories/switches",
    heroHeading: "Modular Switches & Contemporary Faceplates",
    heroSubheading: "Engineered with silver-cadmium contacts for spark-free switching and sleek architectural aesthetics.",
    overviewHtml: "Transform your interior living spaces with ergonomic, flame-retardant modular switches and sockets from Legrand and Schneider Electric. Designed with captive screws, child-safety shuttered socket mechanisms, and silver-cadmium oxide contacts, our modular wiring devices withstand over 100,000 switching operations while resisting yellowing and UV degradation. Available in 1-module to 18-module configurations with gloss, matte, and metallic finishes.",
    subcategories: ["1-Way & 2-Way Light Switches", "6A / 16A Shuttered Sockets", "Step Fan Regulators", "USB Fast Chargers & RJ45 Data Sockets", "Designer Modular Plates"],
    dbCategorySlugs: ["switches", "modular-switches"],
    keySpecs: [
      { label: "Contact Material", value: "Silver Inlaid / Silver Cadmium Oxide Contacts" },
      { label: "Housing Material", value: "Virgin Flame Retardant Engineering Polycarbonate (FR-PC)" },
      { label: "Current Ratings", value: "6 Amp, 10 Amp, 16 Amp, 20 Amp, 25 Amp, 32 Amp" },
      { label: "Operating Life", value: "Tested for > 100,000 switching operations" },
      { label: "Compliance", value: "IS 3854:1997 / IS 1293:2005" }
    ],
    buyingTips: [
      "Select shuttered sockets to prevent accidental child contact with live electrical terminals.",
      "Pair 16A or 20A heavy-duty switches with dedicated 2.5/4.0 sq mm wiring for water heaters and air conditioning circuits.",
      "Choose 2-way switches for staircase, corridor, and bedside lighting circuits for dual-point control."
    ],
    faqs: [
      {
        question: "Can I mix modules from Legrand with Schneider cover plates?",
        answer: "No, modular switch mechanisms are engineered with proprietary click-in clips specific to each brand's mounting grid plates. Always match switch modules and plates from the same product series."
      },
      {
        question: "Do 16A sockets support both 6A small pins and 16A power plugs?",
        answer: "Yes, our Legrand and Schneider 6A/16A combined universal sockets accommodate standard 3-pin plugs used by mobile chargers as well as heavy appliances like refrigerators and microwaves."
      },
      {
        question: "Are modular plates scratch and yellowing resistant?",
        answer: "Yes, our switches and faceplates are manufactured from virgin high-grade UV-stabilized polycarbonate that resists discolouration, high heat, and everyday scuffing."
      }
    ]
  },
  "led-lighting": {
    slug: "led-lighting",
    name: "LED & Lighting",
    metaTitle: "Commercial & Residential LED Lighting | Philips | Vee Power",
    metaDescription: "High-lumen LED bulbs, T5 slim tubelights, downlights, and commercial fixtures by Philips. Save up to 85% on lighting energy with eye-comfort technology.",
    canonicalUrl: "https://veepowerelectricals.com/categories/led-lighting",
    heroHeading: "Energy-Efficient LED Lamps, Battens & Downlights",
    heroSubheading: "Flicker-free Philips EyeComfort LED solutions engineered for superior lumen maintenance and long life.",
    overviewHtml: "Brighten your architectural, retail, or home environment with high-efficiency LED lighting by Philips. Offering luminous efficacy exceeding 100 lumens per watt and high Colour Rendering Index (CRI >80), our LED bulbs, T5 LED battens, and slim recessed downlights produce crisp, true-to-life illumination without annoying stroboscopic flicker or harsh glare. Enjoy up to 25,000 hours of operating life with substantial reductions in your commercial and domestic electricity bills.",
    subcategories: ["B22 & E27 LED Bulbs", "T5 & T8 Surface Battens", "Slim Round & Square Downlights", "Track Spotlights & Commercial Panels"],
    dbCategorySlugs: ["lighting", "led-lighting", "led"],
    keySpecs: [
      { label: "Luminous Efficacy", value: "> 100 to 110 Lumens per Watt" },
      { label: "Colour Temperatures", value: "3000K (Warm White), 4000K (Neutral White), 6500K (Cool Day Light)" },
      { label: "Colour Rendering", value: "CRI > 80 for natural color accuracy" },
      { label: "Rated Lifetime", value: "15,000 to 25,000 burning hours" },
      { label: "Surge Protection", value: "Integrated 2.5 kV to 4 kV high voltage surge protection" }
    ],
    buyingTips: [
      "Select 6500K Cool Day Light for kitchens, offices, study rooms, and workspaces for alert focus.",
      "Use 3000K Warm White for bedrooms, dining areas, and living spaces to create a warm, relaxing ambiance.",
      "Opt for 20W T5 LED battens to replace old 40W fluorescent tubelights for double the brightness at half the electricity."
    ],
    faqs: [
      {
        question: "How long does a Philips LED bulb last?",
        answer: "Philips LED bulbs are rated for 15,000 to 25,000 operating hours. At an average usage of 6 hours per day, this translates to over 7 to 10 years of reliable illumination."
      },
      {
        question: "What is EyeComfort technology in Philips lighting?",
        answer: "EyeComfort technology ensures lighting fixtures emit zero visible stroboscopic flicker, minimal blue light risk, and low glare, protecting eye health during long reading and working sessions."
      },
      {
        question: "Can I replace my old 36W fluorescent tube directly with a 20W LED batten?",
        answer: "Yes, surface-mounted LED battens come with their own integrated driver and mounting clips, connecting directly to 230V AC mains without needing an external choke or starter."
      }
    ]
  },
  "mcb-protection": {
    slug: "mcb-protection",
    name: "MCB & Protection",
    metaTitle: "MCBs, RCCBs & Distribution Boards | Legrand & Schneider | Vee Power",
    metaDescription: "Protect circuits against short circuits and electrical shocks with Legrand and Schneider miniature circuit breakers (MCBs), RCCBs, and distribution boards.",
    canonicalUrl: "https://veepowerelectricals.com/categories/mcb-protection",
    heroHeading: "Circuit Breakers, Earth Leakage Protection & DBs",
    heroSubheading: "Certified short-circuit breaking capacity up to 10kA for residential and commercial circuit safety.",
    overviewHtml: "Electrical safety begins in the distribution board. Vee Power Electricals supplies IS/IEC 60898-1 certified Miniature Circuit Breakers (MCBs), Residual Current Circuit Breakers (RCCBs), and Isolators engineered by Legrand and Schneider Electric. Featuring rapid bimetallic thermal overload tripping and magnetic short-circuit response with up to 10,000 Amperes breaking capacity, our circuit protection devices safeguard sensitive electronics, appliances, and human life against fires and lethal electric shocks.",
    subcategories: ["Single Pole (SP) & Double Pole (DP) MCBs", "Triple Pole (TP) & Four Pole (FP) Breakers", "30mA & 100mA Human Safety RCCBs", "IP43 Metal Distribution Enclosures"],
    dbCategorySlugs: ["mcb", "mcb-protection", "mcb-distribution"],
    keySpecs: [
      { label: "Breaking Capacity", value: "6kA / 10kA (tested as per IS/IEC 60898-1)" },
      { label: "Tripping Characteristics", value: "Type B & Type C tripping curves" },
      { label: "Rated Current Ratings", value: "6A, 10A, 16A, 20A, 25A, 32A, 40A, 63A" },
      { label: "Terminal Capacity", value: "Suitable for copper cables up to 25/35 sq mm" },
      { label: "Mounting Style", value: "Standard 35mm DIN Rail snap-on mounting" }
    ],
    buyingTips: [
      "Use 6A or 10A Type C MCBs for lighting and fan sub-circuits.",
      "Use 16A, 20A, or 25A MCBs for heavy appliances like air conditioners, geysers, and dishwashers.",
      "Install a 30mA RCCB downstream of your main isolator to protect humans from fatal electrocution and earth leakages."
    ],
    faqs: [
      {
        question: "What is the difference between an MCB and an RCCB?",
        answer: "An MCB (Miniature Circuit Breaker) protects cables and equipment against overloads and short-circuits. An RCCB (Residual Current Circuit Breaker) detects micro-amperage current leaking to earth (such as through a person touching an electrified metal body) and trips within 30 milliseconds to prevent fatal electric shock."
      },
      {
        question: "What does 'Type C' tripping curve mean?",
        answer: "Type C breakers trip between 5 to 10 times their rated current, making them ideal for handling the initial inductive inrush currents of refrigerators, motors, and air conditioners without nuisance tripping."
      },
      {
        question: "Do you supply complete distribution boards with busbars?",
        answer: "Yes, we supply pre-wired double-door IP43 metallic distribution boards from Legrand and Schneider complete with insulated copper busbars, neutral links, and earthing terminals."
      }
    ]
  },
  "electrical-accessories": {
    slug: "electrical-accessories",
    name: "Electrical Accessories",
    metaTitle: "Electrical Conduits, Enclosures & Accessories | Vee Power Coimbatore",
    metaDescription: "Find heavy-duty PVC conduits, surface gang boxes, industrial plug tops, insulation tape, and brass cable glands at Vee Power Electricals with wholesale rates.",
    canonicalUrl: "https://veepowerelectricals.com/categories/electrical-accessories",
    heroHeading: "Commercial Conduits, Installation Hardware & Accessories",
    heroSubheading: "Essential installation materials for safe, durable, and clean residential and industrial wiring.",
    overviewHtml: "A professional electrical installation requires robust conduit systems, junction boxes, and installation hardware. Vee Power Electricals stocks heavy-gauge rigid PVC conduit pipes, conduit fittings, galvanized metal switch boxes, self-amalgamating insulation tapes, multi-plugs, and cable ties. Built to withstand mechanical impact, thermal stress, and moisture ingress, our electrical accessories ensure your cabling infrastructure remains fully protected for decades.",
    subcategories: ["Heavy Gauge Rigid PVC Conduits", "GI Metal Flush Mounting Boxes", "FR Self-Adhesive Insulation Tapes", "Industrial Plugs & Sockets", "Nylon Cable Ties & Glands"],
    dbCategorySlugs: ["accessories", "electrical-accessories"],
    keySpecs: [
      { label: "Conduit Standards", value: "IS 9537 Part 3 Heavy Mechanical Stress Class" },
      { label: "Box Materials", value: "Galvanized Iron (GI) 1.2mm / Flame Retardant ABS" },
      { label: "Tape Dielectric Strength", value: "> 40 kV/mm dielectric breakdown" },
      { label: "Temperature Rating", value: "-10°C to +80°C continuous service" }
    ],
    buyingTips: [
      "Use heavy-gauge PVC conduits for concrete slab casting to resist deformation during concrete vibration.",
      "Choose galvanized iron flush boxes with earthing screws for long-lasting rust-free switchboard installations.",
      "Always use ISI-certified flame retardant PVC insulation tape for conductor joints to prevent insulation breakdown."
    ],
    faqs: [
      {
        question: "What conduit size is needed for house wiring?",
        answer: "20mm and 25mm diameter rigid PVC conduits are standard for concealed house wiring, allowing sufficient space for 1.5 sq mm and 2.5 sq mm wires without thermal crowding."
      },
      {
        question: "Can I place bulk orders for construction projects?",
        answer: "Yes, Vee Power Electricals provides contractors, builders, and electricians with bundle rates for conduits, boxes, and accessories dispatched from our Coimbatore warehouse."
      }
    ]
  }
};
