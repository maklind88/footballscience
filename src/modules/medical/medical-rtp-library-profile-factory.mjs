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

const uniqueList = (items = []) => Array.from(new Set(list(items)));

const appendSentence = (base = "", addition = "") => {
  const cleanBase = String(base || "").trim();
  const cleanAddition = String(addition || "").trim();
  if (!cleanAddition) return cleanBase;
  if (!cleanBase) return cleanAddition;
  if (cleanBase.includes(cleanAddition)) return cleanBase;
  return `${cleanBase} ${cleanAddition}`;
};

const firstOrFallback = (items = [], fallback = "") => list(items)[0] || fallback;

const genericMovementPlanes = new Set(["sagittal", "frontal", "transverse", "rotation"]);

const selectFootballExposure = (items = [], fallback = "football exposure") => {
  const clean = list(items);
  return clean.find((item) => !genericMovementPlanes.has(item.toLowerCase())) || clean[0] || fallback;
};

const selectSecondaryExposure = (items = [], primary = "") => {
  const clean = list(items).filter((item) => item !== primary);
  return clean.find((item) => !genericMovementPlanes.has(item.toLowerCase())) || clean[0] || primary;
};

const section = (title, content, items = []) => ({
  title,
  content,
  items: list(items),
});

const includesAny = (text = "", fragments = []) => fragments.some((fragment) => text.includes(fragment));

