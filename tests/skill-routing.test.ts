import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverSkillCatalog,
  skillTools,
} from "../packages/agents/src/skills.js";
import type { Role } from "../packages/agents/src/contracts.js";

test("specialist methods are discoverable by content across formats and retain role permissions", async () => {
  const { skills, diagnostics } = await discoverSkillCatalog();
  assert.ok(
    !diagnostics.some((d) => /content-architecture|product-showcase/.test(d)),
    diagnostics.join("\n"),
  );
  const loaded: string[] = [];
  const list = async (role: Role, query: Record<string, string>) => {
    const result = await skillTools(skills, role, (n) =>
      loaded.push(n),
    )[0].execute("list", query);
    const content = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    return JSON.parse(content) as { name: string }[];
  };
  for (const role of ["analyst", "designer"] as Role[]) {
    for (const [task, name] of [
      ["content-architecture", "content-architecture"],
      ["product-showcase", "product-showcase"],
      ["data-analysis", "data-storytelling"],
    ]) {
      const candidates = await list(role, { format: "docx", task });
      assert.ok(
        candidates.some((s) => s.name === name),
        `${role}: ${name} should work with DOCX content`,
      );
      const result = await skillTools(skills, role, (n) =>
        loaded.push(n),
      )[1].execute("use", { name });
      assert.ok(result.content.length > 0);
    }
  }
  assert.ok(
    !(await list("orchestrator", { task: "product-showcase" })).some(
      (s) => s.name === "product-showcase",
    ),
  );
  await assert.rejects(
    () =>
      skillTools(skills, "orchestrator", () => {})[1].execute("use", {
        name: "content-architecture",
      }),
    /无权/,
  );
  assert.ok(
    (await list("analyst", { format: "html", task: "document-analysis" })).some(
      (s) => s.name === "evidence-analysis",
    ),
  );
  assert.ok(
    !(await list("designer", { task: "unregistered-task" })).some(
      (s) => s.name === "product-showcase",
    ),
    "task filters remain exact rather than loading every specialist",
  );
  assert.ok(loaded.includes("product-showcase"));
  assert.ok(
    skills
      .filter((s) =>
        ["content-architecture", "product-showcase"].includes(s.name),
      )
      .every(
        (s) => s.permissions.length === 1 && s.permissions[0] === "guidance",
      ),
  );
});

test("visual styles are optional Designer-only methods discoverable independently of source format", async () => {
  const { skills, diagnostics } = await discoverSkillCatalog();
  const names = ["technical-precision", "expressive-brand", "refined-minimal"];
  assert.ok(
    !diagnostics.some((d) => names.some((n) => d.includes(n))),
    diagnostics.join("\n"),
  );
  const events: string[] = [];
  const tools = skillTools(skills, "designer", (name) => events.push(name));
  const list = await tools[0].execute("list", {
    task: "visual-style",
    format: "pdf",
  });
  const entries = JSON.parse(
    list.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join(""),
  ) as { name: string; permissions: string[] }[];
  assert.deepEqual(
    entries.map((e) => e.name).sort(),
    [...names, "editorial-web"].sort(),
  );
  assert.deepEqual(
    events,
    [],
    "listing does not load a style or impose a selection",
  );
  for (const name of names) {
    assert.deepEqual(entries.find((e) => e.name === name)?.permissions, [
      "guidance",
    ]);
    const loaded = await tools[1].execute("load", { name });
    assert.ok(loaded.content.length > 0);
    for (const role of ["orchestrator", "analyst"] as Role[]) {
      await assert.rejects(
        () => skillTools(skills, role, () => {})[1].execute("load", { name }),
        /无权/,
      );
    }
  }
  assert.deepEqual(events, names);
  assert.ok(
    skills.some((s) => s.name === "editorial-web"),
    "existing narrative direction remains available",
  );
});
