import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { wgslVitePlugin } from 'vgpu/client'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths — the same build works on Netlify, GitHub Pages
  // (username.github.io/repo/), or any sub-folder. Never hardcode a domain.
  base: "./",
  // wgslVitePlugin gives .wgsl files typed import/export resolution (vgpu's
  // WGSL module system) so the fluid shaders can `import { ... } from "./fluid-common.wgsl"`.
  plugins: [react(), wgslVitePlugin()],
})
