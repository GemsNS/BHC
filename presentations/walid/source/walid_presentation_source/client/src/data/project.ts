/**
 * Architect's Sample Room: factual project content and asset registry.
 * Keep technical facts explicit and distinguish verified dimensions from assumptions.
 */

export const assets = {
  logo: "/manus-storage/bh_folded_profile_mark_d54ed14e.png",
  hero: "/manus-storage/site_existing_04_806a4497.webp",
  grid: "/manus-storage/architectural_grid_texture_268ce702.jpg",
  charcoalTexture: "/manus-storage/charcoal_vertical_profile_c46c254f.jpg",
  cedarTexture: "/manus-storage/cedar_rainscreen_profile_a7576489.jpg",
  model: "/manus-storage/walid_warehouse_0988249a.glb",
  elevations: "/manus-storage/walid_facade_elevations_ab01657c.png",
  permit: "/manus-storage/walid_permit_drawings_bdefa641.pdf",
  permitSheets: [
    { src: "/manus-storage/permit_sheet_05_floor_plan_9fd7b5e8.png", label: "Floor plan / overall footprint" },
    { src: "/manus-storage/permit_sheet_07_back_elevation_1efc505e.png", label: "Lower-grade garage elevation" },
    { src: "/manus-storage/permit_sheet_08_front_elevation_85bd2fa2.png", label: "Upper-grade entrance elevation" },
    { src: "/manus-storage/permit_sheet_11_section_3f021d11.png", label: "Building section / vertical stack" },
  ],
  referenceSpecification: "/manus-storage/original_facade_reference_051efbd7.jpg",
  clientReference: "/manus-storage/client_reference_board_115155f2.png",
  renderings: [],
  site: [
    { src: "/manus-storage/site_corner_man_door_sidewall_f427c907.png", label: "Verified garage corner and downhill sidewall man door" },
    { src: "/manus-storage/site_existing_02_436042b6.webp", label: "Lower garage openings" },
    { src: "/manus-storage/site_existing_03_ed8891e7.webp", label: "Garage corner and exposed foundation" },
    { src: "/manus-storage/site_existing_04_806a4497.webp", label: "Downhill sidewall and driveway grade" },
  ],
}

export type Concept = {
  id: string
  number: string
  name: string
  strapline: string
  image: string
  field: string
  fieldDark: string
  accent: string
  accentDark: string
  fascia: string
  secondary: string
  relativeCost: string
  maintenance: string
  logic: string
  bestFor: string
}