const buildClinicalSpecificity = (profile = {}) => {
  const symptoms = list(profile.symptoms);
  const movements = list(profile.movementPlanes);
  const risks = list(profile.riskTags);
  const positions = list(profile.positions);
  const text = `${profile.name || ""} ${profile.system || ""} ${profile.bodyArea || ""} ${profile.family || ""} ${risks.join(" ")}`.toLowerCase();
  const primarySymptom = firstOrFallback(symptoms, "load-sensitive symptoms");
  const secondarySymptom = symptoms[1] || primarySymptom;
  const primaryExposure = selectFootballExposure(movements, "football exposure");
  const secondaryExposure = selectSecondaryExposure(movements, primaryExposure);
  const primaryRisk = firstOrFallback(risks, "incomplete football exposure");
  const secondaryRisk = risks[1] || primaryRisk;
  const primaryPosition = firstOrFallback(positions, "the player's role");

  const flags = [];
  if (includesAny(text, ["cardiac", "syncope", "chest pain", "palpitations"])) flags.push("medical red-flag clearance has been documented before exertion");
  if (includesAny(text, ["concussion", "vestibular", "ocular", "headache"])) flags.push("cognitive, vestibular, exertion and contact stages have been separated");
  if (includesAny(text, ["radicular", "stinger", "burner", "neurological", "compartment"])) flags.push("neurological or neurovascular symptoms have been escalated before field progression");
  if (includesAny(text, ["stress", "bone stress", "navicular", "spondylolysis", "sacral", "pubic bone"])) flags.push("bone-load risk and energy availability have been reviewed before impact progression");
  if (includesAny(text, ["fracture", "avulsion", "fixation"])) flags.push("structural healing confidence and contact risk have been accepted by Medical");
  if (includesAny(text, ["repair", "reconstruction", "arthroscopy", "surgery", "post-op"])) flags.push("surgeon protocol and tissue-protection rules have been satisfied");
  if (includesAny(text, ["tendon", "tendinopathy", "paratenonitis", "partial tear"])) flags.push("24-hour tendon response and energy-storage tolerance are acceptable");
  if (includesAny(text, ["meniscus", "cartilage", "chondral", "osteochondral", "microfracture"])) flags.push("effusion, mechanical symptoms and impact tolerance are stable");
  if (includesAny(text, ["ankle", "syndesmosis", "deltoid", "talus", "lisfranc", "midfoot", "toe", "mtp"])) flags.push("push-off, landing, cutting and surface/footwear tolerance have been restored");
  if (includesAny(text, ["adductor", "groin", "pubalgia", "pubis", "hip", "labral", "fai", "iliopsoas"])) flags.push("rotation, kicking, shielding and lateral braking have been exposed before match demand");
  if (includesAny(text, ["hamstring", "quadriceps", "calf", "soleus", "gastrocnemius", "rectus femoris"])) flags.push("high-speed running, braking and late-session repeatability have been tested");
  if (includesAny(text, ["shoulder", "wrist", "hand", "finger", "thumb", "goalkeeper"])) flags.push("fall, save, contact and handling tolerance match positional demand");
  if (includesAny(text, ["heat", "viral", "respiratory", "gastrointestinal", "iron", "energy", "menstrual", "postpartum", "sleep", "dehydration"])) flags.push("systemic load, recovery and privacy-protected Medical governance are stable");

  const clinicalFlags = uniqueList(flags).slice(0, 4);
  const specificRisk = clinicalFlags[0] || `${primaryRisk} must be controlled before football chaos is added`;
  const exposurePair = uniqueList([primaryExposure, secondaryExposure]).join(" and ");
  const symptomPair = uniqueList([primarySymptom, secondarySymptom]).join(" and ");
  const riskPair = uniqueList([primaryRisk, secondaryRisk]).join(" and ");
  const isMedicalRedFlagProfile = includesAny(text, [
    "cardiac",
    "syncope",
    "chest pain",
    "palpitations",
    "compartment",
    "dizziness",
    "allergic reaction",
  ]);
  const redFlagItems = isMedicalRedFlagProfile
    ? [
        `${primarySymptom} during or after exertion`,
        `${secondarySymptom} associated with systemic or neurological signs`,
        `unclear status of ${primaryRisk}`,
        "any recurrence before Medical has documented clearance",
      ]
    : [
        `worsening ${primarySymptom} despite load reduction`,
        `progression blocked by ${primaryRisk}`,
        ...clinicalFlags.map((flag) => `progression before ${flag}`),
      ];
  const criteriaItems = isMedicalRedFlagProfile
    ? [
        `Medical clearance documented before any ${primaryExposure} progression`,
        `${primaryRisk} investigated, managed or explicitly cleared by Medical`,
        `graded exertion restarted only under the agreed Medical plan`,
      ]
    : [
        `${primarySymptom} stable during and after ${primaryExposure}`,
        `${primaryRisk} addressed or explicitly accepted by Medical and Performance`,
        `${primaryPosition} worst-case ${primaryExposure} exposure completed when clinically appropriate`,
        ...clinicalFlags,
      ];
  const trainingItems = isMedicalRedFlagProfile
    ? [
        `hold field exposure until Medical clears ${primaryRisk}`,
        `restart ${primaryExposure} only through a staged Medical plan`,
        `${secondaryExposure} added only after symptom-free lower-intensity exposure`,
      ]
    : [
        `${primaryExposure} exposure staged and logged`,
        `${secondaryExposure} added only after response is stable`,
        `${primaryRisk} reviewed before the next field step`,
      ];
  const matchItems = isMedicalRedFlagProfile
    ? [
        "no match availability until Medical has cleared participation",
        `${primaryRisk} summarized only as coach-safe restriction or status band`,
        `return-to-match requires stable graded exertion and no recurrence of ${primarySymptom}`,
      ]
    : [
        `${primaryPosition} role demand reviewed`,
        `${primaryExposure} and ${secondaryExposure} match-risk exposures completed or restrictions documented`,
        `${primaryRisk} included in minutes/congestion guidance`,
      ];
  const mistakeItems = isMedicalRedFlagProfile
    ? [
        `treating ${profile.name} as a performance-readiness problem before Medical clearance`,
        `using symptom tolerance during ${primaryExposure} as clearance`,
        `sharing private diagnostic detail with coaches instead of coach-safe restrictions`,
      ]
    : [
        `treating ${profile.name} as a generic ${profile.family || profile.system || "RTP"} case`,
        `progressing ${primaryExposure} before ${primarySymptom} response is stable`,
        `ignoring ${primaryRisk} in the final match discussion`,
      ];
  const loadItems = isMedicalRedFlagProfile
    ? [
        `Running: hold until Medical clears exertion and ${primaryRisk}.`,
        "High-speed: not progressed until lower-intensity exertion is stable and medically cleared.",
        `COD/contact: added only after ${secondaryExposure} is safe under the Medical plan.`,
        `GPS: use only to document staged exposure after clearance, not to justify clearance.`,
      ]
    : [
        `Running: align running dose with ${primarySymptom} and ${primaryRisk}.`,
        `High-speed: add sprint or high-speed exposure only when clinical response and confidence are stable.`,
        `COD/contact: add ${secondaryExposure} progressively and review next-day response.`,
        `GPS: tag ${primaryExposure}, ${secondaryExposure} and late-session exposure separately.`,
      ];

  return {
    primarySymptom,
    primaryExposure,
    primaryRisk,
    clinicalFlags,
    decisionFocus: `${profile.name} decision focus: interpret ${symptomPair} against ${exposurePair}, then progress only when ${riskPair} is controlled.`,
    exposureFocus: `Key football exposure: rebuild ${exposurePair} for ${primaryPosition} before match expectation.`,
    holdFocus: `Hold or regress when ${primarySymptom} increases, ${primaryRisk} worsens, or the next-day response is not stable.`,
    measurementFocus: `Measure ${primaryExposure} exposure, ${primaryRisk}, symptom response and player confidence against individual and positional baseline.`,
    summarySentence: `Profile-specific decision focus: ${primarySymptom} during ${primaryExposure}; main progression risk is ${primaryRisk}.`,
    evidenceSentence: `For ${profile.name}, direct elite football evidence may be limited; apply the broader ${profile.family || profile.system || "RTP"} evidence through the specific constraints of ${primaryRisk} and ${primaryExposure}.`,
    experienceSentence: `In practice, the progression should not advance until ${specificRisk}.`,
    mechanismSentence: `For ${profile.name}, worst-case football exposure is ${primaryExposure} combined with ${secondaryExposure}, especially when ${primaryRisk} or fatigue is present.`,
    differentialSentence: `Specific differentials to actively exclude include presentations that mimic ${primarySymptom}, adjacent-region referral, structural pathology hidden by ${secondarySymptom}, and non-football medical causes when symptoms do not follow load.`,
    imagingSentence: `In ${profile.name}, imaging or specialist review becomes more valuable if ${primarySymptom} is focal, recurrent, structurally suspicious, or inconsistent with the expected ${primaryExposure} load response.`,
    monitoringSentence: `Profile-specific monitoring: track ${primarySymptom}, ${primaryExposure} dose, ${primaryRisk}, next-day response, player confidence and role-specific exposure completion.`,
    gpsSentence: `Profile-specific GPS lens for ${profile.name}: compare ${primaryExposure} and ${secondaryExposure} exposures with the player's ${primaryPosition} baseline before coach-safe match guidance.`,
    strengthSentence: `Profile-specific benchmark for ${profile.name}: combine relevant strength or capacity testing with observed tolerance of ${primaryExposure}; do not clear from isolated gym numbers.`,
    redFlags: uniqueList(redFlagItems),
    criteria: uniqueList(criteriaItems),
    trainingChecklist: uniqueList(trainingItems),
    matchChecklist: uniqueList(matchItems),
    mistakes: uniqueList(mistakeItems),
    loadText: uniqueList(loadItems),
  };
};

