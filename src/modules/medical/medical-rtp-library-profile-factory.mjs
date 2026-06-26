import { createMedicalRtpClinicalTemplate } from "./medical-rtp-library-clinical-templates.mjs";

const DEFAULT_LEVEL = ["professional", "elite", "international"];
const DEFAULT_SEX = ["female", "male", "all"];
const DEFAULT_SEASON = ["pre-season", "in-season", "congested", "post-season"];
const ALL_OUTFIELD_POSITIONS = ["centre back", "full back", "central midfielder", "attacking midfielder", "winger", "striker"];

const list = (value = []) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
};

const slugify = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replaceAll("/", " ")
    .replaceAll("+", " ")
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const inferPositions = (seed = {}) => {
  if (seed.positions) return list(seed.positions);
  const text = `${seed.name} ${seed.bodyArea} ${seed.family || ""}`.toLowerCase();
  if (text.includes("goalkeeper")) return ["goalkeeper"];
  if (text.includes("shoulder") || text.includes("hand") || text.includes("wrist") || text.includes("finger")) {
    return ["goalkeeper", "centre back", "striker"];
  }
  if (text.includes("sprint") || text.includes("hamstring") || text.includes("quad") || text.includes("calf")) {
    return ["full back", "central midfielder", "winger", "striker"];
  }
  return ALL_OUTFIELD_POSITIONS;
};

const inferStarter = (seed = {}) => {
  const text = `${seed.name} ${seed.riskTags || ""}`.toLowerCase();
  const highRisk =
    text.includes("repair") ||
    text.includes("surgery") ||
    text.includes("fracture") ||
    text.includes("rupture") ||
    text.includes("cardiac") ||
    text.includes("syncope") ||
    text.includes("red flag") ||
    text.includes("multi-ligament");
  const moderateRisk =
    highRisk ||
    text.includes("stress") ||
    text.includes("tendon") ||
    text.includes("instability") ||
    text.includes("concussion") ||
    text.includes("post-viral");
  return {
    duration: highRisk ? 8 : moderateRisk ? 5 : 3,
    unit: "weeks",
    status: highRisk ? "unavailable" : "modified",
    rtpPhase: highRisk ? "medical-restriction" : "modified-team",
    participation: highRisk ? 0 : 50,
    coachNote: `${seed.name} RTP guide started. Training status should follow Medical and Performance review.`,
  };
};

const sentence = (items = []) => {
  const clean = list(items);
  if (clean.length <= 1) return clean[0] || "";
  return `${clean.slice(0, -1).join(", ")} and ${clean.at(-1)}`;
};

const section = (title, content, items = []) => ({
  title,
  content,
  items: list(items),
});

export const RTP_GOLD_STANDARD_SECTION_TITLES = [
  "Overview",
  "Mechanism of Injury",
  "Risk Factors",
  "Clinical Presentation",
  "Assessment Protocols",
  "Differential Diagnosis",
  "Red Flags",
  "Imaging Considerations",
  "Rehabilitation Principles",
  "Exercise Bank",
  "Running Progression",
  "Sprint Progression",
  "Change of Direction Progression",
  "Football Integration",
  "Return to Running Criteria",
  "Return to Training Criteria",
  "Return to Performance Criteria",
  "Monitoring Metrics",
  "GPS Benchmarks",
  "Strength Benchmarks",
  "Common Mistakes",
  "Case Study Example",
  "Research Summary",
  "Evidence Level",
  "Coach Summary",
  "Medical Notes",
  "Performance Notes",
  "Position-Specific Football Demands",
  "Women's Football Considerations",
  "RTP Decision Tree",
  "Objective RTP Testing Battery",
  "Match Return Strategy",
  "Worst Case Scenario Analysis",
  "NWSL / Elite Women's Football Context",
  "RTP Risk Score",
  "RTP Meeting Summary",
  "Return-to-Performance Analytics",
];

