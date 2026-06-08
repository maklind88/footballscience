export function createPlatformRuntimeHelpers({
  getPlatformUsers,
  parseScheduleDateValue,
  formatScheduleDateValue,
  periodizationRenderer,
  readPlatformFormValues = () => ({}),
  getPlatformPasswordValidationMessage = () => "",
  stripPlatformPasswordConfirmation = (values = {}) => values,
} = {}) {
  const safeGetUsers = typeof getPlatformUsers === "function" ? getPlatformUsers : () => [];

  return {
    getPlatformFormValues(form) {
      return readPlatformFormValues(form);
    },
    getPasswordValidationMessage(values = {}) {
      return getPlatformPasswordValidationMessage(values);
    },
    stripPasswordConfirmation(values = {}) {
      return stripPlatformPasswordConfirmation(values);
    },
    hasUserFieldConflict(userId, values = {}) {
      const username = String(values?.username || "").trim().toLowerCase();
      const email = String(values?.email || "").trim().toLowerCase();
      if (!username && !email) {
        return false;
      }
      return safeGetUsers().some(
        (user) =>
          user.id !== userId &&
          ((username && String(user.username || "").toLowerCase() === username) ||
            (email && String(user.email || "").toLowerCase() === email))
      );
    },
    isMedicalDateValue(dateValue) {
      const value = String(dateValue);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }
      if (typeof parseScheduleDateValue !== "function" || typeof formatScheduleDateValue !== "function") {
        return false;
      }
      const parsedDate = parseScheduleDateValue(value);
      return formatScheduleDateValue(parsedDate) === value;
    },
    getPeriodizationDayScheduleLabel(day) {
      return periodizationRenderer?.getDayScheduleLabel?.(day);
    },
    getPeriodizationMatchDayLabel(value) {
      return periodizationRenderer?.getMatchDayLabel?.(value);
    },
    getPeriodizationMultiFieldValue(field, dateValue) {
      return periodizationRenderer?.getMultiFieldValue?.(field, dateValue);
    },
    getPeriodizationCustomFieldValue(field, dateValue) {
      return periodizationRenderer?.getCustomFieldValue?.(field, dateValue);
    },
  };
}