export const concepts: Concept[] = [
  {
    id: "cedar-datum",
    number: "01",
    name: "Cedar Datum",
    strapline: "Horizontal wood-grain bands organize the two levels.",
    image: "/manus-storage/walid_system_01_cedar-datum_b040dcdb.png",
    field: "#30343B",
    fieldDark: "#24282E",
    accent: "#A86F3D",
    accentDark: "#80512F",
    fascia: "#101214",
    secondary: "#E5E3DF",
    relativeCost: "Moderate",
    maintenance: "Two primary cladding systems with concentrated transition and portal detailing.",
    logic: "Black vertical board-and-batten establishes the field while horizontal wood-grain entrance fields, a floor datum, and the garage header/drop rhythm organize the elevations.",
    bestFor: "A balanced industrial exterior with clearly controlled wood feature zones.",
  },
  {
    id: "full-battens",
    number: "02",
    name: "Full Battens",
    strapline: "One vertical language gives the shell a disciplined industrial read.",
    image: "/manus-storage/walid_system_02_full-battens_99e584aa.png",
    field: "#30343B",
    fieldDark: "#24282E",
    accent: "#30343B",
    accentDark: "#24282E",
    fascia: "#101214",
    secondary: "#777B7D",
    relativeCost: "Lower–Moderate",
    maintenance: "One dominant siding system and compact folded-metal opening trim.",
    logic: "Black vertical board-and-batten covers every siding field. Broad wood zones are eliminated; fascia, rake, soffit edge, and opening trim read as one continuous dark system.",
    bestFor: "The cleanest installation logic and the most unified industrial expression.",
  },
  {
    id: "split-storey",
    number: "03",
    name: "Split Storey",
    strapline: "The material break follows the building's two-level organization.",
    image: "/manus-storage/walid_system_03_split-storey_4b35c6de.png",
    field: "#30343B",
    fieldDark: "#24282E",
    accent: "#A86F3D",
    accentDark: "#80512F",
    fascia: "#101214",
    secondary: "#30343B",
    relativeCost: "Moderate–High",
    maintenance: "A long inter-storey flashing transition and more horizontal wood-grain coverage.",
    logic: "Horizontal wood-grain siding wraps the exposed lower storey. Black vertical board-and-batten begins at the floor/joist datum and continues through the upper walls and gables.",
    bestFor: "Making the two-level condition legible while keeping the upper shell visually light and vertical.",
  },
  {
    id: "framed-bays",
    number: "04",
    name: "Framed Bays",
    strapline: "Wood-grain picture frames identify entrances and shop doors.",
    image: "/manus-storage/walid_system_04_framed-bays_f2733ef8.png",
    field: "#30343B",
    fieldDark: "#24282E",
    accent: "#A86F3D",
    accentDark: "#80512F",
    fascia: "#101214",
    secondary: "#777B7D",
    relativeCost: "Moderate–High",
    maintenance: "More custom portal trim, returns, flashing, and alignment work at opening groups.",
    logic: "Black vertical board-and-batten remains continuous between openings. Horizontal wood-grain picture frames identify the entrance and garage-door group without wrapping the entire lower level.",
    bestFor: "The strongest entrance and work-bay identity without changing any opening size or position.",
  },
]

export const dimensions = [
  { label: "Gable width", value: "15.42 m", note: "Written plan dimension", verified: true },
  { label: "Side-wall depth", value: "12.38 m", note: "Written plan dimension", verified: true },
  { label: "Lower level", value: "3.91 m", note: "Written section dimension", verified: true },
  { label: "Floor / joist zone", value: "0.35 m", note: "Written section dimension", verified: true },
  { label: "Upper wall to eave", value: "2.75 m", note: "Written section dimension", verified: true },
  { label: "Eave to ridge", value: "2.11 m", note: "Written section dimension", verified: true },
  { label: "Slab to ridge", value: "9.12 m", note: "Sum of vertical stack", verified: true },
  { label: "Roof intent", value: "3:12", note: "Permit detail note", verified: true },
  { label: "Grade and retaining", value: "Approx.", note: "Modelled from photographs; survey required", verified: false },
]

export const takeoff = [
  { elevation: "Front entrance", gross: 64.1, openings: 15.8, net: 48.3, feet: 520, squares: 5.2 },
  { elevation: "Garage / shop", gross: 124.4, openings: 25.9, net: 98.4, feet: 1059, squares: 10.6 },
  { elevation: "Left side", gross: 62.6, openings: 7.7, net: 54.9, feet: 591, squares: 5.9 },
  { elevation: "Right side", gross: 62.6, openings: 4.4, net: 58.2, feet: 626, squares: 6.3 },
]

export const pricing = [
  { item: "Siding / cladding installation", quantity: "30 squares", rate: "$400 / square", total: "$12,000" },
  { item: "Exterior door installation", quantity: "2 doors", rate: "$500 / door", total: "$1,000" },
]

