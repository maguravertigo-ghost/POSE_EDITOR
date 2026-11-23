/* ==================================================================
   SHAPE EDITOR v3
   - профиль: { height, jointT, scale, front:{symmetric,points}, side:{symmetric,points} }
   - точка: { t, rL, rR }
   - между точками — ЛИНЕЙНАЯ интерполяция (без Catmull-Rom)
   - при драге точки меняется только радиус (по горизонтали),
     позиция t (по вертикали) фиксирована — точки не «прыгают»
   - двойной клик — добавить точку
   - ПКМ по точке — удалить
   - жёлтая линия — jointT (привязка к суставу), тянется по вертикали
   - симметрия per-view: включена — rL = rR, выключена — независимо
   - free-вид: свободная камера (орбита/зум/пан)
================================================================== */
window.ShapeEditor = (function () {
'use strict';

function defaultProfile(opts) {
    opts = opts || {};
    return {
        height: opts.height || 0.2,
        jointT: opts.jointT != null ? opts.jointT : 0.5,
        scale: 1.0,
        front: {
            symmetric: opts.frontSymmetric !== false,
            points: opts.frontPoints || [
                { t: 0.00, rL: 0.10, rR: 0.10 },
                { t: 0.50, rL: 0.12, rR: 0.12 },
                { t: 1.00, rL: 0.09, rR: 0.09 }
            ]
        },
        side: {
            symmetric: opts.sideSymmetric === true,
            points: opts.sidePoints || [
                { t: 0.00, rL: 0.08, rR: 0.10 },
                { t: 0.50, rL: 0.10, rR: 0.12 },
                { t: 1.00, rL: 0.07, rR: 0.09 }
            ]
        }
    };
}

var partsProfiles = {
    'Грудная клетка': defaultProfile({
        height: 0.42, jointT: 0.10, frontSymmetric: true,
        frontPoints: [
            { t: 0.00, rL: 0.14, rR: 0.14 }, { t: 0.25, rL: 0.15, rR: 0.15 },
            { t: 0.55, rL: 0.17, rR: 0.17 }, { t: 0.80, rL: 0.14, rR: 0.14 },
            { t: 1.00, rL: 0.10, rR: 0.10 }
        ],
        sideSymmetric: false,
        sidePoints: [
            { t: 0.00, rL: 0.09, rR: 0.11 }, { t: 0.25, rL: 0.10, rR: 0.14 },
            { t: 0.55, rL: 0.10, rR: 0.16 }, { t: 0.80, rL: 0.09, rR: 0.12 },
            { t: 1.00, rL: 0.07, rR: 0.10 }
        ]
    }),
    'Торс': defaultProfile({
        height: 0.28, jointT: 0.50, frontSymmetric: true,
        frontPoints: [
            { t: 0.00, rL: 0.13, rR: 0.13 }, { t: 0.50, rL: 0.15, rR: 0.15 },
            { t: 1.00, rL: 0.14, rR: 0.14 }
        ],
        sideSymmetric: false,
        sidePoints: [
            { t: 0.00, rL: 0.10, rR: 0.10 }, { t: 0.50, rL: 0.10, rR: 0.12 },
            { t: 1.00, rL: 0.10, rR: 0.12 }
        ]
    }),
    'Шея': defaultProfile({
        height: 0.15, jointT: 0.0, frontSymmetric: true,
        frontPoints: [{ t: 0.00, rL: 0.055, rR: 0.055 }, { t: 1.00, rL: 0.045, rR: 0.045 }],
        sideSymmetric: true,
        sidePoints: [{ t: 0.00, rL: 0.050, rR: 0.050 }, { t: 1.00, rL: 0.045, rR: 0.045 }]
    }),
    'Голова': defaultProfile({
        height: 0.22, jointT: 0.05, frontSymmetric: true,
        frontPoints: [
            { t: 0.00, rL: 0.06, rR: 0.06 }, { t: 0.30, rL: 0.11, rR: 0.11 },
            { t: 0.65, rL: 0.11, rR: 0.11 }, { t: 1.00, rL: 0.07, rR: 0.07 }
        ],
        sideSymmetric: false,
        sidePoints: [
            { t: 0.00, rL: 0.07, rR: 0.07 }, { t: 0.30, rL: 0.12, rR: 0.13 },
            { t: 0.65, rL: 0.12, rR: 0.13 }, { t: 1.00, rL: 0.08, rR: 0.09 }
        ]
    })
};

var activePart = null;
var viewCtx    = {};
var dragState  = null;
var jointDrag  = null;
var freeDrag   = null;
var onApplyCb  = null;
var isOpen     = false;
var freeCam    = { az: -0.5, el: 0.35, dist: 4, panX: 0, panY: 0 };

/* ---------- Линейная интерполяция ---------- */

function sampleCurve(points, t, key) {
    if (!points || points.length === 0) return 0.005;
    if (points.length === 1) return Math.max(0.005, points[0][key] || 0);
    var i = 0;
    for (; i < points.length - 1; i++) if (t <= points[i + 1].t) break;
    i = Math.min(i, points.length - 2);
    var p1 = points[i], p2 = points[i + 1];
    var seg = p2.t - p1.t;
    if (seg < 1e-5) return Math.max(0.005, p1[key] || 0);
    var u = Math.max(0, Math.min(1, (t - p1.t) / seg));
    return Math.max(0.005, (p1[key] || 0) * (1 - u) + (p2[key] || 0) * u);
}

function sampleView(view, t) {
    var rR = sampleCurve(view.points, t, 'rR');
    var rL = view.symmetric ? rR : sampleCurve(view.points, t, 'rL');
    return { rL: rL, rR: rR };
}

function sampleProfile(points, t) {
    if (!points || !points.length) return 0;
    if ('rR' in points[0]) return sampleCurve(points, t, 'rR');
    return sampleCurve(points, t, 'r');
}

function getProfile(partName) {
    if (!partsProfiles[partName]) partsProfiles[partName] = defaultProfile({});
    return partsProfiles[partName];
}

function listParts() {
    return Object.keys(partsProfiles);
}

function getAllProfiles() {
    return JSON.parse(JSON.stringify(partsProfiles));
}

function setProfiles(data) {
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(function (k) {
        if (data[k] && typeof data[k] === 'object') {
            partsProfiles[k] = data[k];
        }
    });
    if (isOpen && activePart) drawAll();
}

function setProfile(partName, profile) {
    if (!partName || !profile) return;
    partsProfiles[partName] = JSON.parse(JSON.stringify(profile));
}

/* ---------- Canvas ---------- */

function setupCanvas(cvs) {
    var rect = cvs.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    cvs.width  = Math.max(1, Math.floor(rect.width * dpr));
    cvs.height = Math.max(1, Math.floor(rect.height * dpr));
    var ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: rect.width, height: rect.height, canvas: cvs };
}

function viewParams(vp, prof) {
    var padding = 24;
    var W = vp.width, H = vp.height;
    var cx = W / 2;
    var plotH = H - 2 * padding;
    var maxR = 0.001;
    prof.front.points.forEach(function (p) { maxR = Math.max(maxR, p.rL || 0, p.rR || 0); });
    prof.side.points.forEach(function (p) { maxR = Math.max(maxR, p.rL || 0, p.rR || 0); });
    maxR *= 1.3;
    var scale = (W / 2 - padding) / maxR;
    return { padding: padding, cx: cx, plotH: plotH, H: H, W: W, scale: scale };
}

/* ---------- Отрисовка 2D ---------- */

function drawAxis2D(vp, prof) {
    var ctx = vp.ctx, W = vp.width, H = vp.height;

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.08)';
    ctx.lineWidth = 1;
    for (var x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    var vpP = viewParams(vp, prof);

    ctx.strokeStyle = 'rgba(255, 220, 0, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(vpP.cx, 0); ctx.lineTo(vpP.cx, H); ctx.stroke();
    ctx.setLineDash([]);

    var jointY = vpP.H - vpP.padding - prof.jointT * vpP.plotH;
    ctx.strokeStyle = jointDrag ? '#ffcc44' : 'rgba(255, 200, 60, 0.7)';
    ctx.lineWidth = jointDrag ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(0, jointY); ctx.lineTo(W, jointY); ctx.stroke();

    ctx.fillStyle = 'rgba(255, 200, 60, 0.85)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('◈ сустав', 6, jointY - 4);
}

function drawCurve2D(vp, prof, viewKey) {
    var ctx = vp.ctx, W = vp.width, H = vp.height;
    var vpP = viewParams(vp, prof);
    var view = viewKey === 'front' ? prof.front : prof.side;
    var scale = vpP.scale * prof.scale;

    function drawSide(useKey, dir, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i <= 80; i++) {
            var t = i / 80;
            var r = sampleCurve(view.points, t, useKey);
            var y = H - vpP.padding - t * vpP.plotH;
            var px = vpP.cx + dir * r * scale;
            if (i === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
        }
        ctx.stroke();
    }

    drawSide('rR', +1, '#6ea8ff');
    if (view.symmetric) drawSide('rR', -1, 'rgba(110, 168, 255, 0.4)');
    else                drawSide('rL', -1, '#7ecfff');

    view.points.forEach(function (p, idx) {
        var y = H - vpP.padding - p.t * vpP.plotH;
        var xR = vpP.cx + p.rR * scale;
        var xL = vpP.cx - p.rL * scale;
        var isDragR = dragState && dragState.view === viewKey && dragState.index === idx && dragState.side === 'R';
        var isDragL = dragState && dragState.view === viewKey && dragState.index === idx && dragState.side === 'L';

        ctx.beginPath(); ctx.arc(xR, y, isDragR ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isDragR ? '#ffaa44' : '#4a9eff';
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

        var symm = view.symmetric;
        ctx.beginPath(); ctx.arc(xL, y, isDragL ? 7 : (symm ? 4 : 5), 0, Math.PI * 2);
        ctx.fillStyle = isDragL ? '#ffaa44' : (symm ? 'rgba(74, 158, 255, 0.35)' : '#7ecfff');
        ctx.fill();
        ctx.strokeStyle = symm ? 'rgba(255, 255, 255, 0.4)' : '#fff';
        ctx.lineWidth = symm ? 1 : 1.5; ctx.stroke();
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(viewKey === 'front' ? 'X →' : 'Z →', vpP.cx + 6, H - 6);
    ctx.fillText('↑ Y', 6, 14);
}

function drawTop2D(vp, prof) {
    var ctx = vp.ctx, W = vp.width, H = vp.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1218'; ctx.fillRect(0, 0, W, H);

    var cx = W / 2, cy = H / 2;
    var scale = Math.min(W, H) / 2 / 0.25 * 0.72 * prof.scale;

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.stroke();

    [0.15, 0.5, 0.85].forEach(function (t, i) {
        var fx = sampleView(prof.front, t);
        var fz = sampleView(prof.side, t);
        ctx.strokeStyle = 'rgba(110, 168, 255, ' + (0.35 + i * 0.22) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var a = 0; a <= 96; a++) {
            var ang = a / 96 * Math.PI * 2;
            var c = Math.cos(ang), s = Math.sin(ang);
            var rx = c > 0 ? fx.rR : fx.rL;
            var rz = s > 0 ? fz.rR : fz.rL;
            var px = cx + c * rx * scale;
            var py = cy + s * rz * scale;
            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('сечения XZ', 8, 16);
}

function drawFree3D(vp, prof) {
    var ctx = vp.ctx, W = vp.width, H = vp.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1218'; ctx.fillRect(0, 0, W, H);

    var N = 28, M = 24;
    var rings = [];
    var height = prof.height * prof.scale;
    var jointT = prof.jointT;

    for (var i = 0; i <= N; i++) {
        var t = i / N;
        var fx = sampleView(prof.front, t);
        var fz = sampleView(prof.side, t);
        var y = (t - jointT) * height;
        var ring = [];
        for (var j = 0; j < M; j++) {
            var ang = j / M * Math.PI * 2;
            var c = Math.cos(ang), s = Math.sin(ang);
            var rx = (c > 0 ? fx.rR : fx.rL) * prof.scale;
            var rz = (s > 0 ? fz.rR : fz.rL) * prof.scale;
            ring.push([c * rx, y, s * rz]);
        }
        rings.push(ring);
    }

    var ca = Math.cos(freeCam.az), sa = Math.sin(freeCam.az);
    var ce = Math.cos(freeCam.el), se = Math.sin(freeCam.el);
    var baseScale = Math.min(W, H) * 1.2 * freeCam.dist / 8;
    var cx0 = W / 2 + freeCam.panX;
    var cy0 = H / 2 + freeCam.panY;

    function project(p) {
        var x1 = p[0] * ca - p[2] * sa;
        var z1 = p[0] * sa + p[2] * ca;
        var y2 = p[1] * ce - z1 * se;
        var z2 = p[1] * se + z1 * ce;
        var persp = 3.5 / (3.5 + z2);
        return { x: cx0 + x1 * baseScale * persp, y: cy0 - y2 * baseScale * persp };
    }

    ctx.strokeStyle = 'rgba(110, 168, 255, 0.55)';
    ctx.lineWidth = 0.8;
    for (var i2 = 0; i2 < rings.length - 1; i2++) {
        for (var j2 = 0; j2 < M; j2++) {
            var jn = (j2 + 1) % M;
            var pA = project(rings[i2][j2]);
            var pB = project(rings[i2][jn]);
            var pC = project(rings[i2 + 1][jn]);
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.lineTo(pC.x, pC.y);
            ctx.stroke();
        }
    }

    var origin = project([0, 0, 0]);
    ctx.strokeStyle = '#ffcc44'; ctx.lineWidth = 2;
    var r = 8;
    ctx.beginPath();
    ctx.moveTo(origin.x - r, origin.y); ctx.lineTo(origin.x + r, origin.y);
    ctx.moveTo(origin.x, origin.y - r); ctx.lineTo(origin.x, origin.y + r);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc44'; ctx.fill();
    ctx.fillStyle = 'rgba(255, 200, 60, 0.9)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('◈ сустав', origin.x + 12, origin.y + 4);

    var axisLen = height * 0.6;
    drawAxisLine(project([0, 0, 0]), project([axisLen, 0, 0]), '#ff6666', 'X');
    drawAxisLine(project([0, 0, 0]), project([0, axisLen, 0]), '#66ff99', 'Y');
    drawAxisLine(project([0, 0, 0]), project([0, 0, axisLen]), '#6ea8ff', 'Z');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('орбита: ЛКМ · зум: колесо · пан: Shift+ЛКМ', 8, H - 8);

    function drawAxisLine(a, b, color, label) {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = color; ctx.fillText(label, b.x + 3, b.y - 3);
    }
}

function drawView2D(viewKey) {
    var vp = viewCtx[viewKey];
    if (!vp || !activePart) return;
    var prof = getProfile(activePart);
    var ctx = vp.ctx, W = vp.width, H = vp.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1218'; ctx.fillRect(0, 0, W, H);
    drawAxis2D(vp, prof);
    drawCurve2D(vp, prof, viewKey);
}

function drawAll() {
    if (!activePart) return;
    drawView2D('front');
    drawView2D('side');
    if (viewCtx['top'])  drawTop2D(viewCtx['top'], getProfile(activePart));
    if (viewCtx['free']) drawFree3D(viewCtx['free'], getProfile(activePart));
}

/* ---------- Hit-test ---------- */

function getMouseInCanvas(cvs, e) {
    var rect = cvs.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function findPointNear(viewKey, mx, my) {
    var vp = viewCtx[viewKey];
    if (!vp || !activePart) return null;
    var prof = getProfile(activePart);
    var view = viewKey === 'front' ? prof.front : prof.side;
    var vpP = viewParams(vp, prof);
    var scale = vpP.scale * prof.scale;

    for (var i = 0; i < view.points.length; i++) {
        var p = view.points[i];
        var y = vpP.H - vpP.padding - p.t * vpP.plotH;
        var xR = vpP.cx + p.rR * scale, xL = vpP.cx - p.rL * scale;
        if ((mx - xR) * (mx - xR) + (my - y) * (my - y) < 100) return { index: i, side: 'R', vpP: vpP };
        if ((mx - xL) * (mx - xL) + (my - y) * (my - y) < 100) return { index: i, side: 'L', vpP: vpP };
    }
    return null;
}

function isNearJointLine(viewKey, mx, my) {
    var vp = viewCtx[viewKey];
    if (!vp || !activePart) return false;
    var prof = getProfile(activePart);
    var vpP = viewParams(vp, prof);
    var jointY = vpP.H - vpP.padding - prof.jointT * vpP.plotH;
    return Math.abs(my - jointY) < 8;
}

/* ---------- Обработчики ---------- */

function onCanvasMouseDown(viewKey, e) {
    e.preventDefault();
    var cvs = viewCtx[viewKey].canvas;
    var m = getMouseInCanvas(cvs, e);
    var hit = findPointNear(viewKey, m.x, m.y);

    if (hit && e.button === 0) {
        dragState = { view: viewKey, index: hit.index, side: hit.side, vpP: hit.vpP };
        drawAll();
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return;
    }

    if (isNearJointLine(viewKey, m.x, m.y) && e.button === 0) {
        jointDrag = { view: viewKey, vpP: viewParams(viewCtx[viewKey], getProfile(activePart)) };
        drawAll();
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return;
    }

    if (hit && e.button === 2) {
        var prof = getProfile(activePart);
        var view = viewKey === 'front' ? prof.front : prof.side;
        if (view.points.length > 2) { view.points.splice(hit.index, 1); drawAll(); }
    }
}

function onCanvasDblClick(viewKey, e) {
    if (!activePart) return;
    var vp = viewCtx[viewKey];
    var prof = getProfile(activePart);
    var view = viewKey === 'front' ? prof.front : prof.side;
    var vpP = viewParams(vp, prof);
    var m = getMouseInCanvas(vp.canvas, e);

    var t = (vpP.H - vpP.padding - m.y) / vpP.plotH;
    if (t < 0 || t > 1) return;
    var r = Math.abs(m.x - vpP.cx) / (vpP.scale * prof.scale);
    if (r <= 0.005) return;

    var side = m.x > vpP.cx ? 'rR' : 'rL';
    var otherKey = side === 'rR' ? 'rL' : 'rR';
    var newPt = { t: t, rL: 0, rR: 0 };
    newPt[side] = r;
    if (view.symmetric) newPt[otherKey] = r;
    else newPt[otherKey] = sampleCurve(view.points, t, otherKey);

    view.points.push(newPt);
    view.points.sort(function (a, b) { return a.t - b.t; });
    drawAll();
}

function onMouseMove(e) {
    if (dragState) {
        var vp = viewCtx[dragState.view];
        var m = getMouseInCanvas(vp.canvas, e);
        var prof = getProfile(activePart);
        var view = dragState.view === 'front' ? prof.front : prof.side;
        var vpP = dragState.vpP;

        // t НЕ меняется — точка двигается только по радиусу
        var r = Math.abs(m.x - vpP.cx) / (vpP.scale * prof.scale);
        r = Math.max(0.005, r);

        var idx = dragState.index;
        var side = dragState.side;
        if (view.symmetric) {
            view.points[idx].rR = r;
            view.points[idx].rL = r;
        } else {
            view.points[idx][side === 'R' ? 'rR' : 'rL'] = r;
        }

        drawAll();
        return;
    }

    if (jointDrag) {
        var vp2 = viewCtx[jointDrag.view];
        var m2 = getMouseInCanvas(vp2.canvas, e);
        var prof2 = getProfile(activePart);
        var t2 = (jointDrag.vpP.H - jointDrag.vpP.padding - m2.y) / jointDrag.vpP.plotH;
        prof2.jointT = Math.max(0, Math.min(1, t2));
        drawAll();
        return;
    }

    if (freeDrag && viewCtx['free']) {
        var cvsF = viewCtx['free'].canvas;
        var mF = getMouseInCanvas(cvsF, e);
        var dx = mF.x - freeDrag.x, dy = mF.y - freeDrag.y;
        if (freeDrag.mode === 'orbit') {
            freeCam.az -= dx * 0.01;
            freeCam.el = Math.max(-1.2, Math.min(1.2, freeCam.el + dy * 0.01));
        } else if (freeDrag.mode === 'pan') {
            freeCam.panX += dx; freeCam.panY += dy;
        }
        freeDrag.x = mF.x; freeDrag.y = mF.y;
        drawAll();
    }
}

function onMouseUp() {
    dragState = null; jointDrag = null; freeDrag = null;
    drawAll();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
}

function onFreeMouseDown(e) {
    e.preventDefault();
    var cvs = viewCtx['free'].canvas;
    var m = getMouseInCanvas(cvs, e);
    freeDrag = { x: m.x, y: m.y, mode: (e.shiftKey || e.button === 1) ? 'pan' : 'orbit' };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

function onFreeWheel(e) {
    e.preventDefault();
    freeCam.dist = Math.max(0.5, Math.min(20, freeCam.dist * (1 + Math.sign(e.deltaY) * 0.12)));
    drawAll();
}

function setupView(viewKey, cvs) {
    viewCtx[viewKey] = setupCanvas(cvs);

    if (viewKey === 'front' || viewKey === 'side') {
        cvs.addEventListener('mousedown', function (e) { onCanvasMouseDown(viewKey, e); });
        cvs.addEventListener('dblclick', function (e) { onCanvasDblClick(viewKey, e); });
        cvs.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    } else if (viewKey === 'free') {
        cvs.addEventListener('mousedown', onFreeMouseDown);
        cvs.addEventListener('wheel', onFreeWheel, { passive: false });
        cvs.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
}

function bindSymToggles() {
    document.querySelectorAll('.sym-toggle').forEach(function (cb) {
        cb.addEventListener('change', function () {
            if (!activePart) return;
            var prof = getProfile(activePart);
            var viewKey = cb.dataset.view;
            var view = viewKey === 'front' ? prof.front : prof.side;
            view.symmetric = cb.checked;
            if (cb.checked) view.points.forEach(function (p) { p.rL = p.rR; });
            drawAll();
        });
    });
}

function bindScaleSlider() {
    var slider = document.getElementById('formScale');
    var out    = document.getElementById('formScaleVal');
    if (!slider || !out) return;
    slider.addEventListener('input', function () {
        if (!activePart) return;
        var prof = getProfile(activePart);
        prof.scale = parseFloat(slider.value);
        out.textContent = prof.scale.toFixed(2);
        drawAll();
    });
}

/* ---------- API ---------- */

function open(partName) {
    if (!partsProfiles[partName]) partsProfiles[partName] = defaultProfile({});
    activePart = partName;
    isOpen = true;
    var prof = getProfile(partName);
    document.getElementById('formPartName').textContent = partName;
    document.getElementById('formModal').classList.remove('hidden');
    document.getElementById('formApply').disabled = false;

    var frontCb = document.querySelector('.sym-toggle[data-view="front"]');
    var sideCb  = document.querySelector('.sym-toggle[data-view="side"]');
    if (frontCb) frontCb.checked = prof.front.symmetric;
    if (sideCb)  sideCb.checked  = prof.side.symmetric;

    var slider = document.getElementById('formScale');
    var out    = document.getElementById('formScaleVal');
    if (slider) slider.value = prof.scale;
    if (out)    out.textContent = prof.scale.toFixed(2);

    document.querySelectorAll('#formModal [data-canvas]').forEach(function (cvs) {
        setupView(cvs.dataset.canvas, cvs);
    });
    drawAll();
}

function close() {
    isOpen = false;
    document.getElementById('formModal').classList.add('hidden');
    dragState = null; jointDrag = null; freeDrag = null;
}

function apply() {
    if (activePart && onApplyCb) onApplyCb(activePart, partsProfiles[activePart]);
}

function resize() {
    if (!isOpen) return;
    document.querySelectorAll('#formModal [data-canvas]').forEach(function (cvs) {
        setupView(cvs.dataset.canvas, cvs);
    });
    drawAll();
}

bindSymToggles();
bindScaleSlider();

return {
    open: open,
    close: close,
    apply: apply,
    resize: resize,
    getProfile: getProfile,
    setProfile: setProfile,
    listParts: listParts,
    getAllProfiles: getAllProfiles,
    setProfiles: setProfiles,
    sampleProfile: sampleProfile,
    sampleView: sampleView,
    sampleCurve: sampleCurve,
    setApplyCallback: function (fn) { onApplyCb = fn; }
};

})();
