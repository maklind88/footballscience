import { platformModuleRegistry } from "./module-registry.mjs";

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function hasRole(roleList, role) {
  return roleList.includes(normalizeRole(role));
}

export function canViewModule(role, moduleId, registry = platformModuleRegistry) {
  const module = registry.get(moduleId);
  return Boolean(module && hasRole(module.viewRoles, role));
}

export function canEditModule(role, moduleId, registry = platformModuleRegistry) {
  const module = registry.get(moduleId);
  return Boolean(module && hasRole(module.editRoles, role));
}

export function getModuleAccess(role, moduleId, registry = platformModuleRegistry) {
  return Object.freeze({
    canView: canViewModule(role, moduleId, registry),
    canEdit: canEditModule(role, moduleId, registry),
  });
}

