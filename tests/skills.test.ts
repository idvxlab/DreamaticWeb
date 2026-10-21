import test from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  writeFile,
  mkdir,
  symlink,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import {
  SkillLibrary,
  selectSkills,
  SKILLS_ROOT,
} from "../apps/server/src/generation/skills.js";

const lib = new SkillLibrary();
test.after(() => lib.close());
test("published Pi loader discovers portable Skills; Codex and Claude paths resolve the same resources", async () => {
  const pi = loadSkillsFromDir({ dir: SKILLS_ROOT, source: "test" });
  assert.equal(pi.diagnostics.length, 0);
  assert.equal(pi.skills.length, 10);
  const alias = path.resolve(".claude/skills");
  assert.equal(await realpath(alias), await realpath(SKILLS_ROOT));
  const claudeLayout = loadSkillsFromDir({
    dir: alias,
    source: "portable-path-check",
  });
  assert.deepEqual(
    claudeLayout.skills.map((s) => s.name).sort(),
    pi.skills.map((s) => s.name).sort(),
  );
  for (const s of pi.skills) {
    assert.equal(s.name, path.basename(s.baseDir));
    const raw = await readFile(s.filePath, "utf8");
    assert.match(raw, /^---\nname: [a-z0-9-]+\ndescription: [^\n]+\n---/);
    assert.ok(raw.length < 5000, "entrypoint is bounded: " + s.name);
    assert.doesNotMatch(
      raw,
      /submit_facts|submit_page|page_patch|DREAMATIC_|\$\{CLAUDE|<available_skills>/,
      "core instructions are harness-independent",
    );
    for (const ref of raw.matchAll(/\]\((references\/[^)]+)\)/g)) {
      assert.equal(
        await readFile(path.join(alias, s.name, ref[1]), "utf8"),
        await readFile(path.join(s.baseDir, ref[1]), "utf8"),
      );
    }
  }
});

test("deterministic routing composes complementary skills and keeps edits narrowly scoped", async () => {
  const { skills } = await lib.catalog();
  const route = (text: string, editing = false, brief?: unknown) =>
    selectSkills("designer", { text, editing, brief }, skills);
  assert.deepEqual(
    selectSkills("analyst", { text: "PDF table", editing: false }, skills),
    ["analyst-information-extraction"],
  );
  assert.deepEqual(
    route("把标题改为 Hello", true, { goal: "SaaS 多页面导航网站" }),
    [],
  );
  assert.deepEqual(
    route("把按钮颜色调深", true, { goal: "SaaS 多页面导航网站" }),
    ["designer-visual-design"],
  );
  assert.deepEqual(route("修正折叠菜单", true), [
    "designer-interaction-design",
  ]);
  for (const [request, expected] of [
    ["产品营销首页", "designer-landing-page"],
    ["SaaS 多页面网站导航", "designer-saas-website"],
    ["KPI dashboard", "designer-dashboard"],
    ["商城商品详情", "designer-ecommerce"],
    ["作品集", "designer-portfolio"],
    ["长文出版网站", "designer-editorial"],
  ]) {
    const selected = route(request);
    assert.ok(selected.includes(expected));
    assert.ok(selected.length <= 4);
    assert.equal(new Set(selected).size, selected.length);
  }
  assert.deepEqual(
    route("KPI dashboard with helpful navigation and native disclosure"),
    ["designer-dashboard", "designer-visual-design"],
  );
  assert.deepEqual(route("创建网站"), [
    "designer-web-architecture",
    "designer-visual-design",
  ]);
  assert.deepEqual(route("/skill:designer-editorial 修改章节", true), [
    "designer-editorial",
  ]);
  assert.deepEqual(
    selectSkills(
      "analyst",
      { text: "/skill:designer-editorial", editing: false },
      skills,
    ),
    ["analyst-information-extraction"],
  );
  assert.throws(() => route("/skill:designer-missing", true), /不可用于/);
});

