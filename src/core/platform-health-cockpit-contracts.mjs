export const PLATFORM_HEALTH_COCKPIT_SCHEMA = "footballscience-platform-health-cockpit-v1";

const statusWeight = Object.freeze({
  pass: 0,
  warning: 1,
  missing: 2,
});

function normalizeStatus(status) {
  return Object.hasOwn(statusWeight, status) ? status : "warning";
}

function byId(items = []) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
}

function statusFromSources(sources = []) {
  return sources
    .filter(Boolean)
    .map((source) => normalizeStatus(source.status))
    .reduce((worst, status) => (statusWeight[status] > statusWeight[worst] ? status : worst), "pass");
}

function defaultDetails(source, fallback) {
  return String(source?.details || source?.source || source?.label || fallback || "").trim();
}

function cockpitItem({ id, label, group, owner, source, fallbackStatus = "warning", fallbackDetails, nextStep, evidence = [] }) {
  const status = source ? normalizeStatus(source.status) : normalizeStatus(fallbackStatus);
  return Object.freeze({
    id,
    label,
    group,
    owner,
    status,
    details: defaultDetails(source, fallbackDetails),
    checkedAt: source?.checkedAt || null,
    nextStep,
    evidence: Object.freeze([...(source?.evidence || []), ...evidence]),
  });
}

export function createPlatformHealthCockpit(options = {}) {
  const liveSignals = byId(options.liveSignals);
  const sections = byId(options.sections);
  const workflows = byId(options.workflows);
  const environment = byId(options.environment);
  const observabilitySignals = byId(options.observabilitySignals);

  const productionRuntime = liveSignals.get("vercel-production");
  const deployRun = liveSignals.get("production-deploy-run");
  const monitorRun = liveSignals.get("production-monitor-run");
  const backup = liveSignals.get("backup-freshness");
  const authHealth = liveSignals.get("auth-health");
  const firewall = liveSignals.get("traffic-firewall");
  const incidents = liveSignals.get("incident-alerts");
  const egress = liveSignals.get("supabase-egress");
  const liveQa = liveSignals.get("live-qa");
  const staging = sections.get("staging-mirror");
  const observability = sections.get("observability");

  return Object.freeze([
    cockpitItem({
      id: "production-runtime",
      label: "Production Runtime",
      group: "Release",
      owner: "Vercel",
      source: productionRuntime,
      fallbackDetails: "Production runtime could not be identified.",
      nextStep: "Verify Vercel production environment before release.",
    }),
    cockpitItem({
      id: "last-production-deploy",
      label: "Last Deploy",
      group: "Release",
      owner: "GitHub Actions",
      source: deployRun,
      fallbackDetails: "Latest production deploy run is not connected.",
      nextStep: "Check Production Deploy workflow before shipping risky work.",
    }),
    cockpitItem({
      id: "production-monitor",
      label: "Production Monitor",
      group: "Monitoring",
      owner: "GitHub Actions",
      source: monitorRun || liveSignals.get("release-monitor"),
      fallbackDetails: "Scheduled production monitor status is not connected.",
      nextStep: "Keep Production Monitor green and no older than the monitoring window.",
    }),
    cockpitItem({
      id: "backup-restore",
      label: "Backup & Restore",
      group: "Data Safety",
      owner: "App-state backup",
      source: backup,
      fallbackDetails: "Backup freshness and restore-readiness are not connected.",
      nextStep: "Verify backup pointer, restore metadata, and restore drill.",
    }),
    cockpitItem({
      id: "auth-health",
      label: "Auth Health",
      group: "Access",
      owner: "Supabase Auth",
      source: authHealth,
      fallbackDetails: "Auth health endpoint is not connected.",
      nextStep: "Check /api/auth-health before assuming login is healthy.",
    }),
    cockpitItem({
      id: "traffic-firewall",
      label: "Traffic Firewall",
      group: "Abuse Protection",
      owner: "Vercel Firewall",
      source: firewall,
      fallbackDetails: "Firewall drift signal is not connected.",
      nextStep: "Run release:firewall and repair drift before high-traffic work.",
    }),
    cockpitItem({
      id: "open-incidents",
      label: "Open Incidents",
      group: "Incident Response",
      owner: "GitHub Issues",
      source: incidents,
      fallbackDetails: "Production incident issue status is not connected.",
      nextStep: "Review production-incident issues before deploying over failures.",
    }),
    cockpitItem({
      id: "egress-usage",
      label: "Egress Guardrail",
      group: "Cost & Scale",
      owner: "Supabase/Vercel",
      source: egress,
      fallbackDetails: "Egress usage guardrail is not fully connected.",
      nextStep: "Keep client polling and large payloads behind traffic contracts.",
    }),
    cockpitItem({
      id: "live-qa",
      label: "Live QA",
      group: "Release",
      owner: "Authenticated smoke",
      source: liveQa,
      fallbackDetails: "Authenticated live smoke is not connected.",
      nextStep: "Keep live QA credentials and peer chat smoke configured.",
    }),
    cockpitItem({
      id: "staging-mirror",
      label: "Staging Mirror",
      group: "Release",
      owner: "Safe Lane",
      source: staging,
      fallbackDetails: "Staging mirror requirements are not fully configured.",
      nextStep: "Keep staging host, Supabase ref, and QA login separate from Live.",
    }),
    cockpitItem({
      id: "observability-spine",
      label: "Observability Spine",
      group: "Monitoring",
      owner: "Platform contracts",
      source: {
        status: statusFromSources([observability, workflows.get("release-monitor"), environment.get("backup-cron")]),
        details: defaultDetails(observability, "Release, API, backup, auth, and performance signals are defined."),
        evidence: observabilitySignals.get("api-errors")?.evidence || [],
      },
      nextStep: "Keep release, API, backup, auth, permission, and performance signals visible.",
    }),
  ]);
}

export function summarizePlatformHealthCockpit(items = []) {
  const list = Array.isArray(items) ? items : [];
  return Object.freeze({
    total: list.length,
    ready: list.filter((item) => normalizeStatus(item.status) === "pass").length,
    warning: list.filter((item) => normalizeStatus(item.status) === "warning").length,
    missing: list.filter((item) => normalizeStatus(item.status) === "missing").length,
    worstStatus: statusFromSources(list),
  });
}
