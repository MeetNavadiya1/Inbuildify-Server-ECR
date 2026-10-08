/**
 * Starter set for Admin → Estimation → "Load starter template".
 *
 * A worked example rather than a standard: it gives a builder a complete,
 * working estimate to look at and then rewrite with their own rates. Nothing
 * here is applied automatically — the builder asks for it, and variables they
 * already use are skipped, never overwritten.
 *
 * The formulas are the reference estimating sheet's own: with the example
 * values below (single storey, 180 m², 1 bed, 2 bath, kitchen, 1 living area,
 * 3 m ceilings) every line and the grand total ($310,852.21) match it. Steel
 * and cement are rated per square foot of built-up area (m² × 10.76), and sand
 * and gravel follow cement at 1:2:4.
 *
 * Project Type scales the whole estimate: every line is multiplied by
 * `project_type` (Single Storey = 1, Double Storey = 2), so a double storey
 * comes to exactly twice a single. Lines built on another line pick the
 * multiplier up from it instead of applying it again — bricks through
 * wall_volume, sand and gravel through cement — or they would be counted twice.
 * The same inheritance carries the room count: bricks follow wall_volume, and
 * sand and gravel follow cement, so only those two carry a room factor.
 */

/**
 * How much partition wall this plan has, against the reference plan's five
 * rooms (1 bed, 2 bath, kitchen, 1 living area). Dividing a floor into n rooms
 * takes wall in proportion to √n − 1, so the ratio is (√rooms − 1) / (√5 − 1):
 * EXACTLY 1 at five rooms, above it as the plan is cut into more, and held at 0
 * by max(…, 0) for a single undivided space rather than going negative.
 *
 * This is the hinge the two calibrated formulas below turn on. Every rate the
 * reference estimating sheet gives — 0.36 m³ of wall per m³ of built volume,
 * 0.4 bags of cement per sq ft — was measured on that five-room plan, so each
 * formula multiplies its rate by a factor built from this ratio that comes to
 * exactly 1 there. A reference estimate therefore still comes out bit-for-bit
 * as the sheet has it (194.4 m³ of wall, 126,315.7895 bricks, 774.72 bags,
 * $310,852.21), and only a plan cut into a different number of rooms moves.
 */
const PARTITION_RATIO = "max(sqrt(bedrooms + bathrooms + kitchen + halls) - 1, 0) / (sqrt(5) - 1)";

/**
 * Wall Volume: the sheet's 0.36 allowance, with the one thing it left out put
 * back. Area, ceiling height and storeys move it exactly as before.
 *
 * Geometry puts the partitions at about 23.2% of a plan's masonry and the
 * perimeter at the other 76.8%, and only the partitions answer to the room
 * count — hence 0.232 as the swing. A single undivided space bottoms out at
 * 0.768 × the allowance, the perimeter alone.
 */
export const WALL_VOLUME_FORMULA =
  `total_area * ceiling_height * 0.36 * project_type * (1 - 0.232 * (1 - ${PARTITION_RATIO}))`;

export const WALL_VOLUME_DESCRIPTION =
  "0.36 m³ of wall per m³ of built volume, per storey, adjusted for how many rooms the floor is divided into — exactly 0.36 for a 5-room plan, more as rooms are added, 0.768 × that for one undivided space.";

/**
 * Cement: the sheet's 0.4 bags per sq ft, likewise adjusted for the room count.
 *
 * Only part of a house's cement answers to how the floor is divided. The
 * footings, slab, columns and beams are set by the area they cover — about 65%
 * of the bags — while the mortar the bricks are laid in and the plaster over
 * them follow the walls, about 35%. So the swing here is that 35% share of the
 * 23.2% the partitions represent: cement moves with the rooms, but a third as
 * hard as the wall volume does.
 *
 * Sand and gravel are `cement * 2` and `cement * 4` and so come along with it,
 * which is what keeps the 1:2:4 mix intact.
 */
