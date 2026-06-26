const list = (value = []) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
};

const sentence = (items = []) => {
  const clean = list(items);
  if (clean.length <= 1) return clean[0] || "";
  return `${clean.slice(0, -1).join(", ")} and ${clean.at(-1)}`;
};

const textIncludes = (text = "", fragments = []) => fragments.some((fragment) => text.includes(fragment));

const inferClinicalFamily = (seed = {}) => {
  const text = `${seed.family || ""} ${seed.system || ""} ${seed.name || ""} ${seed.bodyArea || ""}`.toLowerCase();
  if (textIncludes(text, ["surgical", "repair", "reconstruction", "fixation", "arthroscopy", "surgery"])) return "surgical";
  if (textIncludes(text, ["concussion", "vestibular", "ocular", "headache", "stinger", "radicular", "neurological"])) return "neurological";
  if (textIncludes(text, ["cardiac", "illness", "viral", "respiratory", "heat", "energy", "iron", "menstrual", "postpartum", "medical", "fatigue", "dizziness", "sleep"])) return "medical";
  if (textIncludes(text, ["goalkeeper"])) return "goalkeeper";
  if (textIncludes(text, ["bone stress", "stress fracture", "navicular", "tibial bone", "pubic bone", "spondylolysis", "sacral stress"])) return "bone stress";
  if (textIncludes(text, ["fracture", "avulsion"])) return "fracture";
  if (textIncludes(text, ["hamstring"])) return "hamstring";
  if (textIncludes(text, ["quadriceps", "rectus femoris", "vastus", "hip flexor"])) return "quadriceps";
  if (textIncludes(text, ["adductor", "groin", "pubalgia", "pubis", "pectineus"])) return "groin";
  if (textIncludes(text, ["soleus", "gastrocnemius", "calf", "plantaris", "achilles"])) return "calf";
  if (textIncludes(text, ["lower leg", "anterior tibialis", "shin", "compartment"])) return "lower leg";
  if (textIncludes(text, ["ankle", "syndesmosis", "peroneal", "deltoid", "talus"])) return "ankle";
  if (textIncludes(text, ["foot", "toe", "metatarsal", "midfoot", "lisfranc", "sesamoid", "navicular", "plantar"])) return "foot";
  if (textIncludes(text, ["knee", "meniscus", "mcl", "lcl", "pcl", "patellar", "acl", "cartilage", "patellofemoral"])) return "knee";
  if (textIncludes(text, ["hip", "glute", "piriformis", "labral", "fai", "obturator"])) return "hip";
  if (textIncludes(text, ["spine", "lumbar", "thoracic", "cervical", "si joint", "rib", "trunk", "abdominal", "oblique"])) return "spine";
  if (textIncludes(text, ["shoulder", "clavicle", "rotator", "labral shoulder", "ac joint", "scapular"])) return "shoulder";
  if (textIncludes(text, ["hand", "wrist", "finger", "thumb", "elbow", "forearm", "biceps", "triceps"])) return "upper limb";
  if (textIncludes(text, ["contusion", "impact"])) return "contusion";
  if (textIncludes(text, ["tendon", "tendinopathy", "paratenonitis", "fasciopathy"])) return "tendon";
  if (textIncludes(text, ["ligament", "instability", "sprain", "ucl"])) return "ligament";
  if (textIncludes(text, ["congestion", "operational"])) return "operations";
  return "general";
};