export const downloads = [
  { group: "Contract", label: "Main siding contract draft", format: "DOCX", href: "/manus-storage/Walid_Siding_Contract_d5bd0694.docx" },
  { group: "Contract", label: "Change order form", format: "DOCX", href: "/manus-storage/Walid_Change_Order_Form_dcd18f7a.docx" },
  { group: "Contract", label: "Field measurement & layout approval", format: "DOCX", href: "/manus-storage/Walid_Field_Measurement_and_Layout_Approval_0aa8d7f5.docx" },
  { group: "Contract", label: "Substantial performance & deficiencies", format: "DOCX", href: "/manus-storage/Walid_Substantial_Performance_and_Deficiency_Form_f0ec28d7.docx" },
  { group: "Plans", label: "Permit drawing set", format: "PDF", href: assets.permit },
  { group: "Plans", label: "Concept elevations", format: "SVG", href: "/manus-storage/walid_facade_elevations_3133d116.svg" },
  { group: "Plans", label: "Editable elevation linework", format: "DXF", href: "/manus-storage/walid_facade_elevations_44f0600d.dxf" },
  { group: "Takeoff", label: "Façade takeoff workbook", format: "XLSX", href: "/manus-storage/walid_facade_takeoff_2501168a.xlsx" },
  { group: "Model", label: "Parametric JSCAD source", format: "JS", href: "/manus-storage/walid_warehouse.jscad_676ae306.js" },
  { group: "Model", label: "Browser-ready 3D model", format: "GLB", href: assets.model },
  { group: "Model", label: "Colour-capable 3D exchange", format: "3MF", href: "/manus-storage/walid_warehouse_786fa9b2.3mf" },
  { group: "Model", label: "Mesh with material library", format: "OBJ", href: "/manus-storage/walid_warehouse_370ba062.obj" },
  { group: "Model", label: "OBJ material library", format: "MTL", href: "/manus-storage/walid_warehouse_3ae76304.mtl" },
  { group: "Model", label: "Geometry-only mesh", format: "STL", href: "/manus-storage/walid_warehouse_e5bd0fd2.stl" },
  { group: "Design Options", label: "Cedar Datum system", format: "PNG", href: "/manus-storage/walid_system_01_cedar-datum_b040dcdb.png" },
  { group: "Design Options", label: "Full Battens system", format: "PNG", href: "/manus-storage/walid_system_02_full-battens_99e584aa.png" },
  { group: "Design Options", label: "Split Storey system", format: "PNG", href: "/manus-storage/walid_system_03_split-storey_4b35c6de.png" },
  { group: "Design Options", label: "Framed Bays system", format: "PNG", href: "/manus-storage/walid_system_04_framed-bays_f2733ef8.png" },
]

