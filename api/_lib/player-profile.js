const { projectActuals } = require("./performance-gps-actuals.js");

const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";

function projectPlayerProfile(actor, player) {
  const firstName = text(actor.firstName, 80);
  const lastName = text(actor.lastName, 80);
  const accountName = [firstName, lastName].filter(Boolean).join(" ");
  return {
    id: actor.id,
    firstName,
    lastName,
    name: accountName && accountName !== "New User" ? accountName : text(player?.name, 160) || accountName,
    email: text(actor.email, 254),
    imageUrl: /^https:\/\//i.test(actor.profileImageUrl || "") ? text(actor.profileImageUrl, 1000) : "",
    team: player ? "North Carolina Courage" : "",
  };
}

function projectPlayerModules(data, playerId, activities) {
  if (data?.playerId !== playerId || !Array.isArray(data.gps)) return null;
  const focus = text(data.development?.focus, 180);
  const nextStep = text(data.development?.nextStep, 800);
  const development = focus && nextStep ? {
    focus, nextStep, feedback: text(data.development.feedback, 1200),
    publishedAt: text(data.development.publishedAt, 40),
  } : null;
  const gps = projectActuals(data.gps, [playerId], activities.keys()).flatMap(({ activityId, metrics }) => {
    const { date, title } = activities.get(activityId);
    const values = Object.fromEntries(["distance", "hsr", "maxSpeed"]
      .filter((key) => Object.hasOwn(metrics, key)).map((key) => [key, metrics[key]]));
    return Object.keys(values).length ? [{
      activityId, date, title: text(title, 160) || "Activity", ...values,
    }] : [];
  }).sort((a, b) => b.date.localeCompare(a.date));
  return { development, gps };
}

module.exports = { projectPlayerProfile, projectPlayerModules };
