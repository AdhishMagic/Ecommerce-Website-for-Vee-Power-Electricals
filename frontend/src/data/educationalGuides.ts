export interface BuyerGuide {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  publishDate: string;
  readingTime: string;
  category: string;
  summary: string;
  keyTakeaways: string[];
  sections: {
    heading: string;
    content: string;
    recommendations?: string[];
  }[];
  relatedCategorySlug: string;
  relatedBrandSlugs: string[];
}

export const EDUCATIONAL_GUIDES: Record<string, BuyerGuide> = {
  "wire-selection-guide": {
    slug: "wire-selection-guide",
    title: "Complete Electrical Wire Selection Guide: Gauge, Current Ratings & Fire Safety",
    metaTitle: "Electrical Wire Selection Guide | Polycab & Finolex | Vee Power",
    metaDescription: "Master electrical wire selection for homes and commercial buildings. Learn copper wire gauge sizes (0.75 to 6 sq mm), current ratings, and FR vs FR-LSH safety standards.",
    canonicalUrl: "https://veepowerelectricals.com/guides/wire-selection-guide",
    publishDate: "2026-01-15",
    readingTime: "7 min read",
    category: "Wires & Cables",
    summary: "Selecting the correct copper wire gauge is the most critical electrical safety decision in residential and commercial construction. Undersized cables overheat, waste electrical energy, cause voltage drop, and present serious fire risks.",
    keyTakeaways: [
      "Use 1.0 sq mm or 1.5 sq mm copper wire for lighting and ceiling fan sub-circuits.",
      "Use 2.5 sq mm for standard 16A power socket circuits feeding kitchen appliances and refrigerators.",
      "Always use 4.0 sq mm or 6.0 sq mm for heavy continuous loads like 1.5T/2.0T air conditioners and water heaters.",
      "Choose FR-LSH (Low Smoke Low Halogen) over standard FR in enclosed residential and multi-storey towers to protect visibility during emergencies."
    ],
    sections: [
      {
        heading: "1. Understanding Conductor Area & Current Carrying Capacity",
        content: "Under Indian Standard IS 694, copper building wires are categorized by their nominal cross-sectional conductor area (sq mm). Pure electrolytic annealed copper (>99.97% purity) ensures minimal electrical resistance and maximum thermal conductivity.",
        recommendations: [
          "0.75 sq mm: Low current signaling, bell circuits, and decorative chandelier wiring (up to 7 Amps).",
          "1.0 sq mm: Dedicated domestic lighting and ceiling fan point wiring (up to 11 Amps).",
          "1.5 sq mm: Main circuit wiring connecting the distribution board to switchboards (up to 14 Amps).",
          "2.5 sq mm: Power socket points for microwave ovens, irons, and desktop computers (up to 19 Amps).",
          "4.0 sq mm: Split air conditioners up to 2 Tons, 25L storage water heaters, and induction hobs (up to 26 Amps).",
          "6.0 sq mm: Main service feeder from meter box to main distribution board, or EV charging wallboxes (up to 34 Amps)."
        ]
      },
      {
        heading: "2. Flame Retardant (FR) vs. FR-LSH Insulation Compounds",
        content: "Modern building codes distinguish between standard Flame Retardant (FR) and Flame Retardant Low Smoke Low Halogen (FR-LSH) PVC compounds. Standard FR self-extinguishes when the flame source is removed, but releases dense black smoke and acidic halogen gases. FR-LSH incorporates aluminium trihydrate or magnesium hydroxide fillers that emit water vapour when heated, significantly suppressing smoke and reducing toxic gas emissions by over 70%."
      },
      {
        heading: "3. Voltage Drop Calculations Across Long Runs",
        content: "In large homes and agricultural installations across Tamil Nadu, long cable runs cause voltage drop that can damage pump motors and electronic compressor drives. For circuit runs exceeding 20 meters, always step up the conductor size by one nominal tier (e.g. use 4.0 sq mm instead of 2.5 sq mm) to ensure supply voltage stays within ±5% of 230V AC."
      }
    ],
    relatedCategorySlug: "wires-cables",
    relatedBrandSlugs: ["polycab", "finolex"]
  },
  "mcb-rccb-guide": {
    slug: "mcb-rccb-guide",
    title: "MCB vs. RCCB: Complete Circuit Protection & Human Shock Safety Guide",
    metaTitle: "MCB vs RCCB Sizing & Installation Guide | Legrand & Schneider | Vee Power",
    metaDescription: "Learn how Miniature Circuit Breakers (MCB) and Residual Current Circuit Breakers (RCCB) work together to prevent electrical fires and fatal electric shocks.",
    canonicalUrl: "https://veepowerelectricals.com/guides/mcb-rccb-guide",
    publishDate: "2026-01-20",
    readingTime: "6 min read",
    category: "MCB & Protection",
    summary: "Many homeowners confuse MCBs and RCCBs, assuming an MCB protects against electric shock. This technical guide explains the fundamental operational differences and how to correctly size both devices for complete distribution board safety.",
    keyTakeaways: [
      "MCBs protect equipment and cabling against overcurrent and short-circuits; they DO NOT protect human life from electric shock.",
      "RCCBs detect residual current leaking to earth and trip within 30 milliseconds to prevent fatal cardiac electrocution.",
      "A 30mA RCCB sensitivity is mandatory for all residential domestic socket circuits.",
      "Always install Type C tripping curve MCBs for air conditioners, refrigerators, and motors to tolerate inrush currents."
    ],
    sections: [
      {
        heading: "1. How a Miniature Circuit Breaker (MCB) Works",
        content: "An MCB incorporates two tripping mechanisms: a bimetallic strip that deflects slowly during sustained thermal overloads, and a magnetic solenoid that trips almost instantaneously (<10 milliseconds) during high-current short circuits. Standard residential MCBs feature a 6kA or 10kA short-circuit breaking capacity, safely quenching massive electrical arc faults inside an arc chute."
      },
      {
        heading: "2. Why Every Home Requires a 30mA RCCB",
        content: "If a person touches an energized appliance chassis (such as a faulty washing machine or geyser), current flows through their body to the ground. An MCB will not trip because human electrocution current (50mA to 200mA) is far below an MCB's 16A or 32A rating. An RCCB uses a toroidal Core Balance Current Transformer (CBCT) comparing Phase and Neutral currents. If a differential of 30mA occurs, the RCCB trips instantly, disconnecting the supply before ventricular fibrillation occurs."
      },
      {
        heading: "3. Recommended Distribution Board Hierarchy",
        content: "A professional distribution board setup should feature: 1) A Main 2-Pole or 4-Pole Isolator, 2) A 30mA Residual Current Device (RCCB), and 3) Individual Single Pole (SP) Type C MCBs sized for each dedicated room circuit (6A/10A for lighting, 16A/20A/25A for power)."
      }
    ],
    relatedCategorySlug: "mcb-protection",
    relatedBrandSlugs: ["legrand", "schneider"]
  },
  "modular-switches-guide": {
    slug: "modular-switches-guide",
    title: "Modular Switches & Designer Faceplates: Architect & Electrician Buying Guide",
    metaTitle: "Modular Switches Buying Guide | Legrand & Schneider | Vee Power",
    metaDescription: "Guide to selecting premium modular switches, 6A/16A shuttered sockets, USB chargers, and plate configurations from Legrand and Schneider Electric.",
    canonicalUrl: "https://veepowerelectricals.com/guides/modular-switches-guide",
    publishDate: "2026-02-01",
    readingTime: "5 min read",
    category: "Switches",
    summary: "Modern modular wiring devices combine robust engineering safety with refined interior architecture. Learn how to plan module grids, choose spark-free contacts, and ensure child safety.",
    keyTakeaways: [
      "Select virgin UV-stabilized engineering polycarbonate plates that resist yellowing, scratching, and high temperatures.",
      "Ensure all 3-pin power sockets have built-in child-safety shutters.",
      "Choose switches with silver-cadmium oxide contacts tested for over 100,000 switching operations.",
      "Calculate module box sizes accurately (1, 2, 3, 4, 6, 8, 12, or 18 modules) before plastering walls."
    ],
    sections: [
      {
        heading: "1. Calculating Grid Module Sizes",
        content: "Modular systems are sized in standardized 'Modules' (M). A standard 1-way switch takes 1M. A combined 6A/16A universal socket takes 2M. A step fan regulator takes 2M. An RJ45 internet data socket takes 1M. When planning switchboard cutouts, always leave at least 1 or 2 spare module spaces for future smart home or charging upgrades."
      },
      {
        heading: "2. Contact Metallurgy and Spark Prevention",
        content: "Cheap switches use brass-on-brass contacts that pit and oxidize quickly, causing heat build-up and intermittent sparks. Premium Legrand and Schneider switches utilize silver-plated copper alloy terminal cages and silver-cadmium or silver-nickel inlaid contact buttons, delivering low contact resistance and zero spark erosion over decades."
      }
    ],
    relatedCategorySlug: "switches",
    relatedBrandSlugs: ["legrand", "schneider"]
  },
  "led-lighting-guide": {
    slug: "led-lighting-guide",
    title: "LED Lighting Wattage, Lumens & Color Temperature Guide for Homes & Offices",
    metaTitle: "LED Lighting Wattage & Lumens Guide | Philips | Vee Power",
    metaDescription: "Understand lumens vs watts, color temperatures (3000K, 4000K, 6500K), and EyeComfort flicker-free lighting metrics by Philips for residential and office projects.",
    canonicalUrl: "https://veepowerelectricals.com/guides/led-lighting-guide",
    publishDate: "2026-02-05",
    readingTime: "6 min read",
    category: "LED & Lighting",
    summary: "Forget buying lights by watts alone. In the LED era, lumens measure true brightness while Kelvin ratings determine ambiance and productivity.",
    keyTakeaways: [
      "Lumens measure light output, while watts measure energy consumed. Look for high luminous efficacy (>100 lumens/watt).",
      "Use 6500K (Cool Day Light) for kitchens, study desks, and offices to enhance alertness.",
      "Use 3000K (Warm White) for bedrooms and dining rooms to create an inviting, restful evening environment.",
      "Choose Philips EyeComfort LED lights to eliminate invisible high-frequency flicker that causes eye strain and headaches."
    ],
    sections: [
      {
        heading: "1. Lumens vs. Watts: The True Measure of Brightness",
        content: "An incandescent 60W bulb produced around 800 lumens. A high-efficiency Philips 9W LED bulb produces the exact same 800-850 lumens, saving over 85% electricity. Always evaluate the luminous efficacy (lumens per watt) to ensure you are buying high-grade LED dies rather than inefficient legacy chips."
      },
      {
        heading: "2. Color Temperature (Kelvin) Guide for Rooms",
        content: "Light color is measured on the Kelvin (K) scale: Warm White (2700K - 3000K) produces a golden sunset glow ideal for living spaces and bedrooms. Neutral White (4000K) replicates midday natural sunlight, perfect for retail showrooms and modern kitchens. Cool Day Light (6500K) produces crisp white light ideal for office workstations, reading corners, and medical clinics."
      }
    ],
    relatedCategorySlug: "led-lighting",
    relatedBrandSlugs: ["philips"]
  },
  "bldc-ceiling-fans-guide": {
    slug: "bldc-ceiling-fans-guide",
    title: "BLDC Ceiling Fans vs. Induction Fans: Power Savings & Inverter Performance",
    metaTitle: "BLDC Ceiling Fan Energy Savings Guide | Havells & Crompton | Vee Power",
    metaDescription: "Discover how Brushless DC (BLDC) ceiling fans consume only 28W-35W, run 3x longer on inverters, and pay for themselves in electricity savings.",
    canonicalUrl: "https://veepowerelectricals.com/guides/bldc-ceiling-fans-guide",
    publishDate: "2026-02-10",
    readingTime: "5 min read",
    category: "Fans",
    summary: "With rising domestic electricity tariffs across Tamil Nadu, upgrading traditional 75W induction ceiling fans to 28W-35W BLDC motor fans delivers substantial annual savings.",
    keyTakeaways: [
      "BLDC fans consume 28W to 35W at full speed compared to 75W for standard induction fans (saving 55% to 65% power).",
      "BLDC fans run up to 3 times longer on home inverters without humming or overheating.",
      "Equipped with permanent neodymium magnets and smart electronic microcontrollers for consistent speed even during low-voltage drops (140V-260V).",
      "Payback period on electricity savings is typically 14 to 18 months per fan."
    ],
    sections: [
      {
        heading: "1. How BLDC Motors Operate",
        content: "Traditional induction fans use copper rotor windings that generate significant heat and energy loss. BLDC motors replace mechanical brushes and rotor coils with permanent neodymium magnets and an electronic inverter drive. The motor receives precisely commutated direct current, eliminating copper rotor losses and eliminating annoying motor hum."
      },
      {
        heading: "2. Annual Electricity Savings Calculation",
        content: "Assuming 14 hours of daily fan usage at ₹6 per unit: A 75W induction fan consumes 383 kWh/year (costing ~₹2,300). A 28W BLDC fan consumes 143 kWh/year (costing ~₹860). You save ~₹1,440 per fan every single year."
      }
    ],
    relatedCategorySlug: "fans",
    relatedBrandSlugs: ["havells", "crompton"]
  },
  "industrial-switchgear-guide": {
    slug: "industrial-switchgear-guide",
    title: "Industrial Switchgear & Motor Protection: MCCBs, Contactors & Overload Relays",
    metaTitle: "Industrial Switchgear & Motor Protection Guide | Schneider | Vee Power",
    metaDescription: "Guide to industrial electrical switchgear selection: Molded Case Circuit Breakers (MCCB), motor protection circuit breakers, and thermal overload relays.",
    canonicalUrl: "https://veepowerelectricals.com/guides/industrial-switchgear-guide",
    publishDate: "2026-02-15",
    readingTime: "7 min read",
    category: "MCB & Protection",
    summary: "Industrial plants, textile mills, and engineering workshops in Coimbatore and Tamil Nadu require specialized protection against motor stalling, phase loss, and high short-circuit fault currents.",
    keyTakeaways: [
      "Use MCCBs for current ratings above 63A and breaking capacities up to 50kA.",
      "Install Motor Protection Circuit Breakers (MPCBs) to protect three-phase induction motors from single phasing and locked rotor faults.",
      "Select Type 2 coordination between contactors and breakers to prevent equipment damage during short circuits."
    ],
    sections: [
      {
        heading: "1. MCCB vs MCB: When to Step Up",
        content: "While MCBs protect sub-circuits up to 63A, Molded Case Circuit Breakers (MCCBs) handle currents from 16A up to 1600A with adjustable thermal and magnetic trip settings, making them ideal for main incoming feeds and heavy industrial motor distribution."
      }
    ],
    relatedCategorySlug: "mcb-protection",
    relatedBrandSlugs: ["schneider", "legrand"]
  },
  "electrical-conduit-guide": {
    slug: "electrical-conduit-guide",
    title: "Conduit Pipes, Gang Boxes & Accessories: Complete Concealed Wiring Installation",
    metaTitle: "PVC Conduit Pipes & Flush Box Installation Guide | Vee Power",
    metaDescription: "Best practices for laying heavy-gauge rigid PVC conduit pipes, GI flush metal boxes, and pull boxes during concrete slab casting and wall chiseling.",
    canonicalUrl: "https://veepowerelectricals.com/guides/electrical-conduit-guide",
    publishDate: "2026-02-20",
    readingTime: "5 min read",
    category: "Electrical Accessories",
    summary: "Concealed wiring requires high-impact mechanical protection. Once concrete is poured and walls are plastered, fixing collapsed conduits is expensive. Learn the right standards.",
    keyTakeaways: [
      "Use heavy-mechanical-stress class rigid PVC conduits for concrete slab casting to resist concrete vibrators.",
      "Use medium-gauge conduits for brick wall chases and dry partitions.",
      "Limit conduit bends to maximum two 90-degree elbows between pull boxes to ensure smooth wire pulling."
    ],
    sections: [
      {
        heading: "1. Conduit Gauge Standards (IS 9537 Part 3)",
        content: "Light-gauge conduits crack under worker foot traffic and vibrator needles during roof casting. Always specify ISI-marked heavy-duty rigid PVC conduits with uniform wall thickness for all concrete structural casting."
      }
    ],
    relatedCategorySlug: "electrical-accessories",
    relatedBrandSlugs: []
  },
  "contractor-buying-guide": {
    slug: "contractor-buying-guide",
    title: "Electrical Contractor Procurement Guide: GST Invoicing, Project BOQs & Bulk Supply",
    metaTitle: "Electrical Contractor Wholesale Buying Guide | Vee Power Coimbatore",
    metaDescription: "How electrical contractors, builders, and MEP consultants can procure genuine electrical supplies with B2B GST tax credit and wholesale rates at Vee Power.",
    canonicalUrl: "https://veepowerelectricals.com/guides/contractor-buying-guide",
    publishDate: "2026-02-25",
    readingTime: "6 min read",
    category: "Wires & Cables",
    summary: "Optimizing electrical procurement requires balancing brand specifications, tax compliance, batch consistency, and site delivery timelines across project phases.",
    keyTakeaways: [
      "Procure in standardized master carton quantities (e.g. 90m wire coils in boxes of 4/8/12) for bulk discounts.",
      "Ensure all purchases carry 18% or 28% GST tax invoices for complete Input Tax Credit (ITC) claiming.",
      "Align phased site deliveries (Phase 1: Conduits & Boxes, Phase 2: Wires & DBs, Phase 3: Switches, Fans & Luminaires) to prevent site theft."
    ],
    sections: [
      {
        heading: "1. Staged Delivery Management for Construction Sites",
        content: "Never deliver switches and decorative fixtures during early masonry phases. Vee Power Electricals coordinates staged shipments from our Coimbatore warehouse directly to your site across Tamil Nadu according to your construction milestones."
      }
    ],
    relatedCategorySlug: "wires-cables",
    relatedBrandSlugs: ["polycab", "finolex", "havells", "legrand"]
  },
  "residential-electrical-safety-checklist": {
    slug: "residential-electrical-safety-checklist",
    title: "Residential Electrical Safety Checklist: 10 Critical Checks Every Homeowner Must Perform",
    metaTitle: "Residential Electrical Safety Checklist | Vee Power Coimbatore",
    metaDescription: "Perform an annual home electrical safety audit. Inspect earth grounding, test RCCB trip buttons, check wire temperatures, and prevent electrical fires.",
    canonicalUrl: "https://veepowerelectricals.com/guides/residential-electrical-safety-checklist",
    publishDate: "2026-03-01",
    readingTime: "5 min read",
    category: "MCB & Protection",
    summary: "Over 70% of residential fires originate from electrical short circuits, overloaded wiring, or failed earthing. This step-by-step checklist helps homeowners identify hidden hazards.",
    keyTakeaways: [
      "Press the 'Test' (T) button on your RCCB monthly to verify mechanical trip operation.",
      "Verify earth pit resistance is below 5 Ohms using a calibrated earth tester.",
      "Feel switchboard faceplates for abnormal warmth, indicating loose terminal screw connections.",
      "Never bypass a tripped MCB with wire jumpers."
    ],
    sections: [
      {
        heading: "1. The Monthly RCCB Test Button Procedure",
        content: "Every genuine RCCB features a small push button marked 'T' or 'Test'. When pressed while energized, it creates a safe internal simulated leakage current. If the breaker trips immediately, your human life safety mechanism is functional. If it fails to trip, replace the RCCB immediately."
      }
    ],
    relatedCategorySlug: "mcb-protection",
    relatedBrandSlugs: ["legrand", "schneider"]
  },
  "agricultural-submersible-pump-cable-guide": {
    slug: "agricultural-submersible-pump-cable-guide",
    title: "Agricultural Submersible Pump Cable & Motor Starter Sizing Guide",
    metaTitle: "Submersible Pump Cable & Starter Sizing Guide | Vee Power Coimbatore",
    metaDescription: "Guide to selecting 3-core flat submersible copper cables and DOL/Star-Delta motor starters for borewells in Coimbatore, Erode, and Tamil Nadu farms.",
    canonicalUrl: "https://veepowerelectricals.com/guides/agricultural-submersible-pump-cable-guide",
    publishDate: "2026-03-05",
    readingTime: "6 min read",
    category: "Wires & Cables",
    summary: "Agricultural borewells in the Kongu region often reach depths of 600 to 1200 feet. Submersible pump cables must operate continuously submerged under high water pressure while resisting voltage fluctuations.",
    keyTakeaways: [
      "Use 3-Core flat copper submersible cables with water-impermeable PVC outer sheathing.",
      "Calculate cable gauge based on both motor HP and total borewell depth to prevent winding burnout.",
      "Install motor starters equipped with single-phasing protection and dry-run sensors."
    ],
    sections: [
      {
        heading: "1. Choosing Cable Size Based on Depth and Motor Horsepower",
        content: "A 5 HP pump motor running at 400 feet depth requires minimum 2.5 sq mm cable. If the depth exceeds 800 feet, step up to 4.0 sq mm to compensate for voltage drop and ensure the motor receives full starting torque."
      }
    ],
    relatedCategorySlug: "wires-cables",
    relatedBrandSlugs: ["finolex", "polycab"]
  }
};
