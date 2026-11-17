import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Local only: never expose registered files to the network. Docker sets
  // ASSET_SERVE_HOST=0.0.0.0 inside the container, and compose publishes the
  // port on 127.0.0.1 only, so it stays local there too.
  server: { host: process.env.ASSET_SERVE_HOST ?? '127.0.0.1' },
  preview: { host: process.env.ASSET_SERVE_HOST ?? '127.0.0.1' },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