export const contractSections = [
  {
    title: "1. Contract Documents and Order of Priority",
    body: "The Contractor shall perform the work described in this agreement and Schedule A. Priority is: signed change orders; this agreement and schedules; the latest authorized architectural/engineering drawings; approved manufacturer instructions; and the BH Contracting façade concept model and A-EX-01 for finish intent and coordination only. If documents conflict, affected work stops pending written direction. The model, renderings, takeoff, and concept elevations are not permit, structural, shop, engineering, or sealed drawings.",
  },
  {
    title: "2. Scope of Work",
    body: "Provide labour, supervision, ordinary hand tools, layout, and installation for approximately 30 squares of approved siding/cladding; expressly assigned trims and closures; two exterior doors including setting, plumbing, levelling, shimming, fastening, and ordinary perimeter air sealing; routine protection and housekeeping; and coordination of openings, access, sequencing, and substrate readiness. Work is to be completed in a good and workmanlike manner using the governing documents and approved manufacturer instructions.",
  },
  {
    title: "3. Contract Price",
    body: "The preliminary contract price is $13,000 before HST: 30 siding squares at $400 per square plus two door installations at $500 each. HST treatment and the final total must be confirmed. Quantities above the agreed basis, added openings, redesign, concealed conditions, substrate correction, remobilization, winter conditions, extraordinary access, and work outside the defined scope require a written change order.",
  },
  {
    title: "4. Measurement and Quantity Adjustment",
    body: "Before production installation, verify accessible walls, rough openings, cladding limits, grade terminations, and the approved façade layout. The concept takeoff is approximately 28.0 net installed squares and 30.8 squares with a 10% allowance. If the final measured scope plus agreed allowance differs from 30 squares by more than one square, adjust at $400 per added or deleted square, prorated to the nearest tenth, unless another rate is agreed in writing.",
  },
  {
    title: "5. Payment Terms and Statutory Holdback",
    body: "Gross milestone amounts before HST and holdback are $3,250 at mobilization and commencement, $6,500 at approximately 50% installation, and $3,250 at substantial performance. Retain the statutory 10% holdback where required. On $13,000, the full holdback would be $1,300 if the entire amount is lienable. Undisputed non-holdback amounts are due within seven calendar days; disputed amounts must be identified in writing within three business days.",
  },
  {
    title: "6. Schedule",
    body: "Start and substantial-performance dates remain to be inserted. Time extends for delays outside the Contractor’s reasonable control, including severe weather, unsafe conditions, unavailable access or lifting equipment, late or defective customer-supplied materials, design changes, inspections, concealed conditions, utility interruption, governmental orders, and delay by the Customer or other trades. Customer-caused delay may result in documented standby, storage, remobilization, or escalation costs.",
  },
  {
    title: "7. Customer Responsibilities",
    body: "Provide lawful safe access, utilities and staging; current drawings, permits and selections; a complete, dry, plumb and integrated substrate; confirmed project roles and authorized representatives; trade coordination; suitable and sufficient customer-supplied materials; and written approval of layout, colours, transition heights, trim, and door locations before installation.",
  },
  {
    title: "8. Contractor Responsibilities",
    body: "Supervise its personnel and subcontractors; comply with applicable occupational health and safety requirements within its authority and control; report conflicts affecting installation or safety; protect its work until possession or control passes; and maintain records supporting progress invoices, extras, and substantial performance.",
  },
  {
    title: "9. WCB, Insurance, and Compliance",
    body: "Provide applicable evidence of insurance, licences, registrations, and WCB clearance. The draft requires commercial general liability insurance of not less than $2,000,000 per occurrence unless another amount is agreed, together with legally required automobile insurance. The Customer remains responsible for property and course-of-construction insurance appropriate to the Project.",
  },
  {
    title: "10. Changes and Extra Work",
    body: "Changes include additions, deletions, revisions, resequencing, acceleration, suspension, quantity variation, changed conditions, and work made necessary by unready or defective conditions. Except for immediate protective action, changes require written scope, price, tax, and schedule authorization. Time-sensitive field directives are tracked at documented cost plus 15% overhead and profit unless another written markup applies.",
  },
  {
    title: "11. Site Conditions and Substrate",
    body: "Pricing assumes a substrate meeting drawings, manufacturer requirements, and ordinary tolerances. Hidden deterioration, structural movement, trapped moisture, missing blocking, incompatible membranes, framing irregularities, inaccurate rough openings, outside water entry, hazardous substances, and prior work by others are excluded. Affected work may stop pending written direction; investigation and correction are additional work unless expressly included.",
  },
  {
    title: "12. Materials, Title, and Risk",
    body: "Schedule A must allocate supply responsibility for siding, doors, trims, flashings, fasteners, sealants, membranes, furring, lifting equipment, and disposal. Substitutions require written approval. Customer-supplied products remain at the Customer’s risk except for damage caused by the Contractor’s negligent handling or installation. Uninstalled Contractor-supplied materials remain the Contractor’s property until paid, subject to law.",
  },
  {
    title: "13. Inspection, Deficiencies, and Substantial Performance",
    body: "After notice of substantial performance, the Customer inspects within three business days and provides one written list of observable deficiencies. Minor deficiencies that do not prevent intended use do not postpone substantial performance or payment. Covered deficiencies are corrected within a reasonable time considering weather, access, material availability, and sequencing.",
  },
  {
    title: "14. Workmanship Warranty",
    body: "The draft workmanship warranty is one year from substantial performance and is limited to correcting Contractor workmanship. It excludes wear, abuse, impact, movement, condensation, inadequate ventilation, failures outside scope, defective design or products, hazardous substances, corrosion or incompatibility not caused by the Contractor, colour change, maintenance items, extreme weather, and alteration by others. Transferable manufacturer warranties pass through where available.",
  },
  {
    title: "15. Suspension and Termination",
    body: "The Contractor may suspend affected work on written notice for undisputed non-payment, unsafe conditions, missing access or materials, unlawful direction, or material breach, with reasonable time and cost relief. Either Party may terminate a material breach not cured within seven calendar days, or sooner for immediate legal or safety risk. Properly due work, commitments, demobilization, cancellation, and change costs remain payable subject to holdback law.",
  },
  {
    title: "16. Indemnity and Limitation",
    body: "Each Party indemnifies the other for third-party claims to the extent caused by its negligence, wilful misconduct, breach, or failure to discharge duties within its control. Indirect, special, punitive, and consequential damages are excluded where lawful. The Contractor’s aggregate contractual liability is limited to the contract price actually paid, excluding insured third-party injury/property claims, fraud, and wilful misconduct, to the extent enforceable.",
  },
  {
    title: "17. Dispute Resolution",
    body: "A dispute begins with written notice and a senior-representative meeting within five business days. If unresolved, the Parties attempt confidential mediation in Nova Scotia before litigation, except where urgent relief, lien preservation, limitation periods, or safety requires immediate action. Nova Scotia and applicable Canadian law govern.",
  },
  {
    title: "18. Notices",
    body: "Notices are delivered personally, by recognized courier, or by email to the contract addresses. Email notice is received when acknowledged, or on the next business day absent a failure notice. Change orders and site directions may be signed electronically.",
  },
  {
    title: "19. General Terms",
    body: "The signed agreement is the entire agreement for the work and replaces prior discussions. Waivers must be written; unenforceable provisions are modified or severed; assignment requires written consent except for a qualified affiliate or successor; and the relationship remains that of independent contractors, not partnership, joint venture, employment, or agency.",
  },
  {
    title: "20. Signatures",
    body: "The Parties confirm that they reviewed the contract documents, resolved Schedule A and B selections, and had the opportunity to obtain independent legal and technical advice. Signature blocks are provided for authorized representatives of BH Contracting Ltd. and SOI Trade Inc., with printed name, title, signature, and date.",
  },
]

