const { createRequire } = require("node:module");

// shortcut: React/a11y plugins require callable minimatch; remove when upstream supports named exports.
for (const plugin of ["eslint-plugin-react", "eslint-plugin-jsx-a11y"]) {
  const fromPlugin = createRequire(require.resolve(plugin));
  const entry = fromPlugin.resolve("minimatch");
  const namespace = fromPlugin("minimatch");
  require.cache[entry].exports = Object.assign(namespace.minimatch, namespace);
}
