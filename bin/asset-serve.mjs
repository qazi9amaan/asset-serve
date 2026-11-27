#!/usr/bin/env node
// The CLI is TypeScript, run with Node's built-in type stripping (Node 22.18+).
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`asset-serve needs Node 22.18+ (found ${process.version}). Try: nvm use 24`)
  process.exit(1)
}
process.removeAllListeners('warning') // hide the "type stripping is experimental" notice on 22.x
await import('../src/cli.ts')
