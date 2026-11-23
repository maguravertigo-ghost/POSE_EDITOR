'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const net  = require('net');
const { exec } = require('child_process');

const START_PORT = 3000;
const END_PORT   = 3100;

const ROOT = __dirname;
const LIBRARY_DIR    = path.join(ROOT, 'library');
const MODELS_DIR     = path.join(LIBRARY_DIR, 'models');
const POSES_FILE     = path.join(LIBRARY_DIR, 'poses.json');
const POSES_BAK_FILE = path.join(LIBRARY_DIR, 'poses.bak');
const PRESETS_DIR    = path.join(ROOT, 'pose_presets');

[LIBRARY_DIR, MODELS_DIR, PRESETS_DIR].forEach(function (d) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(POSES_FILE)) fs.writeFileSync(POSES_FILE, '{}', 'utf8');

const RESERVED = ['list', 'load', 'save', 'delete', 'backup'];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.txt':  'text/plain; charset=utf-8',
    '.bak':  'application/octet-stream'
};

function sendJson(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
}

function safeName(raw) {
    return String(raw || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64) || 'untitled';
}

function listJsonFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(function (f) { return f.endsWith('.json'); })
        .map(function (f) {
            var file = path.join(dir, f);
            var stat = fs.statSync(file);
            return { name: f.slice(0, -5), size: stat.size, mtime: stat.mtime.toISOString() };
        })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function readBody(req, maxBytes) {
    return new Promise(function (resolve, reject) {
        var len = 0, chunks = [];
        req.on('data', function (c) {
            len += c.length;
            if (len > maxBytes) { req.destroy(); reject(new Error('body too large')); return; }
            chunks.push(c);
        });
        req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
        req.on('error', reject);
    });
}

function readJsonFile(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { return fallback; }
}

function backupPoses() {
    if (fs.existsSync(POSES_FILE)) {
        try { fs.copyFileSync(POSES_FILE, POSES_BAK_FILE); } catch (e) {}
    }
}