export function createGoldStandardSections(profile = {}) {
  const positions = list(profile.positions);
  const risks = list(profile.riskTags);
  const criteria = list(profile.criteria);
  const symptoms = list(profile.symptoms);
  const movements = list(profile.movementPlanes);
  const redFlags = list(profile.redFlags);
  const training = list(profile.trainingChecklist);
  const match = list(profile.matchChecklist);
  const mistakes = list(profile.mistakes);
  const phases = list(profile.phases);
  const loadText = list(profile.loadText);
  const mechanism = profile.mechanism || `${profile.name} usually becomes relevant when ${sentence(movements)} demands exceed current tissue, joint, neurological or systemic capacity.`;
  const differential = profile.differential || `${profile.name} should be differentiated from adjacent joint pathology, referred symptoms, neurological contribution, bone stress, tendon involvement and unrelated medical red flags.`;
  const imaging = profile.imaging || "Imaging is considered when diagnosis is uncertain, symptoms are severe or recurrent, structural involvement changes loading rules, or return-to-performance decisions require better risk stratification.";
  const monitoring = profile.monitoring || "Monitor pain response, next-day symptoms, functional confidence, tissue tolerance, strength, running exposure, high-intensity actions, player-reported readiness and medical red flags.";
  const gps = profile.gpsBenchmarks || "Benchmark total distance, high-speed running, sprint count, max velocity exposure, acceleration/deceleration density and late-session exposure against the player's position and individual history.";
  const strength = profile.strengthBenchmarks || "Use side-to-side comparison, absolute capacity, endurance, rate-of-force development and position-specific movement quality; avoid treating one strength number as clearance.";
  return [
    section("Overview", profile.summary),
    section("Mechanism of Injury", mechanism),
    section("Risk Factors", `Primary football risk modifiers: ${sentence(risks)}.`, risks),
    section("Clinical Presentation", `Common presentations include ${sentence(symptoms)}. Interpret symptoms alongside football demand and 24-hour response.`, symptoms),
    section("Assessment Protocols", "Use a combined Medical and Performance battery rather than a calendar-only decision.", ["history and mechanism", "red flag screen", "palpation or symptom mapping", "range and strength testing", "football movement exposure", "24-hour response review"]),
    section("Differential Diagnosis", differential),
    section("Red Flags", "Escalate or hold progression when red flags are present.", redFlags),
    section("Imaging Considerations", imaging),
    section("Rehabilitation Principles", "Criteria before calendar. Build capacity first, then controlled exposure, then football chaos, then match expectation.", phases),
    section("Exercise Bank", "Exercise selection should match the tissue, movement plane and position demand.", ["isometrics or symptom-limited loading", "heavy slow resistance where appropriate", "eccentric or energy-storage loading", "trunk-pelvis control", "position-specific field drills"]),
    section("Running Progression", loadText.find((item) => item.toLowerCase().startsWith("running:")) || "Running: progress volume, speed and density separately."),
    section("Sprint Progression", loadText.find((item) => item.toLowerCase().startsWith("sprint:")) || "Sprint: expose acceleration, high-speed running and repeated sprinting only when clinically appropriate."),
    section("Change of Direction Progression", loadText.find((item) => item.toLowerCase().startsWith("cod:")) || "COD: progress planned movement before reactive football change of direction."),
    section("Football Integration", "Move from isolated technical work to positional patterns, opponent pressure, contact where relevant and late-session exposure.", training),
    section("Return to Running Criteria", "Running begins when Medical confirms clinical safety and Performance can control the first field exposure.", criteria.slice(0, 3)),
    section("Return to Training Criteria", "Training availability requires controlled football exposure without adverse response and a clear hold rule.", training),
    section("Return to Performance Criteria", "Return to Performance requires the player to tolerate the demands of their role, not only participate in training.", match),
    section("Monitoring Metrics", monitoring),
    section("GPS Benchmarks", gps),
    section("Strength Benchmarks", strength),
    section("Common Mistakes", "Avoid these common RTP errors.", mistakes),
    section("Case Study Example", `A ${positions[0] || "player"} enters RTP for ${profile.name}. Medical confirms clinical safety, Performance stages ${sentence(movements)} exposure, and the Coach receives only a coach-safe status band, restrictions and next decision point.`),
    section("Research Summary", `${profile.evidence} ${profile.experience} Evidence is separated from club experience and should be reviewed annually.`),
    section("Evidence Level", profile.evidenceLevel),
    section("Coach Summary", `Coach-safe: ${profile.name} is managed by status band, restrictions, minutes guidance and next decision point. Do not interpret this guide as automatic selection clearance.`),
    section("Medical Notes", "Medical owns diagnosis, red flags, private clinical reasoning, participation safety, confidence level and final clinical documentation."),
    section("Performance Notes", "Performance owns demand readiness, exposure progression, position-demand gap, load response and the coach-safe readiness summary."),
    section("Position-Specific Football Demands", "Worst-case actions must be checked against position.", positions.map((position) => `${position}: validate worst-case speed, braking, duel/contact and technical actions before match exposure.`)),
    section("Women's Football Considerations", "Use individual baseline, menstrual and hormonal context when relevant, travel load, match congestion, surface changes and available strength/speed history. Evidence specific to elite women's football may be limited."),
    section("RTP Decision Tree", "Hold for red flags; progress only when clinical response is stable; add capacity before chaos; expose sprint/COD/contact before selection; review next-day response before match decision."),
    section("Objective RTP Testing Battery", "Required: Medical red flag and symptom response review. Recommended: strength, field exposure and GPS comparison. Optional: advanced imaging, force plates, isokinetic testing or movement analysis when available."),
    section("Match Return Strategy", "Low-risk cases may progress through modified to full training quickly; moderate cases need repeated exposure and conservative minutes; high-risk cases need staged match return, congestion control and clear hold rules."),
    section("Worst Case Scenario Analysis", "Identify the single most demanding position-specific action and rehearse it before match availability.", positions.map((position) => `${position}: confirm the player can tolerate the role's highest-risk football action under fatigue.`)),
    section("NWSL / Elite Women's Football Context", "Account for travel, heat, turf/grass changes, international duty, short turnarounds and squad rotation limits. Do not use men's football timelines as automatic defaults."),
    section("RTP Risk Score", "Low risk: criteria met and exposure restored. Moderate risk: one key gap remains. High risk: red flag, recurrence, structural concern, congestion or major exposure gap. This is progression support, not clearance."),
    section("RTP Meeting Summary", "Medical states participation safety; Performance states demand readiness and bottleneck; Coach receives status band, restrictions, minutes guidance and next decision point."),
    section("Return-to-Performance Analytics", "Compare Best Case, Typical Case and Delayed Case pathways against the player's own baseline, positional demand and historical response rather than calendar time alone."),
  ];
}

