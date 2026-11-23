import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './server/apiHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const STATIC_ROOT = fs.existsSync(DIST_DIR) ? DIST_DIR : __dirname;

const START_PORT = Number(process.env.PORT) || 3000;
const END_PORT = START_PORT + 100;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

const apiHandler = createApiHandler(__dirname);

const server = http.createServer(async (req, res) => {
    const handled = await apiHandler(req, res);
    if (handled) return;

    let url;
    try {
        url = new URL(req.url, 'http://localhost');
    } catch {
        res.writeHead(400);
        res.end();
        return;
    }

    const pathname = decodeURIComponent(url.pathname);
    const rawPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(STATIC_ROOT, rawPath));
    if (!filePath.startsWith(STATIC_ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not found: ${rawPath}`);
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
});

function findFreePort(start, end) {
    return new Promise((resolve, reject) => {
        let port = start;
        function tryPort() {
            if (port > end) {
                reject(new Error(`No free port in ${start}-${end}`));
                return;
            }
            const probe = net.createServer();
            probe.once('error', () => {
                port++;
                tryPort();
            });
            probe.once('listening', () => {
                probe.close(() => resolve(port));
            });
            probe.listen(port, '0.0.0.0');
        }
        tryPort();
    });
}

(async () => {
    const port = await findFreePort(START_PORT, END_PORT);
    server.listen(port, '0.0.0.0', () => {
        console.log(`Pose Reference Editor server listening on http://0.0.0.0:${port}/ (static: ${STATIC_ROOT})`);
    });
})();