export const scopeMatrix = [
  "Siding/cladding material",
  "Cedar-tone accent material",
  "Starter strips and closures",
  "Inside/outside corner trim",
  "Window/door perimeter trim",
  "Custom break-metal flashings",
  "Fasteners and ordinary sealants",
  "Air/water barrier or membrane",
  "Exterior insulation",
  "Strapping/furring/girts",
  "Sheathing/substrate correction",
  "Soffit/fascia/eavestrough",
  "Roofing",
  "Scaffolding",
  "Boom/scissor lift and fuel",
  "Fall-protection anchor provisions",
  "Waste bin and tipping fees",
  "Supply of two exterior doors",
  "Install two exterior doors — included in provisional price",
  "Door hardware/locks/closers",
  "Electrical lighting/fixtures",
  "Permits, inspections, engineering",
  "Winter heating/hoarding/snow removal",
]

export const adminConfirmations = [
  "Legal and registered addresses",
  "HST number and tax treatment",
  "Customer and Contractor authorized representatives",
  "Consultant and constructor / general contractor",
  "Site hours, start date, and target completion date",
  "Invoice email and purchase-order number",
  "Property/course-of-construction insurance",
  "BH commercial liability certificate",
  "BH WCB clearance, if applicable",
  "Current drawings, permits, substrate review, and field measurement approval",
]