export const CEMENT_FORMULA =
  `total_area * 10.76 * 0.4 * project_type * (1 - 0.35 * 0.232 * (1 - ${PARTITION_RATIO}))`;

export const CEMENT_DESCRIPTION =
  "0.4 bags per sq ft of built-up area (m² × 10.76), per storey, with the 35% that goes into mortar and plaster following the room count — exactly 0.4 for a 5-room plan.";

export const STARTER_PARAMETERS = [
  {
    label: "Project Type",
    variable: "project_type",
    input_type: "select",
    options: [
      { label: "Single Storey", value: 1 },
      { label: "Double Storey", value: 2 },
    ],
    default_value: 1,
    description: "Multiplies the whole estimate — Single Storey × 1, Double Storey × 2.",
  },
  { label: "Total Built-up Area", variable: "total_area", input_type: "number", unit: "m²", default_value: 180 },
  { label: "Bedrooms", variable: "bedrooms", input_type: "number", default_value: 1 },
  { label: "Bathrooms", variable: "bathrooms", input_type: "number", default_value: 2 },
  {
    label: "Kitchen",
    variable: "kitchen",
    input_type: "boolean",
    default_value: 1,
    description: "Yes = 1, No = 0.",
  },
  { label: "Halls / Living Rooms", variable: "halls", input_type: "number", default_value: 1 },
  { label: "Ceiling Height", variable: "ceiling_height", input_type: "number", unit: "m", default_value: 3 },
  {
    label: "Wall Volume",
    variable: "wall_volume",
    input_type: "formula",
    unit: "m³",
    formula: WALL_VOLUME_FORMULA,
    description: WALL_VOLUME_DESCRIPTION,
  },
];

export const STARTER_MATERIALS = [
  {
    name: "Bricks",
    variable: "bricks",
    unit: "pcs",
    // Storeys already counted in wall_volume.
    formula: "wall_volume / (0.19 * 0.09 * 0.09)",
    unit_price: 0.5,
    description: "Wall volume ÷ one 190 × 90 × 90 mm modular brick.",
  },
  {
    name: "Paint",
    variable: "paint",
    unit: "Litre",
    formula: "total_area * 1.3 * project_type",
    unit_price: 25,
  },
  {
    name: "Wiring",
    variable: "wiring",
    unit: "metre",
    formula: "total_area * 6.5 * project_type",
    unit_price: 2,
  },
  {
    name: "Plumbing",
    variable: "plumbing",
    unit: "metre",
    formula: "(bathrooms * 20 + kitchen * 10) * project_type",
    unit_price: 5,
    description: "20 m per bathroom, 10 m for the kitchen, per storey.",
  },
  {
    name: "Steel",
    variable: "steel",
    unit: "kg",
    formula: "total_area * 10.76 * 13 * project_type",
    unit_price: 1.2,
    description: "13 kg per sq ft of built-up area (m² × 10.76 = sq ft), per storey.",
  },
  {
    name: "Cement",
    variable: "cement",
    unit: "bag",
    formula: CEMENT_FORMULA,
    unit_price: 7,
    description: CEMENT_DESCRIPTION,
  },
  {
    name: "Sand",
    variable: "sand",
    unit: "m³",
    // Storeys already counted in cement.
    formula: "cement * 2",
    unit_price: 50,
    description: "Twice the cement — 1:2:4 mix.",
  },
  {
    name: "Gravel",
    variable: "gravel",
    unit: "m³",
    formula: "cement * 4",
    unit_price: 40,
    description: "Four times the cement — 1:2:4 mix.",
  },
  {
    name: "Doors",
    variable: "doors",
    unit: "pcs",
    formula: "(bedrooms + bathrooms + kitchen + halls) * project_type",
    unit_price: 150,
    description: "One per room, per storey.",
  },
  {
    name: "Windows",
    variable: "windows",
    unit: "pcs",
    formula: "((bedrooms + bathrooms + kitchen + halls) * 2 + halls * 2) * project_type",
    unit_price: 120,
    description: "Two per room, plus two more per living area, per storey.",
  },
];