const applyClinicalSpecificity = (profile = {}) => {
  const specificity = buildClinicalSpecificity(profile);
  return {
    ...profile,
    clinicalSpecificity: specificity,
    summary: appendSentence(profile.summary, specificity.summarySentence),
    evidence: appendSentence(profile.evidence, specificity.evidenceSentence),
    experience: appendSentence(profile.experience, specificity.experienceSentence),
    redFlags: uniqueList([...list(profile.redFlags), ...specificity.redFlags]),
    criteria: uniqueList([...list(profile.criteria), ...specificity.criteria]),
    trainingChecklist: uniqueList([...list(profile.trainingChecklist), ...specificity.trainingChecklist]),
    matchChecklist: uniqueList([...list(profile.matchChecklist), ...specificity.matchChecklist]),
    mistakes: uniqueList([...list(profile.mistakes), ...specificity.mistakes]),
    loadText: uniqueList([...list(profile.loadText), ...specificity.loadText]),
    mechanism: appendSentence(profile.mechanism, specificity.mechanismSentence),
    differential: appendSentence(profile.differential, specificity.differentialSentence),
    imaging: appendSentence(profile.imaging, specificity.imagingSentence),
    monitoring: appendSentence(profile.monitoring, specificity.monitoringSentence),
    gpsBenchmarks: appendSentence(profile.gpsBenchmarks, specificity.gpsSentence),
    strengthBenchmarks: appendSentence(profile.strengthBenchmarks, specificity.strengthSentence),
  };
};

const UNIVERSAL_RTP_RESEARCH_LENS = [
  "Use the return-to-participation, return-to-sport and return-to-performance continuum rather than one clearance moment.",
  "Combine tissue or medical safety, football exposure, athlete readiness and next-day response before progression.",
  "Treat calendar time as a healing context, not a standalone RTP criterion.",
  "Escalate when red flags, diagnostic uncertainty, structural risk, recurrence or systemic risk are present.",
];