function writePosesFile(obj) {
    backupPoses();
    fs.writeFileSync(POSES_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// Возвращает { resource, action, name }
// Поддерживает оба формата:
//   /api/<res>/<action>[/<name>]   — явный action
//   /api/<res>/<name>              — action по HTTP-методу
function parseApiPath(parts, method) {
    const resource = parts[1];
    if (resource === 'ping') return { resource: 'ping' };

    if (parts.length < 3) return null;

    const p2 = parts[2];

    if (RESERVED.indexOf(p2) !== -1) {
        return { resource: resource, action: p2, name: parts[3] || null };
    }

    let action;
    if (method === 'GET')         action = 'load';
    else if (method === 'POST')   action = 'save';
    else if (method === 'DELETE') action = 'delete';
    else return null;

    return { resource: resource, action: action, name: p2 };
}

const server = http.createServer(async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch (e) { res.writeHead(400); res.end(); return; }

    const pathname = decodeURIComponent(url.pathname);
    const parts    = pathname.split('/').filter(Boolean);

    if (parts[0] === 'api') {
        const parsed = parseApiPath(parts, req.method);
        if (!parsed) { sendJson(res, 400, { ok: false, error: 'bad path' }); return; }

        const resource = parsed.resource;
        const action   = parsed.action;
        const rawName  = parsed.name;

        if (resource === 'ping') {
            sendJson(res, 200, { ok: true, service: 'pose-ref-server', version: 4 });
            return;
        }

        // ---------- МОДЕЛИ ----------
        if (resource === 'models') {
            if (action === 'list' && req.method === 'GET') {
                sendJson(res, 200, { ok: true, list: listJsonFiles(MODELS_DIR) });
                return;
            }
            if (action === 'load' && req.method === 'GET' && rawName) {
                const file = path.join(MODELS_DIR, safeName(rawName) + '.json');
                if (!fs.existsSync(file)) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
                sendJson(res, 200, { ok: true, name: safeName(rawName), data: readJsonFile(file, null) });
                return;
            }
            if (action === 'save' && req.method === 'POST' && rawName) {
                try {
                    const body = await readBody(req, 50 * 1024 * 1024);
                    JSON.parse(body);
                    const file = path.join(MODELS_DIR, safeName(rawName) + '.json');
                    fs.writeFileSync(file, body, 'utf8');
                    sendJson(res, 200, { ok: true, name: safeName(rawName) });
                } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); }
                return;
            }
            if (action === 'delete' && req.method === 'DELETE' && rawName) {
                const file = path.join(MODELS_DIR, safeName(rawName) + '.json');
                if (!fs.existsSync(file)) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
                try { fs.unlinkSync(file); sendJson(res, 200, { ok: true }); }
                catch (e) { sendJson(res, 500, { ok: false, error: e.message }); }
                return;
            }
            sendJson(res, 404, { ok: false, error: 'unknown models action' });
            return;
        }

        // ---------- ПОЗЫ (единый poses.json) ----------
        if (resource === 'poses') {
            if (action === 'list' && req.method === 'GET') {
                const data = readJsonFile(POSES_FILE, {});
                const list = Object.keys(data).map(function (k) {
                    return { name: k, savedAt: (data[k] && data[k].savedAt) || '' };
                });
                sendJson(res, 200, { ok: true, list: list });
                return;
            }
            if (action === 'load' && req.method === 'GET' && rawName) {
                const data = readJsonFile(POSES_FILE, {});
                const entry = data[safeName(rawName)];
                if (!entry) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
                sendJson(res, 200, { ok: true, name: safeName(rawName), data: entry });
                return;
            }
            if (action === 'save' && req.method === 'POST' && rawName) {
                try {
                    const body = await readBody(req, 10 * 1024 * 1024);
                    const poseData = JSON.parse(body);
                    const all = readJsonFile(POSES_FILE, {});
                    all[safeName(rawName)] = poseData;
                    writePosesFile(all);
                    sendJson(res, 200, { ok: true, name: safeName(rawName) });
                } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); }
                return;
            }
            if (action === 'delete' && req.method === 'DELETE' && rawName) {
                const all = readJsonFile(POSES_FILE, {});
                if (!(safeName(rawName) in all)) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
                delete all[safeName(rawName)];
                writePosesFile(all);
                sendJson(res, 200, { ok: true });
                return;
            }
            if (action === 'backup' && req.method === 'POST') {
                backupPoses();
                sendJson(res, 200, { ok: true });
                return;
            }
            sendJson(res, 404, { ok: false, error: 'unknown poses action' });
            return;
        }

        // ---------- ПРЕСЕТЫ ----------
        if (resource === 'presets') {
            if (action === 'list' && req.method === 'GET') {
                sendJson(res, 200, { ok: true, list: listJsonFiles(PRESETS_DIR) });
                return;
            }
            if (action === 'load' && req.method === 'GET' && rawName) {
                const file = path.join(PRESETS_DIR, safeName(rawName) + '.json');
                if (!fs.existsSync(file)) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
                sendJson(res, 200, { ok: true, name: safeName(rawName), data: readJsonFile(file, null) });
                return;
            }
            if (action === 'save' && req.method === 'POST' && rawName) {
                try {
                    const body = await readBody(req, 10 * 1024 * 1024);
                    JSON.parse(body);
                    const file = path.join(PRESETS_DIR, safeName(rawName) + '.json');
                    fs.writeFileSync(file, body, 'utf8');
                    sendJson(res, 200, { ok: true, name: safeName(rawName) });
                } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); }
                return;
            }
            if (action === 'delete' && req.method === 'DELETE' && rawName) {
                const file = path.join(PRESETS_DIR, safeName(rawName) + '.json');
                if (!fs.existsSync(file)) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
                try { fs.unlinkSync(file); sendJson(res, 200, { ok: true }); }
                catch (e) { sendJson(res, 500, { ok: false, error: e.message }); }
                return;
            }
            sendJson(res, 404, { ok: false, error: 'unknown presets action' });
            return;
        }

        sendJson(res, 404, { ok: false, error: 'unknown resource' });
        return;
    }

    // ---------- СТАТИКА ----------
    const rawPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(ROOT, rawPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found: ' + rawPath);
        return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
});

function findFreePort(start, end) {
    return new Promise(function (resolve, reject) {
        let port = start;
        function tryPort() {
            if (port > end) { reject(new Error('No free port in ' + start + '-' + end)); return; }
            const probe = net.createServer();
            probe.once('error', function () { port++; tryPort(); });
            probe.once('listening', function () { probe.close(function () { resolve(port); }); });
            probe.listen(port);
        }
        tryPort();
    });
}

function openBrowser(url) {
    const cmd = process.platform === 'win32' ? 'start "" "' + url + '"' :
                process.platform === 'darwin' ? 'open "' + url + '"' :
                'xdg-open "' + url + '"';
    exec(cmd, function () {});
}

(async function () {
    try {
        const port = await findFreePort(START_PORT, END_PORT);
        server.listen(port, function () {
            const url = 'http://localhost:' + port + '/';
            console.log('==============================================');
            console.log('  Pose Reference Editor - Server v4');
            console.log('  URL:      ' + url);
            console.log('  Models:   ' + MODELS_DIR);
            console.log('  Poses:    ' + POSES_FILE);
            console.log('  Backup:   ' + POSES_BAK_FILE);
            console.log('  Presets:  ' + PRESETS_DIR);
            console.log('==============================================');
            console.log('Press Ctrl+C to stop.');
            if (process.argv.indexOf('--open') !== -1) openBrowser(url);
        });
    } catch (e) {
        console.error('Start error: ' + e.message);
        process.exit(1);
    }
})();
