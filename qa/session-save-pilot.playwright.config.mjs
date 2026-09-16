import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

// Opt-in real PostgreSQL + browser proof. It must fail, not skip, if PG17 is absent.
export default defineConfig({ ...base, projects: base.projects.filter((project) => project.name === "chromium")
  .map((project) => ({ ...project, testMatch: /session-save-pilot-browser\.native\.spec\.mjs/ })) });
