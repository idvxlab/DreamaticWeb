import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modelSettingsForRole,
  resolveModel,
} from "../packages/agents/src/models.js";
import { migrateConfig } from "../apps/server/src/config.js";
test("independent role endpoints and credentials inherit the complete reasoning profile only when unset", () => {
  const before = { ...process.env };
  try {
    Object.assign(process.env, {
      DREAMATIC_MODEL_MODE: "openai",
      DREAMATIC_MODEL: "custom-reasoning-name",
      DREAMATIC_BASE_URL: "https://api.example/v1/responses",
      DREAMATIC_API_KEY: "reason-key",
      DREAMATIC_ANALYST_MODEL: "",
      DREAMATIC_DESIGNER_MODEL: "",
    });
    assert.deepEqual(
      modelSettingsForRole("analyst"),
      modelSettingsForRole("orchestrator"),
    );
    assert.equal(resolveModel("orchestrator").model.api, "openai-responses");
    Object.assign(process.env, {
      DREAMATIC_ANALYST_MODEL_MODE: "openai-compatible",
      DREAMATIC_ANALYST_MODEL: "document-custom",
      DREAMATIC_ANALYST_BASE_URL: "http://localhost:11434/v1/chat/completions",
      DREAMATIC_ANALYST_API_KEY: "doc-key",
    });
    assert.equal(
      modelSettingsForRole("analyst").baseUrl,
      "http://localhost:11434/v1",
    );
    assert.equal(modelSettingsForRole("analyst").apiKey, "doc-key");
    assert.equal(resolveModel("analyst").model.api, "openai-completions");
    assert.equal(modelSettingsForRole("designer").id, "custom-reasoning-name");
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});
test("legacy saved profiles preserve model names, endpoints and secrets during migration", () => {
  const c = migrateConfig({
    mode: "live",
    provider: "openai",
    model: "legacy",
    baseUrl: "https://gateway.example/v1",
    apiKey: "saved-key",
    roles: { analyst: { model: "analysis" } },
  });
  assert.equal(c.models.reasoning.apiKey, "saved-key");
  assert.equal(c.models.analyst?.baseUrl, c.models.reasoning.baseUrl);
  assert.equal(c.models.designer, null);
});
