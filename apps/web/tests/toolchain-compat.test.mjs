import projectConfig from "../eslint.config.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Minimatch } from "minimatch";
import { Linter } from "eslint";
import react from "eslint-plugin-react";
import jsxA11y from "eslint-plugin-jsx-a11y";

const require = createRequire(import.meta.url);

test("minimatch bounds optimized glob expansion", () => {
  for (const segments of [6, 8]) {
    const matcher = new Minimatch("**/../a/".repeat(segments) + "end", {
      optimizationLevel: 2, braceExpandMax: 8,
    });
    assert.ok(matcher.globParts.length <= 8);
  }
  assert.equal(new Minimatch("src/**/*.tsx", { optimizationLevel: 2 }).match("src/app/page.tsx"), true);
});

test("the Sentry glob dependency stops directory reads after cancellation", async () => {
  const fromSentry = createRequire(require.resolve("@sentry/bundler-plugins/package.json"));
  const { glob } = fromSentry("glob");
  const directory = await mkdtemp(path.join(tmpdir(), "toolchain-glob-"));
  try {
    for (const branch of ["a", "b"]) {
      await mkdir(path.join(directory, branch, "nested"), { recursive: true });
      await writeFile(path.join(directory, branch, "nested", "file.cjs"), "");
    }
    assert.equal((await glob("*/**/*.cjs", { cwd: directory })).length, 2);
    const controller = new AbortController();
    let readdirCalls = 0;
    let callsAtAbort;
    const probeFs = {
      ...fs,
      readdir(...args) {
        readdirCalls++;
        const callback = args.pop();
        fs.readdir(...args, (error, entries) => {
          if (!controller.signal.aborted) {
            callsAtAbort = readdirCalls;
            controller.abort(new Error("bounded-probe-abort"));
          }
          callback(error, entries);
        });
      },
    };
    await assert.rejects(glob("*/**/*.cjs", {
      cwd: directory, maxDepth: 2, signal: controller.signal, fs: probeFs,
    }), /bounded-probe-abort/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(callsAtAbort, 1);
    assert.equal(readdirCalls, callsAtAbort);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy lint plugins retain callable and named minimatch APIs", () => {
  assert.ok(Array.isArray(projectConfig));
  for (const plugin of ["eslint-plugin-react", "eslint-plugin-jsx-a11y"]) {
    const fromPlugin = createRequire(require.resolve(plugin));
    const minimatch = fromPlugin("minimatch");
    assert.equal(typeof minimatch, "function");
    assert.equal(minimatch("CustomInput", "Custom*"), true);
    assert.equal(new minimatch.Minimatch("*.tsx").match("page.tsx"), true);
    assert.equal(minimatch.minimatch("page.js", "*.tsx"), false);
  }
});

test("React and accessibility glob rules still report violations", () => {
  const linter = new Linter();
  const config = [{
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react, "jsx-a11y": jsxA11y },
    rules: {
      "react/jsx-pascal-case": ["error", { ignore: ["Ignored*"] }],
      "react/no-danger": ["error", { customComponentNames: ["Unsafe*"] }],
      "jsx-a11y/label-has-associated-control": ["error", {
        controlComponents: ["Custom*"], assert: "nesting",
      }],
    },
  }];
  for (const [source, expected] of [
    ["const App = () => <label>Name<CustomInput /></label>;", []],
    ["const App = () => <label><span /></label>;", ["jsx-a11y/label-has-associated-control"]],
    ['const App = () => <UnsafeThing dangerouslySetInnerHTML={{__html: "x"}} />;', ["react/no-danger"]],
    ["const App = () => <Ignored_bad />;", []],
    ["const App = () => <Other_bad />;", ["react/jsx-pascal-case"]],
  ]) {
    assert.deepEqual(linter.verify(source, config).map((message) => message.ruleId), expected);
  }
});

test("LHCI can synchronously load Chrome discovery on the supported Node runtime", () => {
  const fromLhci = createRequire(require.resolve("@lhci/cli/package.json"));
  assert.equal(typeof fromLhci("chrome-launcher").Launcher.getInstallations, "function");
});
