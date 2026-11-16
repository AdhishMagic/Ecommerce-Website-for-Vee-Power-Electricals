export interface DistrictInfo {
  name: string;
  slug: string;
  majorTowns: string[];
  zone: "Western" | "Northern" | "Central" | "Southern" | "Delta / Coastal";
  deliveryTime: string;
  dispatchHub: string;
  logisticsPartners: string[];
  industryFocus: string;
  regionalContext: string;
  electricalRequirements: string[];
  isHeadquarters?: boolean;
}

export const TAMIL_NADU_DISTRICTS: Record<string, DistrictInfo> = {
  "coimbatore": {
    name: "Coimbatore",
    slug: "coimbatore",
    majorTowns: ["Gandhipuram", "RS Puram", "Peelamedu", "Saravanampatti", "Singanallur", "Pollachi", "Mettupalayam", "Sulur"],
    zone: "Western",
    deliveryTime: "Same-Day Dispatch / Local Store Pickup",
    dispatchHub: "Cross Cut Road, Gandhipuram (Vee Power HQ)",
    logisticsPartners: ["Local Fleet", "ST Courier", "Professional Couriers"],
    industryFocus: "Textile machinery, wet grinders, agricultural pump motors, automotive foundries, and IT corridors",
    regionalContext: "As the home headquarters of Vee Power Electricals, Coimbatore enjoys the fastest dispatch and local store pickup at our Cross Cut Road store. Serving electrical contractors, manufacturing units, and domestic builders across the Manchester of South India.",
    electricalRequirements: [
      "Heavy-duty 10kA MCBs and MCCBs for industrial textile machinery and foundry panels",
      "Pure copper FR-LSH cables (Polycab & Finolex) for domestic apartments in Saravanampatti and RS Puram",
      "Submersible pump cable and motor starter panels for Thondamuthur and Pollachi agricultural tracts"
    ],
    isHeadquarters: true
  },
  "tiruppur": {
    name: "Tiruppur",
    slug: "tiruppur",
    majorTowns: ["Avinashi", "Palladam", "Dharapuram", "Kangeyam", "Udumalaipettai"],
    zone: "Western",
    deliveryTime: "Same-Day / Within 24 Hours",
    dispatchHub: "Direct Coimbatore-Tiruppur Highway Route (45 km)",
    logisticsPartners: ["Direct Van Dispatch", "ST Courier", "ABT Parcel"],
    industryFocus: "Knitwear manufacturing, dyeing units, spinning mills, and commercial garment factories",
    regionalContext: "India's knitwear capital requires robust electrical infrastructure capable of handling continuous motor loads, commercial sewing machines, and chemical environments in dyeing facilities.",
    electricalRequirements: [
      "Flame-retardant industrial cabling for garment cutting and stitching floors",
      "Schneider and Legrand modular switches and IP-rated distribution enclosures",
      "High-velocity exhaust fans for heat ventilation in textile processing sheds"
    ]
  },
  "erode": {
    name: "Erode",
    slug: "erode",
    majorTowns: ["Bhavani", "Perundurai", "Gobichettipalayam", "Sathyamangalam", "Anthiyur"],
    zone: "Western",
    deliveryTime: "Within 24 Hours",
    dispatchHub: "NH 544 Express Corridor (85 km from HQ)",
    logisticsPartners: ["ST Courier", "ABT Parcel", "VRL Logistics"],
    industryFocus: "Turmeric processing, textile weaving, SIPCOT Perundurai industrial estate, and agricultural farming",
    regionalContext: "Known as the Turmeric City and a prominent textile powerhouse, Erode connects seamlessly with our Coimbatore logistics hub along NH 544.",
    electricalRequirements: [
      "3-Core flat submersible copper cables for agricultural borewells across Gobichettipalayam",
      "Industrial distribution boards and MCCBs for SIPCOT Perundurai processing units",
      "Energy-saving LED high-bay and batten lighting for textile godowns"
    ]
  },
  "the-nilgiris": {
    name: "The Nilgiris",
    slug: "the-nilgiris",
    majorTowns: ["Udhagamandalam (Ooty)", "Coonoor", "Kotagiri", "Gudalur", "Wellington"],
    zone: "Western",
    deliveryTime: "Within 24 Hours",
    dispatchHub: "Mettupalayam Mountain Highway (Coimbatore Hub)",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Tea manufacturing factories, luxury hospitality resorts, horticulture, and heritage residential properties",
    regionalContext: "The high-altitude Western Ghats environment experiences heavy monsoons and high humidity, making moisture-proof electrical installations paramount.",
    electricalRequirements: [
      "IP65 weather-resistant outdoor fittings and moisture-resistant FR-LSH cables",
      "Human safety 30mA RCCBs for heritage wooden cottages and resort bungalows",
      "Heavy-duty heating and water heater switches (16A / 25A) for cold climate operations"
    ]
  },
  "salem": {
    name: "Salem",
    slug: "salem",
    majorTowns: ["Attur", "Mettur", "Omalur", "Sankari", "Edappadi", "Yercaud"],
    zone: "Western",
    deliveryTime: "Within 24 Hours",
    dispatchHub: "NH 544 Direct Corridor (160 km from HQ)",
    logisticsPartners: ["VRL Logistics", "ABT Parcel", "ST Courier"],
    industryFocus: "Steel manufacturing, sago processing, textile power looms, and Mettur thermal/chemical belt",
    regionalContext: "A major commercial junction connecting western and northern Tamil Nadu, Salem's steel and manufacturing base relies on heavy-grade electrical components.",
    electricalRequirements: [
      "Heavy industrial switchgear and 10kA breaking capacity circuit breakers for foundry operations",
      "FR copper wires from Polycab and Finolex for modern housing layouts",
      "High-output LED floodlights for factory perimeters and commercial yards"
    ]
  },
  "namakkal": {
    name: "Namakkal",
    slug: "namakkal",
    majorTowns: ["Tiruchengode", "Rasipuram", "Paramathi Velur", "Komarapalayam"],
    zone: "Central",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Coimbatore Hub via Tiruchengode Route",
    logisticsPartners: ["ST Courier", "ABT Parcel"],
    industryFocus: "Poultry farming, lorry body building, borewell rig manufacturing, and educational institutions",
    regionalContext: "As India's leading poultry hub and transport centre, Namakkal requires reliable climate-controlled electricals for automated poultry sheds and transport workshops.",
    electricalRequirements: [
      "Heavy-duty industrial exhaust fans for poultry shed ventilation",
      "Rigid PVC conduits and weather-proof distribution panels",
      "Finolex 3-core submersible cables for borewell truck installations"
    ]
  },
  "karur": {
    name: "Karur",
    slug: "karur",
    majorTowns: ["Kulithalai", "Aravakurichi", "Pugalur", "Krishnarayapuram"],
    zone: "Central",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Coimbatore-Kangeyam-Karur Route (130 km)",
    logisticsPartners: ["ABT Parcel", "ST Courier"],
    industryFocus: "Home textile exports, paper manufacturing (TNPL Pugalur), bus body building, and gem processing",
    regionalContext: "Karur is India's home textile export capital, where export factories require strict IS-standard electricals to clear international buyer safety audits.",
    electricalRequirements: [
      "Certified FR-LSH low-smoke copper cables to comply with export factory fire norms",
      "BEE 5-star rated BLDC fans for textile weaving and stitching floors",
      "Legrand modular wiring devices for commercial export administration offices"
    ]
  },
  "dindigul": {
    name: "Dindigul",
    slug: "dindigul",
    majorTowns: ["Palani", "Kodaikanal", "Oddanchatram", "Natham", "Vedasandur"],
    zone: "Central",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Coimbatore-Pollachi-Dindigul Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Tannery units, agricultural wholesale markets (Oddanchatram), lock manufacturing, and hill tourism in Kodaikanal",
    regionalContext: "Connecting the Kongu belt with southern districts, Dindigul features diverse electrical demands ranging from agricultural markets to high-altitude hospitality in Kodaikanal.",
    electricalRequirements: [
      "Moisture-sealed switches and insulated cables for Kodaikanal resorts",
      "Agricultural pump starters and copper wiring for Oddanchatram vegetable belt",
      "Industrial lighting and surge-protected distribution panels for tannery units"
    ]
  },
  "madurai": {
    name: "Madurai",
    slug: "madurai",
    majorTowns: ["Melur", "Thirumangalam", "Usilampatti", "Vadipatti", "Sholavandan"],
    zone: "Southern",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Coimbatore-Dindigul-Madurai 4-Lane Highway",
    logisticsPartners: ["ST Courier", "ABT Parcel", "Professional Couriers"],
    industryFocus: "Automotive components (TVS group), rubber industries, textile spinning, healthcare, and educational hubs",
    regionalContext: "The cultural and commercial capital of Southern Tamil Nadu, Madurai has a rapidly growing residential and medical tourism sector requiring certified electrical safety gear.",
    electricalRequirements: [
      "Medical-grade surge protection and 30mA RCCBs for hospitals and clinics",
      "Legrand and Schneider modular switches for multi-storey residential projects",
      "Crompton and Havells high-speed fans for commercial markets around Meenakshi Amman Temple"
    ]
  },
  "tiruchirappalli": {
    name: "Tiruchirappalli",
    slug: "tiruchirappalli",
    majorTowns: ["Srirangam", "Thiruverumbur", "Manapparai", "Musiri", "Lalgudi"],
    zone: "Central",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Coimbatore-Karur-Trichy NH 81 Corridor",
    logisticsPartners: ["ABT Parcel", "ST Courier", "VRL Logistics"],
    industryFocus: "Heavy engineering (BHEL ancillary cluster), fabrication, defense production, and central educational hub (NIT Trichy)",
    regionalContext: "Situated in the exact geographic heart of Tamil Nadu, Trichy's heavy boiler and fabrication ancillary units require robust industrial switchgear.",
    electricalRequirements: [
      "Heavy industrial MCCBs and busbar distribution systems for fabrication workshops",
      "Low-smoke halogen-free (FR-LSH) Polycab wiring for educational campuses",
      "High-lumen Philips LED floodlights and commercial high-bay luminaires"
    ]
  },
  "chennai": {
    name: "Chennai",
    slug: "chennai",
    majorTowns: ["OMR IT Corridor", "Ambattur", "Guindy", "Sriperumbudur", "Anna Nagar", "T. Nagar", "Velachery", "Tambaram"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours via Express Courier",
    dispatchHub: "Daily Express Route to Chennai Central Hub",
    logisticsPartners: ["Professional Couriers", "ST Courier", "Delhivery", "Blue Dart"],
    industryFocus: "IT/ITeS software parks, automotive manufacturing, ports, healthcare, and luxury high-rise residential towers",
    regionalContext: "Tamil Nadu's capital city demands premium modular switches, anti-corrosive coastal electrical fittings, and high-spec building wires for residential and IT facilities.",
    electricalRequirements: [
      "Corrosion-resistant copper wiring and terminals for coastal humidity protection",
      "Legrand Arteor and Mylinc designer switch collections for modern apartments",
      "Schneider Acti9 circuit breakers for commercial IT server racks and corporate offices"
    ]
  },
  "chengalpattu": {
    name: "Chengalpattu",
    slug: "chengalpattu",
    majorTowns: ["Mahabalipuram", "Maraimalai Nagar", "Maduranthakam", "Tambaram South", "Kelambakkam"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Chennai Hub Route",
    logisticsPartners: ["ST Courier", "Delhivery"],
    industryFocus: "Automobile manufacturing (Mahindra World City), coastal resorts, and expanding urban residential townships",
    regionalContext: "Home to major industrial SEZs and expanding suburban housing, Chengalpattu bridges Chennai with industrial manufacturing hubs.",
    electricalRequirements: [
      "High-specification industrial cabling for Mahindra World City manufacturing units",
      "Outdoor weather-proof IP65 lighting for Mahabalipuram resorts",
      "Domestic FR copper wires for new township projects along GST Road"
    ]
  },
  "kancheepuram": {
    name: "Kancheepuram",
    slug: "kancheepuram",
    majorTowns: ["Sriperumbudur", "Walajabad", "Uthiramerur", "Kundrathur"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Chennai Corridor Hub",
    logisticsPartners: ["ST Courier", "ABT Parcel"],
    industryFocus: "Silk saree weaving, Sriperumbudur electronics and automotive industrial corridor (Samsung, Hyundai)",
    regionalContext: "Famous for traditional silk weaving and modern global automotive/electronics manufacturing clusters at Sriperumbudur.",
    electricalRequirements: [
      "Clean-power distribution boards and surge protectors for electronic assembly lines",
      "Energy-saving LED battens for handloom and powerloom silk weaving sheds",
      "Finolex flame-retardant building wires for residential layouts"
    ]
  },
  "tiruvallur": {
    name: "Tiruvallur",
    slug: "tiruvallur",
    majorTowns: ["Avadi", "Poonamallee", "Gummidipoondi", "Tiruttani", "Ponneri"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Chennai North Hub",
    logisticsPartners: ["ST Courier", "VRL Logistics"],
    industryFocus: "Heavy vehicle manufacturing (HVF Avadi), SIPCOT Gummidipoondi industrial estate, and North Chennai logistics parks",
    regionalContext: "Tiruvallur accommodates defense factories, steel fabrication units, and plastics manufacturers requiring certified electrical supplies.",
    electricalRequirements: [
      "Heavy industrial switchgear and 10kA MCBs for Gummidipoondi factories",
      "Robust PVC conduit systems for multi-storey residential projects in Poonamallee",
      "High-bay industrial LED lights for logistics warehouses"
    ]
  },
  "vellore": {
    name: "Vellore",
    slug: "vellore",
    majorTowns: ["Katpadi", "Gudiyatham", "Anaicut", "Kaniyambadi"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "NH 48 Hub Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Leather tanning, medical institutions (CMC Vellore), educational centres (VIT), and match manufacturing",
    regionalContext: "Known for premier medical institutions and leather export tanning clusters, requiring certified safety electrical gear.",
    electricalRequirements: [
      "Human safety 30mA RCCBs and clean earthing accessories for hospital facilities",
      "Acid-resistant conduit pipes and heavy copper wiring for leather processing units",
      "Modular switches and fans for student hostel accommodations"
    ]
  },
  "ranipet": {
    name: "Ranipet",
    slug: "ranipet",
    majorTowns: ["Walajah", "Arcot", "Arakkonam", "Nemili"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Vellore-Ranipet Regional Hub",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "BHEL Boiler Auxiliaries Plant, leather chemical industries, and Arakkonam railway junction facilities",
    regionalContext: "An industrial district carved out of Vellore, hosting boiler manufacturing and chemical processing facilities.",
    electricalRequirements: [
      "Industrial flame-proof enclosures and high-breaking-capacity switchgear",
      "FR copper wires from Polycab and Finolex for domestic housing",
      "Philips commercial downlights for corporate administrative offices"
    ]
  },
  "tirupathur": {
    name: "Tirupathur",
    slug: "tirupathur",
    majorTowns: ["Vaniyambadi", "Ambur", "Jolarpettai", "Natrampalli"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Salem-Tirupathur Highway Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Finished leather and footwear exports (Ambur/Vaniyambadi), sandalwood trade, and railway junctions",
    regionalContext: "The footwear export hub of India, where high-output factory operations necessitate certified electrical safety systems.",
    electricalRequirements: [
      "Flame-retardant low-smoke cabling for export footwear manufacturing units",
      "Legrand 16A/20A heavy-duty modular switches for sewing machinery",
      "BEE 5-star ceiling fans for production floors"
    ]
  },
  "dharmapuri": {
    name: "Dharmapuri",
    slug: "dharmapuri",
    majorTowns: ["Palacode", "Pennagaram", "Harur", "Karimangalam"],
    zone: "Western",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Salem-Dharmapuri NH 44 Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Horticulture, mango pulp processing, sericulture, and granites",
    regionalContext: "A major agricultural and horticulture district connecting Tamil Nadu with Bengaluru via the NH 44 corridor.",
    electricalRequirements: [
      "Submersible pump cables and motor starters for orchard drip irrigation",
      "Energy-efficient LED lighting for agricultural packing sheds",
      "Standard residential FR copper wiring for town housing developments"
    ]
  },
  "krishnagiri": {
    name: "Krishnagiri",
    slug: "krishnagiri",
    majorTowns: ["Hosur", "Pochampalli", "Uthangarai", "Bargur", "Denkanikottai"],
    zone: "Northern",
    deliveryTime: "Within 24 Hours (Express via NH 44)",
    dispatchHub: "Hosur Industrial Route",
    logisticsPartners: ["VRL Logistics", "ST Courier", "Delhivery"],
    industryFocus: "Automotive and EV manufacturing hub (Hosur - TVS, Ashok Leyland, Ather, Ola), electronics, and floriculture",
    regionalContext: "Hosur is Tamil Nadu's fastest growing EV and precision engineering corridor bordering Bengaluru, with intense industrial electrical demand.",
    electricalRequirements: [
      "High-power MCCBs, busbars, and DIN-rail breakers for EV assembly plants",
      "Certified Polycab FR-LSH cables for precision electronics clean rooms",
      "Architectural Legrand modular switches for modern residential gated communities"
    ]
  },
  "tiruvannamalai": {
    name: "Tiruvannamalai",
    slug: "tiruvannamalai",
    majorTowns: ["Arani", "Chengam", "Polur", "Cheyyar", "Vandavasi"],
    zone: "Northern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Tiruvannamalai Regional Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Arani silk sarees, Cheyyar SIPCOT footwear SEZ, rice mills, and spiritual tourism",
    regionalContext: "A blend of spiritual tourism, modern Cheyyar industrial footwear estates, and traditional Arani silk weaving clusters.",
    electricalRequirements: [
      "High-bay LED lights and motor starters for modern rice milling plants",
      "Low-smoke halogen-free cables for Cheyyar SEZ international factories",
      "Havells and Crompton fans for ashrams, pilgrim guest houses, and hotels"
    ]
  },
  "viluppuram": {
    name: "Viluppuram",
    slug: "viluppuram",
    majorTowns: ["Tindivanam", "Gingee", "Vanur", "Vikravandi"],
    zone: "Delta / Coastal",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Trichy-Viluppuram NH 38 Corridor",
    logisticsPartners: ["ST Courier", "ABT Parcel"],
    industryFocus: "Agriculture, sugar mills, Tindivanam SIPCOT food processing park, and historical tourism",
    regionalContext: "A major agricultural and railway junction connecting central Tamil Nadu with Chennai and Puducherry.",
    electricalRequirements: [
      "Heavy motor protection relays and circuit breakers for sugar factories",
      "Submersible pump cables for sugarcane cultivation",
      "Domestic FR building wires for residential housing layouts"
    ]
  },
  "kallakurichi": {
    name: "Kallakurichi",
    slug: "kallakurichi",
    majorTowns: ["Sankarapuram", "Ulundurpet", "Chinnasalem", "Tirukkoyilur"],
    zone: "Central",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Salem-Ulundurpet Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Modern rice mills, sugarcane cultivation, poultry farming, and agro-processing",
    regionalContext: "An agrarian district with numerous modern automated rice mills requiring dependable industrial power equipment.",
    electricalRequirements: [
      "Three-phase motor starters and capacitors for agricultural mills",
      "Polycab FR copper wires for domestic electrification",
      "IP-rated distribution boxes for agricultural farm setups"
    ]
  },
  "cuddalore": {
    name: "Cuddalore",
    slug: "cuddalore",
    majorTowns: ["Chidambaram", "Panruti", "Neyveli", "Vridhachalam", "Tittakudi"],
    zone: "Delta / Coastal",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Delta Coastal Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "NLC India lignite mining & thermal power (Neyveli), ceramic clays (Vridhachalam), coastal fishing, and jackfruit trade (Panruti)",
    regionalContext: "Home to Neyveli Lignite Corporation and extensive coastal belts where industrial power and marine-grade corrosion protection are vital.",
    electricalRequirements: [
      "Corrosion-resistant copper wiring for high-salinity coastal environments",
      "Heavy industrial switchgear and safety breakers for thermal ancillary units",
      "Ceramic factory high-temperature wiring solutions"
    ]
  },
  "perambalur": {
    name: "Perambalur",
    slug: "perambalur",
    majorTowns: ["Kunnam", "Veppanthattai", "Alathur"],
    zone: "Central",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Trichy-Perambalur NH 38 Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Cotton farming, maize production, sugar mills, and educational institutions",
    regionalContext: "Located along the central highway corridor, supporting agro-industries and expanding educational campuses.",
    electricalRequirements: [
      "Submersible pump cables for cotton and maize cultivation",
      "Campus wiring solutions with FR-LSH low smoke cables",
      "Energy-efficient LED lighting for commercial establishments"
    ]
  },
  "ariyalur": {
    name: "Ariyalur",
    slug: "ariyalur",
    majorTowns: ["Jayankondam", "Sendurai", "Udayarpalayam"],
    zone: "Central",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Trichy Hub Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Cement manufacturing hub (Ramco, UltraTech, Dalmia), limestone mining, and cashew processing",
    regionalContext: "The cement capital of South India, characterized by heavy dust environments and continuous heavy industrial conveyor loads.",
    electricalRequirements: [
      "Dust-tight IP65 electrical enclosures and 10kA heavy-duty circuit breakers",
      "High-abrasion resistant copper cables for cement plant ancillary operations",
      "High-bay industrial lighting for mining and packaging units"
    ]
  },
  "thanjavur": {
    name: "Thanjavur",
    slug: "thanjavur",
    majorTowns: ["Kumbakonam", "Pattukkottai", "Orathanadu", "Thiruvaiyaru"],
    zone: "Delta / Coastal",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Trichy-Thanjavur Expressway",
    logisticsPartners: ["ST Courier", "ABT Parcel"],
    industryFocus: "Paddy cultivation (Rice Bowl of Tamil Nadu), brass and bronze handicrafts, heritage tourism, and modern rice mills",
    regionalContext: "The cultural heartland and agricultural powerhouse of the Cauvery Delta, with large-scale agricultural and heritage electrical requirements.",
    electricalRequirements: [
      "High-reliability motor starters and submersible cables for delta agriculture",
      "Architectural modular switches and warm LED lighting for heritage residences and resorts",
      "Havells energy-saving ceiling fans for humid delta conditions"
    ]
  },
  "mayiladuthurai": {
    name: "Mayiladuthurai",
    slug: "mayiladuthurai",
    majorTowns: ["Sirkazhi", "Tharangambadi", "Kuthalam", "Poompuhar"],
    zone: "Delta / Coastal",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Delta Coastal Route via Trichy",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Paddy farming, coastal fisheries, temple tourism, and handloom weaving",
    regionalContext: "Carved from Nagapattinam, this delta coastal district experiences tropical maritime weather and extensive temple pilgrim footfall.",
    electricalRequirements: [
      "Weather-sealed outdoor switches and marine-grade wiring for coastal humidity",
      "High-efficiency LED illumination for temple complexes and community halls",
      "Polycab and Finolex residential FR wires for delta homes"
    ]
  },
  "nagapattinam": {
    name: "Nagapattinam",
    slug: "nagapattinam",
    majorTowns: ["Velankanni", "Kilvelur", "Vedaranyam", "Thirukkuvalai"],
    zone: "Delta / Coastal",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Coastal Hub via Trichy",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Marine fishing, port activities, salt pans (Vedaranyam), and international pilgrimage (Velankanni)",
    regionalContext: "A prominent coastal district requiring strict anti-corrosion protection against saline marine sea breezes and cyclones.",
    electricalRequirements: [
      "Saline-resistant UV-stabilized polycarbonate switches and sealed junction boxes",
      "Heavy-duty marine pump cables and cold storage power protection",
      "BEE 5-star fans and LED lighting for hotels and pilgrim hostels in Velankanni"
    ]
  },
  "tiruvarur": {
    name: "Tiruvarur",
    slug: "tiruvarur",
    majorTowns: ["Mannargudi", "Thiruthuraipoondi", "Needamangalam", "Valangaiman"],
    zone: "Delta / Coastal",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Trichy-Tiruvarur Corridor",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Intensive paddy cultivation, ONGC oil and gas extraction fields, and modern agro-processing",
    regionalContext: "Deep in the Cauvery delta, supporting heavy agricultural pumping alongside ONGC petroleum drilling sites.",
    electricalRequirements: [
      "Flame-proof and explosion-proof electrical equipment for gas exploration zones",
      "Agricultural pump cables and automated water starter switches",
      "Domestic FR building wires for residential developments"
    ]
  },
  "pudukkottai": {
    name: "Pudukkottai",
    slug: "pudukkottai",
    majorTowns: ["Aranthangi", "Alangudi", "Illuppur", "Gandarvakottai"],
    zone: "Central",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Trichy-Pudukkottai Route",
    logisticsPartners: ["ST Courier", "ABT Parcel"],
    industryFocus: "SIPCOT Mathur engineering units, granite quarrying, coir manufacturing, and agriculture",
    regionalContext: "Rich in heritage and stone quarrying, with industrial estates at Mathur requiring reliable factory power infrastructure.",
    electricalRequirements: [
      "Heavy industrial switchgear for granite cutting and coir processing machinery",
      "Finolex and Polycab building wires for Chettinad heritage renovations",
      "Low-power LED battens and bulbs for rural electrification"
    ]
  },
  "sivaganga": {
    name: "Sivaganga",
    slug: "sivaganga",
    majorTowns: ["Karaikudi", "Devakottai", "Manamadurai", "Tiruppuvanam", "Kalayar Kovil"],
    zone: "Southern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Madurai-Karaikudi Highway Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Chettinad heritage mansions, Karaikudi educational and scientific institutes (CECRI), and clay pottery (Manamadurai)",
    regionalContext: "World-renowned for majestic Chettinad architectural mansions and electro-chemical research at CSIR-CECRI.",
    electricalRequirements: [
      "Premium modular switches (Legrand Arteor and Mylinc) for heritage palace restorations",
      "Corrosion-resistant copper wiring compliant with research laboratory standards",
      "Energy-saving BLDC decorative ceiling fans suited for dry southern heat"
    ]
  },
  "ramanathapuram": {
    name: "Ramanathapuram",
    slug: "ramanathapuram",
    majorTowns: ["Rameswaram", "Paramakudi", "Kilakarai", "Mandapam", "Mudukulathur"],
    zone: "Southern",
    deliveryTime: "36 to 48 Hours",
    dispatchHub: "Madurai-Ramanathapuram NH 87 Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Marine fishing, thermal power generation, pilgrimage tourism in Rameswaram, and dry chilli spice trade",
    regionalContext: "Surrounded by the Indian Ocean and Gulf of Mannar, extreme maritime salinity demands maximum environmental sealing.",
    electricalRequirements: [
      "Marine-grade anti-corrosion switches and stainless-steel screw electrical devices",
      "High-durability outdoor LED floodlights for boat jetties and fish drying yards",
      "Heavy-duty ceiling fans with anti-rust coatings for coastal pilgrim lodges"
    ]
  },
  "virudhunagar": {
    name: "Virudhunagar",
    slug: "virudhunagar",
    majorTowns: ["Sivakasi", "Rajapalayam", "Aruppukkottai", "Srivilliputhur", "Sattur"],
    zone: "Southern",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Madurai-Virudhunagar Corridor",
    logisticsPartners: ["ST Courier", "ABT Parcel", "VRL Logistics"],
    industryFocus: "Printing, packaging, fireworks safety (Sivakasi), textile spinning mills (Rajapalayam), and surgical cotton",
    regionalContext: "Sivakasi produces over 80% of India's printing and safety matches, demanding strict fire-prevention electrical installations.",
    electricalRequirements: [
      "Strict Flame Retardant (FR-LSH) low-smoke copper cables to prevent factory fire hazards",
      "Spark-free silver-contact modular switches for printing and packaging facilities",
      "High-reliability MCBs and RCCBs for Rajapalayam cotton spinning mills"
    ]
  },
  "theni": {
    name: "Theni",
    slug: "theni",
    majorTowns: ["Periyakulam", "Bodinayakanur", "Cumbum", "Uthamapalayam", "Andipatti"],
    zone: "Southern",
    deliveryTime: "Within 24 to 36 Hours",
    dispatchHub: "Coimbatore-Pollachi-Dindigul-Theni Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Cardamom and spice trade (Bodinayakanur - Cardamom City), grape and banana agriculture (Cumbum Valley), and textile spinning",
    regionalContext: "Nestled in the Western Ghats foothills, Bodinayakanur and Cumbum Valley are major agro-processing and spice auction centres.",
    electricalRequirements: [
      "Submersible pump cables and drip irrigation motor starters for valley cultivation",
      "Moisture-proof wiring and ventilation exhaust fans for cardamom curing sheds",
      "Polycab building wires for residential and commercial expansion"
    ]
  },
  "thoothukudi": {
    name: "Thoothukudi",
    slug: "thoothukudi",
    majorTowns: ["Kovilpatti", "Tiruchendur", "Kayalpattinam", "Ettayapuram", "Vilathikulam"],
    zone: "Southern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Madurai-Thoothukudi Port Expressway",
    logisticsPartners: ["ST Courier", "VRL Logistics", "ABT Parcel"],
    industryFocus: "VO Chidambaranar Port, thermal power plants, chemical fertilizer plants (SPIC), salt pans, and match factories (Kovilpatti)",
    regionalContext: "Major deepwater port and industrial hub with heavy coastal exposure, chemical manufacturing, and maritime trade.",
    electricalRequirements: [
      "Heavy industrial switchgear and power cables for port logistics and chemical industries",
      "Salt-spray and corrosion-resistant wiring accessories for coastal establishments",
      "Flame-retardant electricals for Kovilpatti confectionery and match units"
    ]
  },
  "tirunelveli": {
    name: "Tirunelveli",
    slug: "tirunelveli",
    majorTowns: ["Palayamkottai", "Ambasamudram", "Nanguneri", "Valliyur", "Radhapuram"],
    zone: "Southern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "NH 44 Direct Southern Corridor",
    logisticsPartners: ["ST Courier", "ABT Parcel", "Professional Couriers"],
    industryFocus: "Wind energy generation belt, Nanguneri Tech SEZ, educational hub (Palayamkottai - Oxford of South India), and cement plants",
    regionalContext: "Southern education and renewable wind power centre, experiencing strong residential development and commercial growth.",
    electricalRequirements: [
      "Surge suppression and lightning protection equipment for wind power generation zones",
      "Legrand and Schneider modular switches for modern residential layouts",
      "Polycab FR-LSH low smoke cables for schools, colleges, and university hostels"
    ]
  },
  "tenkasi": {
    name: "Tenkasi",
    slug: "tenkasi",
    majorTowns: ["Courtallam", "Sankarankovil", "Kadayanallur", "Puliyangudi", "Alangulam"],
    zone: "Southern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "Tirunelveli-Tenkasi Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Courtallam wellness tourism and waterfalls, lime agriculture (Puliyangudi), handloom weaving, and wind farms",
    regionalContext: "Set at the foot of the Western Ghats, Tenkasi is famous for Courtallam monsoon tourism and agricultural cultivation.",
    electricalRequirements: [
      "Moisture-proof resort and hotel electrical wiring for Courtallam tourist facilities",
      "Submersible agricultural pump starters for lemon and paddy agriculture",
      "Havells and Crompton high-efficiency ceiling fans for year-round comfort"
    ]
  },
  "kanniyakumari": {
    name: "Kanniyakumari",
    slug: "kanniyakumari",
    majorTowns: ["Nagercoil", "Thuckalay", "Padmanabhapuram", "Colachel", "Marthandam"],
    zone: "Southern",
    deliveryTime: "24 to 48 Hours",
    dispatchHub: "NH 44 Southern Terminus Route",
    logisticsPartners: ["ST Courier", "Professional Couriers"],
    industryFocus: "Rubber plantations, honey processing (Marthandam), coir industries, marine fishing, and national tourism",
    regionalContext: "At the southern tip of the Indian peninsula where three oceans meet, high rainfall and marine humidity require maximum insulation integrity.",
    electricalRequirements: [
      "High dielectric strength FR-LSH copper wires for high-rainfall tropical homes",
      "Corrosion-resistant modular switches with sealed terminals for coastal durability",
      "30mA high-sensitivity RCCBs for complete domestic electrocution protection"
    ]
  }
};
