import fs from 'node:fs';
import path from 'node:path';

const RESERVED = ['list', 'load', 'save', 'delete', 'backup'];

export function createApiHandler(rootDir) {
    const LIBRARY_DIR = path.join(rootDir, 'library');
    const MODELS_DIR = path.join(LIBRARY_DIR, 'models');
    const ANIMATIONS_DIR = path.join(LIBRARY_DIR, 'animations');
    const POSES_FILE = path.join(LIBRARY_DIR, 'poses.json');
    const POSES_BAK_FILE = path.join(LIBRARY_DIR, 'poses.bak');
    const PRESETS_DIR = path.join(rootDir, 'pose_presets');

    [LIBRARY_DIR, MODELS_DIR, ANIMATIONS_DIR, PRESETS_DIR].forEach((dir) => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    if (!fs.existsSync(POSES_FILE)) fs.writeFileSync(POSES_FILE, '{}', 'utf8');

    function sendJson(res, code, obj) {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
    }

    function safeName(raw) {
        return String(raw || '').replace(/[^a-zA-Z0-9_\-\u0400-\u04FF]/g, '_').slice(0, 64) || 'untitled';
    }

    function listJsonFiles(dir) {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
                const file = path.join(dir, f);
                const stat = fs.statSync(file);
                return { name: f.slice(0, -5), size: stat.size, mtime: stat.mtime.toISOString() };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function readBody(req, maxBytes) {
        return new Promise((resolve, reject) => {
            let len = 0;
            const chunks = [];
            req.on('data', (c) => {
                len += c.length;
                if (len > maxBytes) {
                    req.destroy();
                    reject(new Error('body too large'));
                    return;
                }
                chunks.push(c);
            });
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
        });
    }

    function readJsonFile(file, fallback) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            return fallback;
        }
    }

    function backupPoses() {
        if (fs.existsSync(POSES_FILE)) {
            try {
                fs.copyFileSync(POSES_FILE, POSES_BAK_FILE);
            } catch {
                // ignore
            }
        }
    }

    function writePosesFile(obj) {
        backupPoses();
        fs.writeFileSync(POSES_FILE, JSON.stringify(obj, null, 2), 'utf8');
    }

    function parseApiPath(parts, method) {
        const resource = parts[1];
        if (resource === 'ping') return { resource: 'ping' };
        if (parts.length < 3) return null;

        const p2 = parts[2];
        if (RESERVED.includes(p2)) {
            return { resource, action: p2, name: parts[3] || null };
        }

        let action;
        if (method === 'GET') action = 'load';
        else if (method === 'POST') action = 'save';
        else if (method === 'DELETE') action = 'delete';
        else return null;

        return { resource, action, name: p2 };
    }

    return async function handleApiRequest(req, res, next) {
        let url;
        try {
            url = new URL(req.url, 'http://localhost');
        } catch {
            res.writeHead(400);
            res.end();
            return;
        }

        const pathname = decodeURIComponent(url.pathname);
        const parts = pathname.split('/').filter(Boolean);

        if (parts[0] !== 'api') {
            if (typeof next === 'function') next();
            return false;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return true;
        }

        const parsed = parseApiPath(parts, req.method);
        if (!parsed) {
            sendJson(res, 400, { ok: false, error: 'bad path' });
            return true;
        }

        const { resource, action, name: rawName } = parsed;

        if (resource === 'ping') {
            sendJson(res, 200, { ok: true, service: 'pose-ref-server', version: 5 });
            return true;
        }

        if (resource === 'models') {
            if (action === 'list' && req.method === 'GET') {
                sendJson(res, 200, { ok: true, list: listJsonFiles(MODELS_DIR) });
                return true;
            }
            if (action === 'load' && req.method === 'GET' && rawName) {
                const name = safeName(rawName);
                const file = path.join(MODELS_DIR, `${name}.json`);
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                sendJson(res, 200, { ok: true, name, data: readJsonFile(file, null) });
                return true;
            }
            if (action === 'save' && req.method === 'POST' && rawName) {
                try {
                    const body = await readBody(req, 50 * 1024 * 1024);
                    JSON.parse(body);
                    const name = safeName(rawName);
                    const file = path.join(MODELS_DIR, `${name}.json`);
                    fs.writeFileSync(file, body, 'utf8');
                    sendJson(res, 200, { ok: true, name });
                } catch (e) {
                    sendJson(res, 400, { ok: false, error: e.message });
                }
                return true;
            }
            if (action === 'delete' && req.method === 'DELETE' && rawName) {
                const name = safeName(rawName);
                const file = path.join(MODELS_DIR, `${name}.json`);
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                try {
                    fs.unlinkSync(file);
                    sendJson(res, 200, { ok: true });
                } catch (e) {
                    sendJson(res, 500, { ok: false, error: e.message });
                }
                return true;
            }
            sendJson(res, 404, { ok: false, error: 'unknown models action' });
            return true;
        }

        if (resource === 'poses') {
            if (action === 'list' && req.method === 'GET') {
                const data = readJsonFile(POSES_FILE, {});
                const list = Object.keys(data).map((k) => ({
                    name: k,
                    savedAt: (data[k] && data[k].savedAt) || ''
                }));
                sendJson(res, 200, { ok: true, list });
                return true;
            }
            if (action === 'load' && req.method === 'GET' && rawName) {
                const name = safeName(rawName);
                const data = readJsonFile(POSES_FILE, {});
                const entry = data[name];
                if (!entry) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                sendJson(res, 200, { ok: true, name, data: entry });
                return true;
            }
            if (action === 'save' && req.method === 'POST' && rawName) {
                try {
                    const body = await readBody(req, 10 * 1024 * 1024);
                    const poseData = JSON.parse(body);
                    const name = safeName(rawName);
                    const all = readJsonFile(POSES_FILE, {});
                    all[name] = poseData;
                    writePosesFile(all);
                    sendJson(res, 200, { ok: true, name });
                } catch (e) {
                    sendJson(res, 400, { ok: false, error: e.message });
                }
                return true;
            }
            if (action === 'delete' && req.method === 'DELETE' && rawName) {
                const name = safeName(rawName);
                const all = readJsonFile(POSES_FILE, {});
                if (!(name in all)) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                delete all[name];
                writePosesFile(all);
                sendJson(res, 200, { ok: true });
                return true;
            }
            if (action === 'backup' && req.method === 'POST') {
                backupPoses();
                sendJson(res, 200, { ok: true });
                return true;
            }
            sendJson(res, 404, { ok: false, error: 'unknown poses action' });
            return true;
        }

        if (resource === 'presets') {
            if (action === 'list' && req.method === 'GET') {
                sendJson(res, 200, { ok: true, list: listJsonFiles(PRESETS_DIR) });
                return true;
            }
            if (action === 'load' && req.method === 'GET' && rawName) {
                const name = safeName(rawName);
                const file = path.join(PRESETS_DIR, `${name}.json`);
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                sendJson(res, 200, { ok: true, name, data: readJsonFile(file, null) });
                return true;
            }
            if (action === 'save' && req.method === 'POST' && rawName) {
                try {
                    const body = await readBody(req, 10 * 1024 * 1024);
                    JSON.parse(body);
                    const name = safeName(rawName);
                    const file = path.join(PRESETS_DIR, `${name}.json`);
                    fs.writeFileSync(file, body, 'utf8');
                    sendJson(res, 200, { ok: true, name });
                } catch (e) {
                    sendJson(res, 400, { ok: false, error: e.message });
                }
                return true;
            }
            if (action === 'delete' && req.method === 'DELETE' && rawName) {
                const name = safeName(rawName);
                const file = path.join(PRESETS_DIR, `${name}.json`);
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                try {
                    fs.unlinkSync(file);
                    sendJson(res, 200, { ok: true });
                } catch (e) {
                    sendJson(res, 500, { ok: false, error: e.message });
                }
                return true;
            }
            sendJson(res, 404, { ok: false, error: 'unknown presets action' });
            return true;
        }

        if (resource === 'animations') {
            if (action === 'list' && req.method === 'GET') {
                sendJson(res, 200, { ok: true, list: listJsonFiles(ANIMATIONS_DIR) });
                return true;
            }
            if (action === 'load' && req.method === 'GET' && rawName) {
                const name = safeName(rawName);
                const file = path.join(ANIMATIONS_DIR, `${name}.json`);
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                sendJson(res, 200, { ok: true, name, data: readJsonFile(file, null) });
                return true;
            }
            if (action === 'save' && req.method === 'POST' && rawName) {
                try {
                    const body = await readBody(req, 10 * 1024 * 1024);
                    JSON.parse(body);
                    const name = safeName(rawName);
                    const file = path.join(ANIMATIONS_DIR, `${name}.json`);
                    fs.writeFileSync(file, body, 'utf8');
                    sendJson(res, 200, { ok: true, name });
                } catch (e) {
                    sendJson(res, 400, { ok: false, error: e.message });
                }
                return true;
            }
            if (action === 'delete' && req.method === 'DELETE' && rawName) {
                const name = safeName(rawName);
                const file = path.join(ANIMATIONS_DIR, `${name}.json`);
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { ok: false, error: 'not found' });
                    return true;
                }
                try {
                    fs.unlinkSync(file);
                    sendJson(res, 200, { ok: true });
                } catch (e) {
                    sendJson(res, 500, { ok: false, error: e.message });
                }
                return true;
            }
            sendJson(res, 404, { ok: false, error: 'unknown animations action' });
            return true;
        }

        sendJson(res, 404, { ok: false, error: 'unknown resource' });
        return true;
    };
}
