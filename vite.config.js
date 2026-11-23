import { defineConfig } from 'vite';
import { createApiHandler } from './server/apiHandler.js';

function poseApiPlugin() {
    const handler = createApiHandler(process.cwd());
    return {
        name: 'pose-editor-api',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url && req.url.startsWith('/api')) {
                    handler(req, res, next);
                } else {
                    next();
                }
            });
        }
    };
}

export default defineConfig({
    base: './',
    plugins: [poseApiPlugin()],
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        allowedHosts: true
    },
    preview: {
        host: '0.0.0.0',
        port: 4173,
        allowedHosts: true
    }
});