const RTP_TESTING_DOMAINS = [
  "Required: diagnosis confidence, red flag screen, symptom response and 24-hour review.",
  "Required: football-specific exposure history matched to the player's role.",
  "Recommended: strength, power, endurance, range and movement-quality comparison to baseline where available.",
  "Recommended: field exposure across running, sprinting, COD, braking, contact or position-specific actions as relevant.",
  "Recommended: athlete confidence, psychological readiness and fear/apprehension screen.",
  "Optional: imaging, force plates, isokinetic testing or advanced motion analysis when it changes the decision.",
];

export const RTP_LIBRARY_RESEARCH_AUDIT_SCOPE = {
  reviewedAt: "2026-06-29",
  status: "research-informed-clinical-hardening-v2",
  displaySourcesInUi: false,
  scope: [
    "RTP continuum and criteria-based progression",
    "lower-limb muscle injury RTP criteria",
    "tendon load and 24-hour response principles",
    "ankle RTS decision domains",
    "bone stress risk stratification and energy availability",
    "concussion graduated return and medical clearance",
    "surgical tissue-protection and objective response",
    "women's football, travel, surface and congestion modifiers",
  ],
};

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
  const specificity = profile.clinicalSpecificity || null;
  const mechanism = profile.mechanism || `${profile.name} usually becomes relevant when ${sentence(movements)} demands exceed current tissue, joint, neurological or systemic capacity.`;
  const differential = profile.differential || `${profile.name} should be differentiated from adjacent joint pathology, referred symptoms, neurological contribution, bone stress, tendon involvement and unrelated medical red flags.`;
  const imaging = profile.imaging || "Imaging is considered when diagnosis is uncertain, symptoms are severe or recurrent, structural involvement changes loading rules, or return-to-performance decisions require better risk stratification.";
  const monitoring = profile.monitoring || "Monitor pain response, next-day symptoms, functional confidence, tissue tolerance, strength, running exposure, high-intensity actions, player-reported readiness and medical red flags.";
  const gps = profile.gpsBenchmarks || "Benchmark total distance, high-speed running, sprint count, max velocity exposure, acceleration/deceleration density and late-session exposure against the player's position and individual history.";
  const strength = profile.strengthBenchmarks || "Use side-to-side comparison, absolute capacity, endurance, rate-of-force development and position-specific movement quality; avoid treating one strength number as clearance.";
  const specificityItems = specificity
    ? [specificity.decisionFocus, specificity.exposureFocus, specificity.holdFocus, specificity.measurementFocus]
    : [];
  return [
    section("Overview", profile.summary, [...UNIVERSAL_RTP_RESEARCH_LENS, ...specificityItems]),
    section("Mechanism of Injury", appendSentence(mechanism, specificity?.mechanismSentence || "")),
    section("Risk Factors", `Primary football risk modifiers: ${sentence(risks)}.`, risks),
    section("Clinical Presentation", `Common presentations include ${sentence(symptoms)}. Interpret symptoms alongside football demand and 24-hour response.`, symptoms),
    section("Assessment Protocols", "Use a combined Medical and Performance battery rather than a calendar-only decision.", ["history, mechanism and diagnosis confidence", "red flag screen", "symptom mapping and clinical examination", "range, strength, endurance and power testing", "athlete confidence or apprehension screen", "football movement exposure", "24-hour response review", specificity?.measurementFocus || ""].filter(Boolean)),
    section("Differential Diagnosis", appendSentence(differential, specificity?.differentialSentence || "")),
    section("Red Flags", "Escalate or hold progression when red flags are present.", redFlags),
    section("Imaging Considerations", appendSentence(imaging, specificity?.imagingSentence || "")),
    section("Rehabilitation Principles", "Criteria before calendar. Build clinical capacity first, then controlled exposure, then football chaos, then match expectation.", phases),
    section("Exercise Bank", "Exercise selection should match the tissue, movement plane and position demand.", ["isometrics or symptom-limited loading", "heavy slow resistance where appropriate", "eccentric or energy-storage loading", "trunk-pelvis control", "position-specific field drills"]),
    section("Running Progression", loadText.find((item) => item.toLowerCase().startsWith("running:")) || "Running: progress volume, speed and density separately."),
    section("Sprint Progression", loadText.find((item) => item.toLowerCase().startsWith("sprint:")) || "Sprint: expose acceleration, high-speed running and repeated sprinting only when clinically appropriate."),
    section("Change of Direction Progression", loadText.find((item) => item.toLowerCase().startsWith("cod:")) || "COD: progress planned movement before reactive football change of direction."),
    section("Football Integration", "Move from isolated technical work to positional patterns, opponent pressure, contact where relevant and late-session exposure.", training),
    section("Return to Running Criteria", "Running begins when Medical confirms clinical safety, diagnostic risk is acceptable and Performance can control the first field exposure.", criteria.slice(0, 3)),
    section("Return to Training Criteria", "Training availability requires controlled football exposure without adverse response, athlete confidence and a clear hold rule.", training),
    section("Return to Performance Criteria", "Return to Performance requires the player to tolerate the demands of their role, not only participate in training.", [...match, "historical or role baseline restored where available", "player confidence and staff agreement documented"]),
    section("Monitoring Metrics", appendSentence(monitoring, specificity?.monitoringSentence || "")),
    section("GPS Benchmarks", appendSentence(gps, specificity?.gpsSentence || "")),
    section("Strength Benchmarks", appendSentence(strength, specificity?.strengthSentence || "")),
    section("Common Mistakes", "Avoid these common RTP errors.", mistakes),
    section("Case Study Example", `A ${positions[0] || "player"} enters RTP for ${profile.name}. Medical confirms clinical safety, Performance stages ${sentence(movements)} exposure, and the Coach receives only a coach-safe status band, restrictions and next decision point.`),
    section("Research Summary", `${profile.evidence} ${profile.experience} Evidence is separated from club experience and should be reviewed annually. Current RTP logic should integrate clinical safety, sport exposure, athlete readiness and role-specific performance demand.`),
    section("Evidence Level", profile.evidenceLevel),
    section("Coach Summary", `Coach-safe: ${profile.name} is managed by status band, restrictions, minutes guidance and next decision point. Do not interpret this guide as automatic selection clearance.`),
    section("Medical Notes", "Medical owns diagnosis, red flags, private clinical reasoning, participation safety, confidence level and final clinical documentation."),
    section("Performance Notes", "Performance owns demand readiness, exposure progression, position-demand gap, load response and the coach-safe readiness summary."),
    section("Position-Specific Football Demands", "Worst-case actions must be checked against position.", positions.map((position) => `${position}: validate worst-case speed, braking, duel/contact and technical actions before match exposure.`)),
    section("Women's Football Considerations", "Use individual baseline, menstrual and hormonal context when relevant, energy availability, travel load, match congestion, surface changes and available strength/speed history. Evidence specific to elite women's football may be limited."),
    section("RTP Decision Tree", "Hold for red flags or diagnostic uncertainty; progress only when clinical response is stable; add capacity before chaos; expose sprint/COD/contact before selection; review next-day response before match decision."),
    section("Objective RTP Testing Battery", "The battery should answer four questions: is the player clinically safe, can the player tolerate football demand, is the player confident, and what is the next bottleneck?", RTP_TESTING_DOMAINS),
    section("Match Return Strategy", "Low-risk cases may progress through modified to full training quickly; moderate cases need repeated exposure and conservative minutes; high-risk cases need staged match return, congestion control, travel/load protection and clear hold rules."),
    section("Worst Case Scenario Analysis", "Identify the single most demanding position-specific action and rehearse it before match availability.", positions.map((position) => `${position}: confirm the player can tolerate the role's highest-risk football action under fatigue.`)),
    section("NWSL / Elite Women's Football Context", "Account for travel, heat, turf/grass changes, international duty, short turnarounds and squad rotation limits. Do not use men's football timelines as automatic defaults."),
    section("RTP Risk Score", "Low risk: criteria met and exposure restored. Moderate risk: one key gap remains. High risk: red flag, recurrence, structural concern, low confidence, congestion, travel or major exposure gap. This is progression support, not clearance."),
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
    researchAuditStatus: RTP_LIBRARY_RESEARCH_AUDIT_SCOPE.status,
    researchAuditReviewedAt: RTP_LIBRARY_RESEARCH_AUDIT_SCOPE.reviewedAt,
    researchAuditFamily: clinical.family,
    level: DEFAULT_LEVEL,
    sex: DEFAULT_SEX,
    season: DEFAULT_SEASON,
  };
  const enrichedProfile = applyClinicalSpecificity(profile);
  return {
    ...enrichedProfile,
    goldStandardSections: createGoldStandardSections(enrichedProfile),
  };
}
