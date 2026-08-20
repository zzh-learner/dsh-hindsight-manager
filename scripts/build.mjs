// Build both halves of the plugin:
//   lib/index.js    — node half (esm, bundled, node platform)
//   lib/hindsight.js — pure logic entry (imported by tests)
//   dist/client.js  — browser bundle wrapped in window.__ModuleLoader__.load
// Shared deps (react, @deepseek-ai/*) stay external and resolve through the
// module table the web shell injects into the factory's require.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, 'lib'), { recursive: true })
mkdirSync(join(root, 'dist'), { recursive: true })

const shared = { bundle: true, sourcemap: false, logLevel: 'warning' }

await build({
  ...shared,
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(root, 'lib', 'index.js'),
  format: 'esm',
  platform: 'node',
  target: 'node22',
})

await build({
  ...shared,
  entryPoints: [join(root, 'src', 'hindsight.ts')],
  outfile: join(root, 'lib', 'hindsight.js'),
  format: 'esm',
  platform: 'node',
  target: 'node22',
})

await build({
  ...shared,
  entryPoints: [join(root, 'src', 'client.tsx')],
  outfile: join(root, 'dist', 'client.core.js'),
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/*'],
})

const core = readFileSync(join(root, 'dist', 'client.core.js'), 'utf8')
const wrapper = 'window.__ModuleLoader__.load({\n' +
  '\tid: "dsh-hindsight-manager",\n' +
  '\tfactory: (require) => {\n' +
  '\t\tvar module = { exports: {} };\n' +
  '\t\tvar exports = module.exports;\n' +
  core + '\n' +
  '\t\treturn module.exports;\n' +
  '\t}\n' +
  '});\n'
writeFileSync(join(root, 'dist', 'client.js'), wrapper)
console.log('built lib/index.js, lib/hindsight.js, dist/client.js (' + wrapper.length + ' bytes)')
