import { defineConfig } from 'vite'
import build from '@hono/vite-build'
import devServer from '@hono/vite-dev-server'

export default defineConfig({
    plugins: [
        build({
            entry: 'src/index.tsx',
            output: '_worker.js'
        }),
        devServer({
            entry: 'src/index.tsx'
        })
    ]
})