export function createMedicalRtpLibraryProfile(seed = {}) {
  const positions = inferPositions(seed);
  const clinical = createMedicalRtpClinicalTemplate(seed);
  const profile = {
    id: seed.id || slugify(seed.name),
    name: seed.name,
    system: seed.system || "Medical",
    bodyArea: seed.bodyArea || "General",
    family: clinical.family,
    symptoms: list(seed.symptoms || "pain|load intolerance|reduced football confidence"),
    positions,
    movementPlanes: list(seed.movementPlanes || "sagittal|football integration|load progression"),
    riskTags: list(seed.riskTags || "load spike|previous symptoms|fixture congestion|incomplete exposure"),
    evidenceLevel: seed.evidenceLevel || "Limited to moderate",
    summary: seed.summary || clinical.summary,
    evidence: seed.evidence || clinical.evidence,
    experience: seed.experience || clinical.experience,
    redFlags: list(seed.redFlags || clinical.redFlags),
    criteria: list(seed.criteria || clinical.criteria),
    trainingChecklist: list(seed.trainingChecklist || clinical.trainingChecklist),
    matchChecklist: list(seed.matchChecklist || clinical.matchChecklist),
    mistakes: list(seed.mistakes || clinical.mistakes),
    phases: list(seed.phases || clinical.phases),
    loadText: list(seed.loadText || clinical.loadText),
    starter: seed.starter || inferStarter(seed),
    mechanism: seed.mechanism || clinical.mechanism,
    differential: seed.differential || clinical.differential,
    imaging: seed.imaging || clinical.imaging,
    monitoring: seed.monitoring || clinical.monitoring,
    gpsBenchmarks: seed.gpsBenchmarks || clinical.gpsBenchmarks,
    strengthBenchmarks: seed.strengthBenchmarks || clinical.strengthBenchmarks,
    level: DEFAULT_LEVEL,
    sex: DEFAULT_SEX,
    season: DEFAULT_SEASON,
  };
  return {
    ...profile,
    goldStandardSections: createGoldStandardSections(profile),
  };
}
