import permissionMatrix from "./permission-matrix.cjs";

export const actionForMethod = permissionMatrix.actionForMethod;
export const apiRouteSecurity = permissionMatrix.apiRouteSecurity;
export const getApiActionForMethod = permissionMatrix.getApiActionForMethod;
export const getApiRouteSecurityConfig = permissionMatrix.getApiRouteSecurityConfig;
export const getModulePermissionContract = permissionMatrix.getModulePermissionContract;
export const hasModulePermission = permissionMatrix.hasModulePermission;
export const normalizeAction = permissionMatrix.normalizeAction;
export const normalizeRole = permissionMatrix.normalizeRole;
export const normalizeRoute = permissionMatrix.normalizeRoute;
export const permissionActions = permissionMatrix.permissionActions;
export const platformPermissionMatrix = permissionMatrix.platformPermissionMatrix;
export const platformPermissionMatrixByModule = permissionMatrix.platformPermissionMatrixByModule;
export const platformRoles = permissionMatrix.platformRoles;

export default permissionMatrix;