export const createMedicalRtpClinicalTemplate = (seed = {}) => {
  const name = seed.name || "This RTP guide";
  const bodyArea = seed.bodyArea || "the involved area";
  const movements = sentence(seed.movementPlanes || []);
  const risks = sentence(seed.riskTags || []);
  const symptoms = sentence(seed.symptoms || []);
  const family = inferClinicalFamily(seed);
  const base = {
    family,
    summary: `${name} is managed as a football demand-tolerance problem at ${bodyArea}; Medical confirms clinical safety while Performance rebuilds ${movements || "the key football exposures"}.`,
    evidence: "Evidence supports criteria-based progression, symptom/load monitoring and sport-specific exposure, but injury-specific elite football data may be limited.",
    experience: "Elite football staffs should adjust progression to position demand, fixture congestion, travel, surface changes and the player's response over the next 24 hours.",
    redFlags: "worsening symptoms|night pain or systemic symptoms|neurological signs|instability or structural concern",
    criteria: "clinical symptoms stable|strength and control acceptable|football exposure tolerated|athlete confidence acceptable|no adverse next-day response",
    trainingChecklist: "medical review|controlled field exposure|position-specific technical work|load response review",
    matchChecklist: "full training response stable|position-specific worst-case action completed|minutes guidance agreed|congestion risk reviewed",
    mistakes: "calendar-only clearance|ignoring next-day response|underexposing football demand|sharing private medical detail with coaches",
    phases: "Rehab: restore clinical tolerance and basic capacity.|Modified: add controlled field and technical exposure.|Full: complete position-specific football demand.|Match: return through minutes and congestion guardrails.",
    loadText: "Running: progress volume and speed separately.|Sprint: add only when clinically appropriate.|COD: progress planned before reactive movements.|GPS: compare exposure to individual and positional baseline.",
    mechanism: `${name} usually becomes relevant when ${movements || "football"} demands exceed current clinical, tissue or systemic capacity at ${bodyArea}.`,
    differential: `${name} should be differentiated from adjacent joint pathology, referred symptoms, neurological contribution, bone stress, tendon involvement and unrelated medical red flags.`,
    imaging: "Imaging is considered when diagnosis is uncertain, symptoms are severe or recurrent, structural involvement changes loading rules, or return-to-performance decisions require better risk stratification.",
    monitoring: `Monitor ${symptoms || "symptom response"}, next-day response, strength, football exposure, player confidence, and changes in ${risks || "known risk modifiers"}.`,
    gpsBenchmarks: "Benchmark total distance, high-speed running, sprint count, max velocity exposure, acceleration/deceleration density and late-session exposure against the player's position and individual history.",
    strengthBenchmarks: "Use side-to-side comparison, absolute capacity, endurance, rate-of-force development and position-specific movement quality; avoid treating one strength number as clearance.",
  };
  const templates = {
    hamstring: {
      summary: `${name} is a sprint-speed and posterior-chain exposure problem; RTP must prove acceleration, max velocity and repeated sprint tolerance before match demand.`,
      evidence: "Hamstring RTP has moderate football evidence for prior injury, eccentric strength, sprint exposure, pain-free function and recurrence risk; subtype-specific evidence remains more limited.",
      experience: "Elite football staffs should expose terminal swing, curved runs, late-session sprints, max-velocity work and position-specific high-speed actions before coach-safe match guidance.",
      redFlags: "palpable defect|rapid bruising|proximal or distal tendon suspicion|sciatic or neurological symptoms",
      criteria: "pain-free high-force hamstring testing|eccentric strength and lengthened loading acceptable|max velocity exposure completed|repeated sprint and deceleration block tolerated|player sprint confidence restored",
      trainingChecklist: "posterior-chain strength|tempo running|controlled acceleration|near-max sprint exposure|late-session repeated sprint block",
      matchChecklist: "max velocity exposure restored|repeated sprint block completed|position-specific worst-case run completed|next-day response stable",
      mistakes: "clearing on jogging tolerance|skipping maximal sprinting|ignoring tendon involvement|returning after one good session",
      phases: "Rehab: settle symptoms and restore isometric and lengthened hamstring capacity.|Modified: add tempo running, acceleration and controlled ball work.|Full: complete max velocity, repeated sprint and position-specific runs.|Match: protect minutes and congestion after sprint exposure is restored.",
      loadText: "Running: progress tempo to high-speed running before max velocity.|Sprint: expose acceleration, fly-ins, curved runs and repeated sprinting.|COD: add deceleration and re-acceleration after sprint tolerance.|GPS: compare max speed, sprint count and high-speed distance to positional baseline.",
      mechanism: `${name} is commonly driven by terminal swing sprinting, rapid acceleration, high-speed deceleration, overstretch tackling or aggressive kicking positions.`,
      imaging: "MRI is most useful when tendon involvement, large defect, recurrence, unclear prognosis or surgical decision-making would change loading rules.",
      strengthBenchmarks: "Use eccentric knee-flexor capacity, lengthened-position tolerance, hip extension strength, between-limb comparison and repeated sprint response rather than a single test.",
    },
    quadriceps: {
      summary: `${name} is an anterior-thigh load problem where sprinting, kicking, braking and strike volume must be restored without recurrence.`,
      evidence: "Evidence is moderate for general muscle RTP principles and weaker for individual quadriceps subtypes; kicking exposure, central tendon or avulsion features require caution.",
      experience: "Football progression often fails when long kicking, shooting under fatigue or high-speed braking are added after only straight-line running.",
      redFlags: "large defect or expanding bruising|central tendon or avulsion suspicion|loss of active knee extension|severe swelling or myositis concern",
      criteria: "pain-free resisted knee extension|kicking volume tolerated|sprint and braking mechanics restored|shooting confidence acceptable|no next-day anterior thigh response",
      trainingChecklist: "quad strength and range|tempo running|controlled striking|deceleration mechanics|progressive shooting volume",
      matchChecklist: "full striking load completed|late-session braking stable|position-specific sprint/kick action completed|minutes and set-piece load agreed",
      mistakes: "clearing before kicking load|ignoring central tendon involvement|adding shooting and sprinting together|underloading deceleration",
      loadText: "Running: restore stride and braking tolerance separately.|Sprint: add acceleration and high-speed running before repeated sprinting.|COD: include hard braking and re-acceleration.|GPS: monitor high-speed running, decels and shooting/set-piece exposure.",
      mechanism: `${name} is commonly linked to high-speed kicking, sprint acceleration, deceleration, resisted knee extension or direct contact to the anterior thigh.`,
      imaging: "Imaging is considered for suspected central tendon involvement, avulsion, large hematoma, myositis ossificans risk or uncertain prognosis.",
    },
    groin: {
      summary: `${name} is a groin capacity problem where adductor strength, cutting, lateral braking, rotation and kicking must be rebuilt together.`,
      evidence: "Adductor strength, previous groin symptoms and multi-structure groin pain have moderate football evidence; exact subtype RTP evidence is often limited.",
      experience: "The decisive football gate is usually not straight running; it is tackle reach, lateral press, striking, shielding and repeated rotation under fatigue.",
      redFlags: "testicular or abdominal referral|suspected hernia or acute pubic injury|pubic bone stress symptoms|systemic or night pain",
      criteria: "pain-free squeeze or adductor loading|adductor and hip strength acceptable|kicking volume tolerated|reactive cutting and lateral braking completed|tackle reach and shielding confidence acceptable",
      trainingChecklist: "adductor isometrics and strength|linear running|lateral shuffle and braking|controlled passing and striking|reactive COD and duel reach",
      matchChecklist: "full kicking load completed|late-session lateral COD stable|tackle reach and shielding tolerated|congestion and surface risk reviewed",
      mistakes: "clearing before kicking load|overstretching early|missing hip or pubic differential|underloading lateral braking",
      loadText: "Running: build linear load before aggressive lateral work.|Sprint: add once adductor response is stable.|COD: progress lateral brake, cut, rotate and tackle reach.|GPS: monitor accel/decel density and position-specific lateral demand.",
      mechanism: `${name} is commonly provoked by rapid cutting, forced abduction, shooting/crossing, tackle reach, rotational shielding or cumulative adductor load.`,
      differential: `${name} must be differentiated from hip joint pathology, pubic bone stress, aponeurotic injury, abdominal wall pain, hernia-related presentations and referred lumbar symptoms.`,
      strengthBenchmarks: "Use adductor squeeze response, hip adduction/abduction strength, trunk-pelvis control and football-specific kicking/COD tolerance.",
    },
    calf: {
      summary: `${name} is a lower-leg running-density problem where push-off, acceleration, braking and repeatability matter more than pain-free jogging alone.`,
      evidence: "Calf and Achilles RTP evidence supports progressive loading, strength/endurance testing and response monitoring; football-specific subtype data is limited and recurrence risk is clinically important.",
      experience: "Calf problems often look settled in gym work but fail when dense accelerations, surface changes or late-session running are reintroduced.",
      redFlags: "DVT signs|Achilles rupture suspicion|marked swelling or progressive weakness|neurological or vascular symptoms",
      criteria: "pain-free calf raise or push-off capacity|soleus/gastrocnemius endurance acceptable|acceleration and deceleration block tolerated|late-session running density tolerated|no next-day calf or tendon response",
      trainingChecklist: "bent-knee and straight-knee calf loading|tempo running|controlled accelerations|braking mechanics|football possession density",
      matchChecklist: "repeated acceleration block completed|late-session calf response stable|surface and footwear reviewed|minutes and congestion guardrails set",
      mistakes: "testing only straight jogging|missing bent-knee soleus capacity|rapid return on heavy surfaces|ignoring next-day tightness",
      loadText: "Running: separate volume, speed and density.|Sprint: progress acceleration before repeated max efforts.|COD: add braking after calf endurance is stable.|GPS: monitor accelerations, decelerations, total distance and surface context.",
      mechanism: `${name} is commonly linked to push-off, acceleration, rapid deceleration, jump/landing or sudden changes in surface and running density.`,
      differential: `${name} should be differentiated from Achilles injury, plantaris injury, DVT concern, neural referral and lower-leg bone stress.`,
      strengthBenchmarks: "Use calf raise capacity, bent-knee soleus endurance, reactive stiffness, hop tolerance and repeated acceleration response.",
    },
    "lower leg": {
      summary: `${name} is a lower-leg load and diagnostic-control problem; RTP must separate soft-tissue tolerance, exertional symptoms, bone stress and neurovascular risk before football exposure.`,
      evidence: "Lower-leg RTP evidence is condition-specific and often limited; diagnostic confidence and response to running density guide progression.",
      experience: "Elite football should watch surface change, boot/footwear change, acceleration density and recurrent shin or exertional symptoms.",
      redFlags: "neurovascular symptoms|exertional symptoms that escalate predictably|focal bone tenderness or night ache|marked swelling or DVT/compartment concern",
      criteria: "diagnosis and red flags reviewed|walking and resisted loading stable|graded running tolerated|acceleration/deceleration exposure restored without next-day flare",
      trainingChecklist: "symptom mapping|footwear and surface review|graded running|calf/tibial strength and endurance|controlled acceleration and braking",
      matchChecklist: "running density restored|surface/footwear plan agreed|late-session response stable|medical escalation rules documented",
      mistakes: "assuming all shin pain is muscle soreness|ignoring exertional neurovascular symptoms|rushing focal bone pain|changing footwear and running load together",
      loadText: "Running: progress volume, surface and density separately.|Sprint: add only after exertional symptoms stay stable.|COD: add braking after linear response is reliable.|GPS: monitor total distance, accelerations, decelerations and surface exposure.",
      mechanism: `${name} may follow sudden running-volume changes, footwear/surface change, braking load, anterior compartment demand, tibial loading or exertional neurovascular limitation.`,
      differential: `${name} should be differentiated from tibial bone stress, exertional compartment syndrome, vascular symptoms, calf/Achilles injury and referred lumbar or neural symptoms.`,
      strengthBenchmarks: "Use dorsiflexion/plantarflexion capacity, calf and tibial endurance, hop response, foot control and repeated acceleration tolerance.",
    },
    tendon: {
      summary: `${name} is a tendon load-tolerance and energy-storage problem; pain response, stiffness, jumping, sprinting and 24-hour reaction guide progression.`,
      evidence: "Tendon evidence supports progressive loading, pain-monitoring models and energy-storage progression, while exact football-specific exposure thresholds remain limited.",
      experience: "Elite football progression should not stack heavy gym loading, plyometrics, sprinting and match congestion before the 24-hour tendon response is known.",
      redFlags: "suspected rupture|sudden pop or loss of force|rapid swelling|systemic inflammatory signs",
      criteria: "morning or 24-hour response stable|heavy loading tolerated|energy-storage loading tolerated|sprint/jump/COD exposure restored progressively",
      trainingChecklist: "isometric or heavy slow resistance|controlled running|low-amplitude plyometrics|progressive sprint or jump load|next-day tendon review",
      matchChecklist: "repeated sprint/jump block tolerated|surface and footwear reviewed|congestion plan agreed|symptom response stable across several exposures",
      mistakes: "rest-only plan|adding plyometrics too quickly|ignoring morning stiffness|using pain score without function",
      loadText: "Running: progress volume and speed separately.|Sprint: add after load and stiffness response are stable.|COD: add braking and re-acceleration gradually.|GPS: track sprint count, deceleration density and jump exposure where relevant.",
      mechanism: `${name} usually reflects cumulative load, compression, energy-storage demand or sudden training spikes exceeding current tendon capacity.`,
      imaging: "Imaging can support diagnosis when rupture, partial tear, unusual location or poor response would alter progression, but symptoms and function remain central.",
      strengthBenchmarks: "Use heavy load tolerance, endurance, rate-of-force development, reactive hop or jump response and position-specific energy-storage exposure.",
    },
    ankle: {
      summary: `${name} is an ankle stability, landing, cutting and braking problem; RTP must prove rotational control and repeatable football change of direction.`,
      evidence: "Ankle sprain and instability evidence supports pain, ankle impairments, athlete perception, sensorimotor control and sport-functional performance domains; syndesmosis and osteochondral subtypes require more cautious progression.",
      experience: "Football return is tested by contested landing, reactive cut, rapid re-acceleration, surface/boot choice and confidence late in training.",
      redFlags: "fracture suspicion|syndesmosis or diastasis concern|inability to bear weight|neurovascular symptoms",
      criteria: "pain and swelling controlled|ankle range/strength/power acceptable|sensorimotor control and balance restored|reactive cutting tolerated|athlete confidence stable|support, brace or tape decision agreed if needed",
      trainingChecklist: "range and swelling control|balance and proprioception|linear running|planned COD|reactive COD and contested landing",
      matchChecklist: "late-session cutting stable|recurrent instability risk reviewed|surface/footwear checked|minutes guidance agreed",
      mistakes: "returning with swelling|missing syndesmosis differential|skipping reactive landing|not using support for recurrent instability when indicated",
      loadText: "Running: progress as swelling and push-off allow.|Sprint: add after landing and ankle stiffness are stable.|COD: planned turns before reactive cuts and braking.|GPS: monitor decels, accelerations and cutting density.",
      mechanism: `${name} is commonly driven by inversion/eversion load, external rotation, landing contact, cutting, braking or surface-related foot fixation.`,
      differential: `${name} must be differentiated from fracture, syndesmosis injury, osteochondral lesion, tendon subluxation and midfoot injury.`,
    },
    foot: {
      summary: `${name} is a foot load, push-off and surface-tolerance problem where footwear, acceleration, cutting and landing exposure must be controlled.`,
      evidence: "Foot injury evidence varies widely by structure; high-risk midfoot, navicular, sesamoid and fifth metatarsal presentations require conservative medical governance.",
      experience: "Elite football often exposes symptoms through boot pressure, turf/grass changes, push-off, crossing/shooting and repeated small-space cutting.",
      redFlags: "focal bone tenderness|midfoot instability concern|night ache or progressive pain|neurovascular symptoms",
      criteria: "walking and push-off stable|footwear and surface tolerance confirmed|running and landing exposure tolerated|cutting and acceleration restored|next-day focal pain absent",
      trainingChecklist: "foot intrinsic and calf capacity|boot and orthotic check if relevant|linear running|push-off drills|cutting and landing exposure",
      matchChecklist: "surface and footwear plan agreed|late-session push-off stable|position-specific cutting completed|next-day foot response stable",
      mistakes: "ignoring footwear or surface|rushing bone stress presentations|clearing before push-off load|missing midfoot instability",
      loadText: "Running: restore pain-free load before speed density.|Sprint: progress acceleration and push-off carefully.|COD: add cutting after footwear and landing tolerance.|GPS: monitor accel/decel load and surface exposure.",
      mechanism: `${name} is commonly linked to repetitive push-off, cutting, landing, boot pressure, surface change or direct contact to the foot.`,
      imaging: "Imaging is important when high-risk bone stress, fracture, Lisfranc injury or persistent focal pain would change weight-bearing and RTP rules.",
    },
    knee: {
      summary: `${name} is a knee load, swelling, stability and football-braking problem; RTP must restore deceleration, rotation, jumping and contact tolerance as relevant.`,
      evidence: "Knee RTP evidence is stronger for broad ACL/meniscus principles than for every subtype; effusion, strength, psychological readiness and functional exposure remain key decision anchors.",
      experience: "Professional football return is often limited by late-session deceleration, reactive turns, contact confidence, landing quality and swelling the next day.",
      redFlags: "large or reactive effusion|true locking|giving way or instability|infection signs post-op|neurovascular symptoms",
      criteria: "no reactive swelling|functional range restored|strength and landing control acceptable|rotational football exposure tolerated|confidence and contact readiness reviewed",
      trainingChecklist: "strength and range|linear running|landing mechanics|planned COD|reactive COD and contact if relevant",
      matchChecklist: "no effusion after full training|deceleration and rotation block completed|contact confidence reviewed|minutes and congestion plan agreed",
      mistakes: "ignoring swelling|clearing on straight running|underweighting deceleration|treating all knee pathology the same",
      loadText: "Running: begin when swelling and mechanics are stable.|Sprint: add after strength and landing control.|COD: progress planned to reactive cutting and braking.|GPS: benchmark decel density, high-speed exposure and total load.",
      mechanism: `${name} may be provoked by valgus/varus load, rotation, deep flexion, deceleration, landing, contact or cumulative tendon/cartilage stress.`,
      differential: `${name} should be differentiated from meniscal, ligament, patellofemoral, tendon, cartilage, bone stress and referred hip/lumbar drivers.`,
      strengthBenchmarks: "Use quadriceps and hamstring capacity, hip control, landing quality, hop/jump tolerance and deceleration mechanics.",
    },
    hip: {
      summary: `${name} is a hip and pelvis capacity problem where rotation, kicking, acceleration, shielding and position-specific turns drive RTP decisions.`,
      evidence: "Hip and pelvis RTP evidence is often limited; symptoms, strength, rotation tolerance and football exposure should guide progression.",
      experience: "Players may tolerate running before repeated striking, deep hip flexion, shielding contact or rotation under fatigue.",
      redFlags: "night pain|stress fracture concern|systemic symptoms|neurological signs|true locking or severe range loss",
      criteria: "hip symptoms stable|hip and trunk strength acceptable|kicking and rotation tolerated|sprint/COD exposure completed",
      trainingChecklist: "hip strength and mobility|linear running|controlled kicking|rotation and cutting|shielding/contact if position needs it",
      matchChecklist: "kicking and rotation stable|position-specific turns completed|travel/sitting load reviewed|minutes guidance agreed",
      mistakes: "treating morphology alone as diagnosis|ignoring kicking load|too much deep flexion early|underloading rotation",
      loadText: "Running: often precedes kicking and rotation.|Sprint: add as hip extension and acceleration tolerate.|COD: progress rotation and braking.|GPS: monitor accelerations, decels and high-speed exposure.",
      mechanism: `${name} is commonly linked to kicking, cutting, hip extension/flexion extremes, rotation, shielding or cumulative sprint and travel load.`,
      differential: `${name} should be differentiated from groin/adductor pathology, lumbar referral, bone stress, labral/FAI symptoms and deep gluteal neural irritation.`,
    },
    "bone stress": {
      summary: `${name} is a bone-load and recovery problem; RTP is governed by diagnosis confidence, healing response, energy availability and graded impact exposure.`,
      evidence: "Bone stress evidence supports risk stratification by site, symptoms, imaging, metabolic risk and load response; elite football return thresholds remain partly consensus-led.",
      experience: "Medical should move conservatively when focal pain, low energy availability, menstrual disruption, low bone health markers or high-risk bone location is present.",
      redFlags: "night pain or pain at rest|focal bone tenderness worsening|high-risk bone site|low energy availability or menstrual disruption",
      criteria: "pain-free daily loading|medical review of imaging/risk status|energy availability and bone-health risks addressed|graded running tolerated|jump/cutting exposure restored without next-day bone pain",
      trainingChecklist: "relative unload or protected load as needed|strength and nutrition review|graded walk-run|impact progression|football cutting only after running response",
      matchChecklist: "impact progression completed|energy availability risk addressed|surface and minutes plan agreed|no focal next-day bone response",
      mistakes: "treating as soft-tissue soreness|rushing high-risk sites|ignoring RED-S or nutrition|clearing before impact progression",
      loadText: "Running: staged walk-run before continuous running.|Sprint: late-stage after impact response is stable.|COD: add cutting after running and jumping tolerance.|GPS: monitor impact volume, high-speed load and surface changes.",
      mechanism: `${name} reflects repetitive bone loading where recovery, energy availability, surface, footwear and training spikes may exceed adaptation.`,
      imaging: "MRI or appropriate imaging is important for diagnosis, site risk, grade and return-to-impact decisions in suspected bone stress injuries.",
      monitoring: "Monitor focal pain, hop response, next-day bone symptoms, energy availability markers, menstrual context when relevant, sleep, nutrition and impact progression.",
    },
    fracture: {
      summary: `${name} is a tissue-healing and contact-risk problem; RTP requires bone healing confidence plus progressive running, landing and football contact exposure.`,
      evidence: "Fracture RTP is condition-specific and often consensus-led; imaging, surgical status, symptoms and contact risk govern progression.",
      experience: "Elite football staffs should separate training fitness from structural tolerance, protective equipment and re-injury risk in duels or landings.",
      redFlags: "loss of alignment or healing concern|neurovascular symptoms|infection or wound concern|increasing pain with protected loading",
      criteria: "medical healing status confirmed|functional strength and range restored|running/landing tolerated|contact or protective plan agreed",
      trainingChecklist: "protected load progression|strength and range|linear running|landing or contact exposure|protective equipment check if relevant",
      matchChecklist: "healing and contact risk reviewed|full training response stable|surface/protection plan agreed|minutes guidance conservative",
      mistakes: "clearing before healing status|ignoring contact recurrence|overvaluing fitness over structure|failing to plan protection or surface",
      loadText: "Running: begins only when healing and symptoms allow.|Sprint: late after load tolerance and mechanics return.|COD: add braking/cutting after running response.|GPS: monitor impact load and contact exposure.",
      mechanism: `${name} is commonly driven by direct contact, fall/landing, torsion, repetitive load or stress-to-fracture progression.`,
      imaging: "Repeat imaging or surgical review may be required when healing status, fixation, union risk or high-risk location changes RTP rules.",
    },
    surgical: {
      summary: `${name} is a post-operative RTP pathway where tissue healing, surgeon protocol, swelling/pain response and football demand readiness must be cleared separately.`,
      evidence: "Surgical RTP evidence is procedure-specific and often limited in elite women's football; surgeon protocol, tissue healing, effusion response and objective function govern progression.",
      experience: "The main failure mode is progressing football chaos, contact or sprinting faster than tissue protection and capacity restoration allow.",
      redFlags: "infection or wound concern|new instability or mechanical symptoms|reactive swelling escalating|neurovascular symptoms",
      criteria: "surgeon and Medical restrictions satisfied|swelling and pain response stable|strength and movement quality acceptable|psychological readiness reviewed|football exposure rebuilt in stages",
      trainingChecklist: "protocol restrictions checked|strength and range benchmarks|controlled running or impact|planned COD/contact if allowed|full football progression",
      matchChecklist: "procedure-specific restrictions cleared|multiple full sessions tolerated|congestion plan conservative|next decision point documented",
      mistakes: "using generic timelines|ignoring surgical restrictions|stacking contact and sprint too early|not documenting hold rules",
      loadText: "Running: follows procedure-specific protection rules.|Sprint: added only after strength, mechanics and tissue response allow.|COD: progress planned before reactive and contact chaos.|GPS: compare total, high-speed and accel/decel load to staged targets.",
      mechanism: `${name} should be managed according to the repaired tissue, surgical findings, protection rules and the football demands that created or expose the deficit.`,
      imaging: "Imaging or surgeon review is considered when symptoms, swelling, fixation/hardware, repair integrity or unexpected delay alters progression.",
    },
    spine: {
      summary: `${name} is a spine or trunk presentation, not just a pain score; RTP must rule out red flags and restore sprint, rotation, contact and travel tolerance.`,
      evidence: "Evidence supports active management for many mechanical presentations, but diagnosis-specific red flags and neurological signs govern escalation.",
      experience: "Football symptoms often reappear through shooting, turning, aerial duels, contact, long travel and late-session accelerations.",
      redFlags: "neurological deficit|bowel or bladder symptoms|night pain or systemic symptoms|major trauma or progressive weakness",
      criteria: "diagnostic concern ruled out|rotation and sprint tolerated|contact exposure completed if relevant|travel and next-day response stable",
      trainingChecklist: "symptom classification|trunk endurance and strength|running exposure|rotation/kicking progression|contact or aerial exposure if needed",
      matchChecklist: "late-session sprint and rotation stable|no neurological symptoms|travel load reviewed|minutes guidance agreed",
      mistakes: "treating pain as the diagnosis|missing radicular signs|returning before rotation|ignoring travel and sleep load",
      loadText: "Running: progress by symptom and neurological response.|Sprint: include trunk stiffness and acceleration response.|COD: add rotation, braking and contact progressively.|GPS: compare sprint and accel/decel exposure to baseline.",
      mechanism: `${name} may arise from rotation, extension/flexion load, contact, sprint stiffness, travel posture or repeated kicking/shooting demand.`,
      differential: `${name} should be differentiated from neurological referral, bone stress, hip/groin contribution, rib/thoracic pathology and systemic red flags.`,
    },
    shoulder: {
      summary: `${name} is an upper-quarter contact, landing and overhead-tolerance problem, with goalkeeper demands requiring extra exposure detail.`,
      evidence: "Shoulder RTP evidence is variable; instability, strength, range, apprehension and contact/landing exposure drive practical football decisions.",
      experience: "Outfield players need duel/fall tolerance; goalkeepers need diving, reach, distribution and repeated landing tolerance before match demand.",
      redFlags: "recurrent dislocation or instability|neurovascular symptoms|fracture suspicion|night pain or severe weakness",
      criteria: "range and strength restored|apprehension controlled|landing/contact exposure tolerated|goalkeeper-specific handling completed if relevant",
      trainingChecklist: "scapular and cuff capacity|range and strength|controlled fall/landing|contact exposure|goalkeeper reach and distribution if relevant",
      matchChecklist: "contact or landing confidence stable|protective plan if needed|goalkeeper handling load completed if relevant|minutes/role guidance agreed",
      mistakes: "ignoring goalkeeper demands|clearing before contact landing|missing instability recurrence|undertraining overhead endurance",
      loadText: "Running: usually secondary unless arm swing or contact symptoms limit.|Sprint: restore natural arm swing and contact readiness.|COD: include bracing/fall exposure if relevant.|GPS: pair field load with contact, dive or landing exposure notes.",
      mechanism: `${name} is commonly linked to falling, diving, contact duels, overhead reach, throwing/distribution or recurrent instability.`,
    },
    "upper limb": {
      summary: `${name} is a grip, contact, fall and ball-handling tolerance problem; RTP depends on protection, pain, function and position demand.`,
      evidence: "Upper-limb football evidence is limited and structure-specific; fracture/ligament stability and contact exposure guide return.",
      experience: "Goalkeepers need a higher handling, save and landing threshold than most outfield players, while outfield contact risk still matters.",
      redFlags: "fracture or instability concern|neurovascular symptoms|progressive swelling|loss of grip or protective function",
      criteria: "pain and swelling controlled|grip or protective function restored|fall/contact exposure tolerated|splint/tape plan agreed if needed",
      trainingChecklist: "range and grip capacity|protective equipment check|controlled contact|fall or landing exposure|ball handling for goalkeeper if relevant",
      matchChecklist: "contact tolerance confirmed|protection plan approved|position-specific handling or duel exposure completed|re-injury risk reviewed",
      mistakes: "ignoring protection fit|clearing before contact/fall exposure|underestimating goalkeeper handling|missing fracture instability",
      loadText: "Running: unrestricted only if arm mechanics and protection are safe.|Sprint: confirm protection does not alter mechanics.|COD: include brace/fall confidence.|GPS: field load should be paired with contact/handling notes.",
      mechanism: `${name} is commonly linked to fall on outstretched hand, ball impact, contact, bracing, diving or repeated throwing/handling load.`,
    },
    neurological: {
      summary: `${name} is Medical-governed; symptom resolution, cognitive load, exertion, contact and neurological safety override football availability pressure.`,
      evidence: "Concussion and neurological RTP rely on consensus safety protocols, symptom monitoring, graded exertion/contact progression and healthcare-provider clearance; football-specific evidence varies.",
      experience: "Elite football should also manage travel, meetings, screen load, heading/contact exposure, media stress and symptom honesty.",
      redFlags: "worsening headache or repeated vomiting|seizure or focal neurological signs|progressive weakness/numbness|neck injury or loss of consciousness concern",
      criteria: "medical review completed|symptoms stable at rest and exertion|cognitive/vestibular/ocular load tolerated|return-to-learn/workload considered|contact or heading progression medically cleared",
      trainingChecklist: "relative rest or symptom-limited activity|graded aerobic exposure|non-contact football|controlled football complexity|contact/heading only when medically cleared",
      matchChecklist: "medical clearance documented|contact progression complete if relevant|symptoms absent or medically governed|coach receives only safe status band",
      mistakes: "same-day return|using fitness as clearance|hiding symptoms|progressing contact before medical clearance|sharing private neurological details with coaches",
      loadText: "Running: graded exertion only when medically appropriate.|Sprint: late-stage and symptom-monitored.|COD: add once exertion and visual/vestibular response tolerate.|GPS: secondary to symptoms, protocol status and medical clearance.",
      mechanism: `${name} may follow contact, heading, acceleration/deceleration forces, cervical contribution or exertional neurological/systemic triggers.`,
      imaging: "Imaging is urgent when red flags, worsening symptoms, focal signs or structural concern are present; routine imaging does not replace clinical concussion governance.",
      monitoring: "Monitor symptom scales, cognitive load, sleep, vestibular/ocular response, exertion response, contact progression and player-reported confidence.",
    },
    medical: {
      summary: `${name} is a Medical-governed availability issue; clinical safety, systemic risk and privacy come before performance demand or coach selection.`,
      evidence: "Evidence is condition-specific and often consensus-led; medical diagnosis, red flags, RED-S/energy availability context and specialist guidance govern RTP decisions.",
      experience: "Coach output should stay high-level: status band, restrictions and next decision point, without private symptoms, diagnoses or sensitive context.",
      redFlags: "chest pain, palpitations or syncope|shortness of breath or worsening systemic symptoms|fever or acute illness deterioration|neurological signs or severe dehydration",
      criteria: "Medical confirms participation safety|systemic symptoms stable|energy availability or recovery risks considered when relevant|graded exertion tolerated|privacy and coach-safe communication agreed",
      trainingChecklist: "medical review|symptom and vital/context check|graded aerobic exposure|controlled team reintegration|next-day response review",
      matchChecklist: "medical participation decision documented|travel/heat/congestion risk reviewed|coach-safe restrictions agreed|next decision point set",
      mistakes: "treating systemic issues as fitness only|sharing private medical detail|returning during red flags|ignoring travel, heat or recovery context",
      loadText: "Running: graded by medical response and systemic tolerance.|Sprint: late-stage only after exertion response is stable.|COD: add after general exertion and football movement are tolerated.|GPS: use as exposure context, not medical clearance.",
      mechanism: `${name} may reflect systemic illness, recovery debt, environmental stress, medication context, energy availability or other medical drivers rather than a local tissue injury.`,
      differential: `${name} should be differentiated from cardiac, respiratory, neurological, endocrine, nutritional, medication-related and mental health contributors as clinically appropriate.`,
      monitoring: "Monitor symptoms, exertion response, sleep, hydration, heat/travel context, energy availability when relevant, and private medical red flags.",
    },
    goalkeeper: {
      summary: `${name} is a position-demand guide for goalkeeper-specific RTP: diving, landing, distribution, reach, contact and repeated save exposure must be staged.`,
      evidence: "Goalkeeper-specific RTP evidence is limited; recommendations are mostly expert consensus layered onto tissue-specific principles.",
      experience: "The goalkeeper gate is repeated high-load actions under fatigue, not only outfield running or gym readiness.",
      redFlags: "loss of confidence with landing or diving|protective reaction deficit|symptoms during distribution or save impact|unresolved tissue-specific red flags",
      criteria: "goalkeeper handling or diving exposure tolerated|landing mechanics stable|distribution load restored|next-day response stable",
      trainingChecklist: "technical handling|controlled dives|landing progression|distribution volume|reactive save sequence",
      matchChecklist: "repeated save block completed|surface and landing load reviewed|distribution load agreed|coach-safe role restriction documented",
      mistakes: "using outfield running as goalkeeper clearance|skipping dive volume|ignoring landing surface|not tracking distribution load",
      loadText: "Running: maintain general football capacity while respecting injury limits.|Sprint: add short accelerations and recovery steps as needed.|COD: include set position, shuffle, dive and recovery transitions.|GPS: pair field metrics with dive, landing and distribution counts.",
      mechanism: `${name} is driven by repeated dives, hard landings, explosive lateral movement, distribution volume, ball impact and contact in crowded areas.`,
    },
    contusion: {
      summary: `${name} is a contact trauma and range/load-tolerance problem; bruising, hematoma risk, pain inhibition and repeat contact exposure guide progression.`,
      evidence: "Contusion RTP evidence is limited; clinical response, range restoration and complication screening govern decisions.",
      experience: "Football return often depends on whether the player can sprint, strike, duel and tolerate contact without protective guarding.",
      redFlags: "rapid swelling or expanding hematoma|neurovascular symptoms|compartment or DVT concern by region|myositis ossificans concern",
      criteria: "range and pain improving|strength not inhibited|running/contact exposure tolerated|protective padding plan if needed",
      trainingChecklist: "compression and range management|progressive strength|linear running|contact re-exposure|protective equipment check",
      matchChecklist: "contact tolerance confirmed|position-specific duel exposure completed|padding decision agreed|no worsening next-day response",
      mistakes: "aggressive early massage or stretching|ignoring swelling|clearing before contact confidence|missing regional red flags",
      loadText: "Running: progress as range and pain allow.|Sprint: add after stride is not guarded.|COD: add braking and contact once pain inhibition settles.|GPS: compare running load while recording contact exposure.",
      mechanism: `${name} follows direct impact, collision, fall or ball/contact trauma that limits range, strength, confidence or football contact tolerance.`,
    },
    operations: {
      summary: `${name} is an operational RTP load-management guide; the key question is whether the player can tolerate the next football demand in context.`,
      evidence: "Operational RTP decisions are consensus-led and should integrate medical safety, performance readiness, historical load and contextual risk.",
      experience: "Fixture congestion, travel, heat, surface changes and role demand can turn a medically stable player into a higher-risk selection.",
      redFlags: "unresolved medical red flag|acute fatigue with declining performance|major sleep/travel disruption|recurrent symptoms under congestion",
      criteria: "Medical participation status stable|Performance demand gap acceptable|coach-safe restrictions documented|next decision point agreed",
      trainingChecklist: "review last exposure|control next field/gym dose|separate speed, COD and contact|monitor next-day response",
      matchChecklist: "minutes guidance band agreed|congestion and travel reviewed|role restriction understood|post-match review scheduled",
      mistakes: "treating availability as performance|ignoring travel and heat|adding minutes without exposure|not documenting the bottleneck",
      loadText: "Running: match volume to recovery state.|Sprint: protect high-intensity exposures under congestion.|COD: dose braking and contact separately.|GPS: compare load to individual baseline and recent acute history.",
      mechanism: `${name} is driven by the interaction between recent exposure, recovery, context and the next planned football demand.`,
    },
  };
  return { ...base, ...(templates[family] || {}) };
};