test("native reader preloads only selected bodies, reuses bytes, denies originals/cross-role/scripts and reads references on demand", async () => {
  const start = lib.io.reads;
  const names = ["analyst-information-extraction"];
  const signature = await lib.signature("analyst", names);
  assert.ok(signature);
  const prepared = await lib.prepare("analyst", names);
  assert.ok(prepared.prompt.includes("# Extract useful facts in one pass"));
  assert.ok(
    !prepared.prompt.includes("Example source:"),
    "reference body is not preloaded",
  );
  assert.ok(
    !prepared.prompt.includes("# Choose a visual direction"),
    "Designer body not loaded",
  );
  const after = lib.io.reads;
  assert.equal(after - start, 1);
  await lib.signature("analyst", names);
  await lib.prepare("analyst", names);
  assert.equal(lib.io.reads, after, "warm prep does not reread files");
  const reader = lib.reader("analyst");
  const ref = await reader.execute("reference", {
    path: path.join(
      SKILLS_ROOT,
      "analyst-information-extraction/references/tables-and-coverage.md",
    ),
  });
  assert.match(JSON.stringify(ref.content), /non-randomized/);
  await assert.rejects(() =>
    reader.execute("denied", {
      path: path.join(SKILLS_ROOT, "designer-dashboard/SKILL.md"),
    }),
  );
  await assert.rejects(() =>
    reader.execute("denied", {
      path: path.resolve("config/agents/analyst.md"),
    }),
  );
  await assert.rejects(() =>
    lib.reader("orchestrator").execute("denied", {
      path: path.join(SKILLS_ROOT, names[0], "SKILL.md"),
    }),
  );
});

test("native discovery reloads additions/invalid frontmatter, selected reference edits invalidate signatures, symlink escapes are rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dreamatic-skills-"));
  const copy = path.join(root, "skills");
  await cp(SKILLS_ROOT, copy, { recursive: true });
  const library = new SkillLibrary(copy);
  try {
    const names = ["analyst-information-extraction"];
    const first = await library.signature("analyst", names);
    const reference = path.join(
      copy,
      names[0],
      "references/tables-and-coverage.md",
    );
    await writeFile(
      reference,
      (await readFile(reference, "utf8")) + "\nA new condition.\n",
    );
    library.invalidate();
    assert.notEqual(await library.signature("analyst", names), first);
    const stable = await library.signature("analyst", names);
    const designer = path.join(copy, "designer-editorial/SKILL.md");
    await writeFile(
      designer,
      (await readFile(designer, "utf8")) + "\nNew editorial example.\n",
    );
    library.invalidate();
    assert.equal(
      await library.signature("analyst", names),
      stable,
      "unrelated Skill edits do not invalidate facts",
    );
    await mkdir(path.join(copy, "designer-custom"));
    await writeFile(
      path.join(copy, "designer-custom/SKILL.md"),
      "---\nname: designer-custom\ndescription: Custom directory map layout\n---\n# Layout\nPreserve hierarchy.\n",
    );
    await mkdir(path.join(copy, "designer-broken"));
    await writeFile(
      path.join(copy, "designer-broken/SKILL.md"),
      "---\nname: [broken\n---\nInvalid",
    );
    library.invalidate();
    const catalog = await library.catalog();
    assert.ok(catalog.skills.some((s) => s.name === "designer-custom"));
    assert.ok(catalog.diagnostics.length > 0);
    assert.ok(
      selectSkills(
        "designer",
        { text: "/skill:designer-custom", editing: true },
        catalog.skills,
      ).includes("designer-custom"),
    );
    const outside = path.join(root, "secret.md");
    await writeFile(outside, "must not read");
    const escape = path.join(copy, names[0], "references/escape.md");
    await symlink(outside, escape);
    library.invalidate();
    await assert.rejects(
      () => library.reader("analyst").execute("escape", { path: escape }),
      /只能读取/,
    );
  } finally {
    library.close();
    await rm(root, { recursive: true, force: true });
  }
});
