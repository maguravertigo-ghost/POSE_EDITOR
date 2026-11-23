(function () {
'use strict';

if (typeof THREE === 'undefined') {
    document.body.innerHTML =
        '<div class="error-msg">Не загружена библиотека THREE.\n' +
        'Убедитесь, что three.min.js лежит рядом с index.html.</div>';
    return;
}

var state = {
    toggles: { joints: true, gizmo: true, grid: true },
    serverAvailable: false,
    browserType: null
};

/* ==================== RENDERER ==================== */

var canvas = document.getElementById('c');
var stage  = document.getElementById('stage');
var fpsEl  = document.getElementById('fps');

var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a24);
var camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
var keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(3, 6, 4); keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 1024; keyLight.shadow.mapSize.height = 1024;
keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 20;
keyLight.shadow.camera.left = -3; keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 4; keyLight.shadow.camera.bottom = -1;
scene.add(keyLight);

var fillLight = new THREE.DirectionalLight(0x88aaff, 0.35);
fillLight.position.set(-4, 3, -3); scene.add(fillLight);
var rimLight = new THREE.DirectionalLight(0xffaa88, 0.25);
rimLight.position.set(0, 2, -6); scene.add(rimLight);

var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x232733, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

var grid = new THREE.GridHelper(20, 40, 0x4a9eff, 0x2a3346);
grid.material.transparent = true; grid.material.opacity = 0.35;
grid.position.y = 0.001; scene.add(grid);

var cam = { az: 0.42, el: 0.18, dist: 3.4, target: new THREE.Vector3(0, 0.9, 0) };

function updateCamera() {
    var a = cam.az, e = cam.el, d = cam.dist, t = cam.target;
    camera.position.set(
        t.x + d * Math.cos(e) * Math.sin(a),
        t.y + d * Math.sin(e),
        t.z + d * Math.cos(e) * Math.cos(a)
    );
    camera.lookAt(t);
}

/* ==================== MATERIALS ==================== */

var MAT = {
    body:     new THREE.MeshStandardMaterial({ color: 0xd6c8a8, roughness: 0.70, metalness: 0.03 }),
    clothing: new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.82, metalness: 0.03 }),
    pants:    new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.85, metalness: 0.03 }),
    shoe:     new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.55, metalness: 0.10 }),
    jointTpl: new THREE.MeshStandardMaterial({
        color: 0xff9944, emissive: 0xff5500, emissiveIntensity: 0.55,
        roughness: 0.35, metalness: 0.25, depthTest: true, depthWrite: false
    })
};

/* ==================== PROPORTIONS ==================== */

var P = {
    hipHeight: 0.90, torsoPivotY: 0.12,
    torsoToDiaphragm: 0.14, diaphragmToChest: 0.14,
    chestToNeck: 0.15, neckToHead: 0.05,
    abdomenR: 0.14, chestR: 0.15, chestCyl: 0.12,
    neckR: 0.05, neckCyl: 0.15, headR: 0.11,
    upperArmLen: 0.28, foreArmLen: 0.26, armR: 0.045,
    thighLen: 0.44, shinLen: 0.38, legR: 0.07,
    footW: 0.10, footH: 0.06, footLen: 0.24,
    shoulderX: 0.19, hipX: 0.10, jointR: 0.048
};

function makeCapsule(radius, cylLen, radialSegs, capSegs) {
    radialSegs = radialSegs || 12; capSegs = capSegs || 6;
    var hh = cylLen / 2, pts = [], i, a, b;
    for (i = 0; i <= capSegs; i++) {
        a = (i / capSegs) * Math.PI / 2;
        pts.push(new THREE.Vector2(Math.sin(a) * radius, -hh - Math.cos(a) * radius));
    }
    for (i = 0; i <= capSegs; i++) {
        b = (i / capSegs) * Math.PI / 2;
        pts.push(new THREE.Vector2(Math.cos(b) * radius, hh + Math.sin(b) * radius));
    }
    return new THREE.LatheGeometry(pts, radialSegs);
}

/* ==================== CHARACTER ==================== */

var character = new THREE.Group();
scene.add(character);
var joints = [], jointByName = {}, clickableMarkers = [], bodyMeshes = [];

function makeMarker(jointGroup) {
    var mat = MAT.jointTpl.clone();
    var m = new THREE.Mesh(new THREE.SphereGeometry(P.jointR, 14, 10), mat);
    m.userData.isMarker = true; m.renderOrder = 10;
    jointGroup.add(m); clickableMarkers.push(m);
    return m;
}

function makeJoint(parent, label, x, y, z) {
    var g = new THREE.Group();
    g.position.set(x || 0, y || 0, z || 0);
    g.userData.baseLabel = label;
    g.userData.shapeOffset = { x: 0, y: 0, z: 0 };
    g.userData.shapeScale = 1.0;
    parent.add(g);

    var sg = new THREE.Group();
    sg.userData.isShapeGroup = true;
    g.add(sg);
    g.userData.shapeGroup = sg;

    g.userData.marker = makeMarker(g);
    joints.push(g); jointByName[label] = g;
    return g;
}

function addMesh(parent, geo, mat, y) {
    var m = new THREE.Mesh(geo, mat);
    if (y !== undefined) m.position.y = y;
    m.castShadow = true; m.receiveShadow = true;
    var target = (parent.userData && parent.userData.shapeGroup) ? parent.userData.shapeGroup : parent;
    target.add(m);
    return m;
}

function applyShapeFit(joint) {
    if (!joint || !joint.userData.shapeGroup) return;
    var off = joint.userData.shapeOffset;
    var sc = joint.userData.shapeScale;
    joint.userData.shapeGroup.position.set(off.x, off.y, off.z);
    joint.userData.shapeGroup.scale.set(sc, sc, sc);
}

var hips = makeJoint(character, 'Корпус', 0, P.hipHeight, 0);
var torso = makeJoint(hips, 'Торс', 0, P.torsoPivotY, 0);
var abdomenMeshRef = addMesh(torso, new THREE.SphereGeometry(P.abdomenR, 18, 14), MAT.clothing, 0.03);
abdomenMeshRef.scale.set(1.0, 1.10, 0.9);

var diaphragm = makeJoint(torso, 'Диафрагма', 0, P.torsoToDiaphragm, 0);
var chestJoint = makeJoint(diaphragm, 'Грудная клетка', 0, P.diaphragmToChest, 0);
var chestMeshRef = addMesh(chestJoint, makeCapsule(P.chestR, P.chestCyl, 20, 10), MAT.clothing, 0.0);

var neck = makeJoint(chestJoint, 'Шея', 0, P.chestToNeck, 0);
var neckMeshRef = addMesh(neck,
    new THREE.CylinderGeometry(P.neckR * 0.9, P.neckR * 1.1, P.neckCyl, 12),
    MAT.body, P.neckCyl / 2 - 0.03);

var head = makeJoint(neck, 'Голова', 0, P.neckToHead, 0);
var skull = addMesh(head, new THREE.SphereGeometry(P.headR, 22, 18), MAT.body, P.headR * 0.9);
skull.scale.set(1.0, 1.02, 1.06);

function buildArm(sign, side) {
    var shoulder = makeJoint(chestJoint, 'Плечо ' + side, sign * P.shoulderX, P.chestToNeck - 0.02, 0);
    addMesh(shoulder, new THREE.CylinderGeometry(P.armR * 1.08, P.armR * 0.9, P.upperArmLen, 12), MAT.body, -P.upperArmLen / 2);
    var elbow = makeJoint(shoulder, 'Локоть ' + side, 0, -P.upperArmLen, 0);
    addMesh(elbow, new THREE.CylinderGeometry(P.armR * 0.92, P.armR * 0.75, P.foreArmLen, 12), MAT.body, -P.foreArmLen / 2);
    var hand = makeJoint(elbow, 'Кисть ' + side, 0, -P.foreArmLen, 0);
    addMesh(hand, new THREE.BoxGeometry(0.07, 0.055, 0.026), MAT.body, -0.028);
    var fingerGeo = new THREE.BoxGeometry(0.012, 0.05, 0.018);
    for (var i = 0; i < 4; i++) {
        var f = new THREE.Mesh(fingerGeo, MAT.body);
        f.position.set(-0.024 + i * 0.016, -0.055 - 0.025, 0);
        f.castShadow = true;
        hand.userData.shapeGroup.add(f);
    }
    var thumb = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.04, 0.022), MAT.body);
    thumb.position.set(sign * -0.038, -0.035, 0.012);
    thumb.rotation.z = sign * 0.55; thumb.castShadow = true;
    hand.userData.shapeGroup.add(thumb);
    return { shoulder: shoulder, elbow: elbow, hand: hand };
}
var armL = buildArm( 1, 'L');
var armR = buildArm(-1, 'R');

function buildLeg(sign, side) {
    var hip = makeJoint(hips, 'Бедро ' + side, sign * P.hipX, 0, 0);
    addMesh(hip, new THREE.CylinderGeometry(P.legR * 1.05, P.legR * 0.88, P.thighLen, 14), MAT.pants, -P.thighLen / 2);
    var knee = makeJoint(hip, 'Колено ' + side, 0, -P.thighLen, 0);
    addMesh(knee, new THREE.CylinderGeometry(P.legR * 0.92, P.legR * 0.65, P.shinLen, 14), MAT.pants, -P.shinLen / 2);
    var ankle = makeJoint(knee, 'Стопа ' + side, 0, -P.shinLen, 0);
    var foot = new THREE.Mesh(new THREE.BoxGeometry(P.footW, P.footH, P.footLen), MAT.shoe);
    foot.position.set(0, -P.footH / 2, P.footLen * 0.15);
    foot.castShadow = true;
    ankle.userData.shapeGroup.add(foot);
    return { hip: hip, knee: knee, ankle: ankle };
}
var legL = buildLeg( 1, 'L');
var legR = buildLeg(-1, 'R');

character.traverse(function (o) {
    if (o.isMesh && !o.userData.isMarker) bodyMeshes.push(o);
});

function linkMirror(a, b) {
    var L = jointByName[a], R = jointByName[b];
    if (L && R) { L.userData.mirrorOf = R; R.userData.mirrorOf = L; }
}
linkMirror('Плечо L', 'Плечо R');
linkMirror('Локоть L', 'Локоть R');
linkMirror('Кисть L', 'Кисть R');
linkMirror('Бедро L', 'Бедро R');
linkMirror('Колено L', 'Колено R');
linkMirror('Стопа L', 'Стопа R');

/* ==================== GIZMO ==================== */

var gizmo = new THREE.Group();
gizmo.visible = false; scene.add(gizmo);

function makeAxisLabel(text, color) {
    var cvs = document.createElement('canvas');
    cvs.width = 64; cvs.height = 64;
    var ctx = cvs.getContext('2d');
    ctx.font = 'bold 48px sans-serif'; ctx.lineWidth = 5;
    ctx.strokeStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(text, 32, 32);
    ctx.fillStyle = color; ctx.fillText(text, 32, 32);
    var tex = new THREE.CanvasTexture(cvs);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 1001; sp.scale.set(0.25, 0.25, 1);
    return sp;
}

var GIZMO_R = 1.0, GIZMO_T = 0.06;

function makeRing(color, axis) {
    var mesh = new THREE.Mesh(
        new THREE.TorusGeometry(GIZMO_R, GIZMO_T, 10, 48),
        new THREE.MeshBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 0.85 })
    );
    mesh.userData.axis = axis; mesh.userData.isGizmoRing = true;
    mesh.renderOrder = 1000;
    return mesh;
}

var ringX = makeRing(0xff4444, 'x'); ringX.rotation.y = Math.PI / 2;
var ringY = makeRing(0x44ff88, 'y'); ringY.rotation.x = Math.PI / 2;
var ringZ = makeRing(0x4a9eff, 'z');
gizmo.add(ringX, ringY, ringZ);

var labelX = makeAxisLabel('X', '#ff6666'); labelX.position.set(GIZMO_R + 0.18, 0, 0);
var labelY = makeAxisLabel('Y', '#66ff99'); labelY.position.set(0, GIZMO_R + 0.18, 0);
var labelZ = makeAxisLabel('Z', '#6ea8ff'); labelZ.position.set(0, 0, GIZMO_R + 0.18);
gizmo.add(labelX, labelY, labelZ);

var gizmoRings = [ringX, ringY, ringZ];
var _tmpPos = new THREE.Vector3();

function updateGizmoTransform() {
    if (!selectedJoint || !state.toggles.gizmo) { gizmo.visible = false; return; }
    gizmo.visible = true;
    selectedJoint.getWorldPosition(_tmpPos);
    gizmo.position.copy(_tmpPos);
    var s = camera.position.distanceTo(_tmpPos) * 0.10;
    gizmo.scale.set(s, s, s);
    gizmo.rotation.set(0, 0, 0);
}

/* ==================== SELECTION ==================== */

var selectedJoint = null;

function setMarkerStyle(joint, selected) {
    if (!joint || !joint.userData.marker) return;
    var m = joint.userData.marker.material;
    if (selected) {
        m.color.setHex(0x4a9eff); m.emissive.setHex(0x2266cc); m.emissiveIntensity = 1.1;
        joint.userData.marker.scale.setScalar(1.35);
    } else {
        m.color.setHex(0xff9944); m.emissive.setHex(0xff5500); m.emissiveIntensity = 0.55;
        joint.userData.marker.scale.setScalar(1.0);
    }
}

function selectJoint(joint) {
    if (selectedJoint === joint) return;
    if (selectedJoint) setMarkerStyle(selectedJoint, false);
    selectedJoint = joint;
    if (joint) setMarkerStyle(joint, true);
    updateTreeSelection(); updateHUD(); updateGizmoTransform();
}

/* ==================== RAYCAST ==================== */

var raycaster = new THREE.Raycaster();
var ndc = new THREE.Vector2();

function screenToNDC(x, y) {
    var rect = canvas.getBoundingClientRect();
    ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
    return ndc;
}

function pickGizmo(x, y) {
    if (!selectedJoint || !state.toggles.gizmo || !gizmo.visible) return null;
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(screenToNDC(x, y), camera);
    var hits = raycaster.intersectObjects(gizmoRings, false);
    return hits.length ? hits[0].object.userData.axis : null;
}

function pickJoint(x, y) {
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(screenToNDC(x, y), camera);
    var visibleMarkers = clickableMarkers.filter(function (m) {
        return m.visible && m.parent && m.parent.visible;
    });
    var markerHits = raycaster.intersectObjects(visibleMarkers, false);
    if (!markerHits.length) return null;
    var bodyHits = raycaster.intersectObjects(bodyMeshes, false);
    if (bodyHits.length && bodyHits[0].distance < markerHits[0].distance - 0.001) return null;
    return markerHits[0].object.parent;
}

/* ==================== INPUT ==================== */

var dragMode = null, lastPos = null, gizmoDrag = null;

function angleToGizmoCenter(x, y) {
    var pos = new THREE.Vector3();
    selectedJoint.getWorldPosition(pos); pos.project(camera);
    var rect = canvas.getBoundingClientRect();
    var cx = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
    var cy = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
    return Math.atan2(y - cy, x - cx);
}

function onPointerDown(e) {
    if (e.button === 2 || e.button === 1) {
        dragMode = (e.shiftKey || e.button === 1) ? 'pan' : 'orbit';
        lastPos = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
    var axis = pickGizmo(e.clientX, e.clientY);
    if (axis) {
        dragMode = 'gizmo';
        gizmoDrag = {
            axis: axis,
            startAngle: angleToGizmoCenter(e.clientX, e.clientY),
            startRotation: selectedJoint.rotation[axis]
        };
        lastPos = { x: e.clientX, y: e.clientY };
        return;
    }
    var joint = pickJoint(e.clientX, e.clientY);
    if (joint) {
        if (joint !== selectedJoint) selectJoint(joint);
        dragMode = 'rotate';
    } else {
        if (selectedJoint) selectJoint(null);
        dragMode = 'orbit';
    }
    lastPos = { x: e.clientX, y: e.clientY };
}

function onPointerMove(e) {
    if (dragMode === 'gizmo' && selectedJoint && gizmoDrag) {
        var angle = angleToGizmoCenter(e.clientX, e.clientY);
        var delta = angle - gizmoDrag.startAngle;
        while (delta >  Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        selectedJoint.rotation[gizmoDrag.axis] = gizmoDrag.startRotation + delta;
        updateHUD();
        return;
    }
    if (!dragMode || !lastPos) return;
    var dx = e.clientX - lastPos.x, dy = e.clientY - lastPos.y;
    if (dragMode === 'orbit') {
        cam.az -= dx * 0.008;
        cam.el = Math.max(-0.15, Math.min(Math.PI * 0.48, cam.el + dy * 0.006));
        updateCamera();
    } else if (dragMode === 'pan') {
        var right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
        camera.matrix.extractBasis(right, up, fwd);
        var sc = cam.dist * 0.0012;
        cam.target.addScaledVector(right, -dx * sc);
        cam.target.addScaledVector(up, dy * sc);
        updateCamera();
    } else if (dragMode === 'rotate' && selectedJoint) {
        selectedJoint.rotation.y += dx * 0.012;
        selectedJoint.rotation.x += dy * 0.012;
        updateHUD();
    }
    lastPos = { x: e.clientX, y: e.clientY };
}

function onPointerUp() { dragMode = null; lastPos = null; gizmoDrag = null; }

if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
}
canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.dist = Math.max(1, Math.min(15, cam.dist * (1 - Math.sign(e.deltaY) * 0.1)));
    updateCamera();
}, { passive: false });
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

/* ==================== TREE ==================== */

var treeContainer = document.getElementById('tree');

function buildTree() {
    treeContainer.innerHTML = '';
    treeContainer.appendChild(renderTreeNode(hips));
}

function renderTreeNode(joint) {
    var node = document.createElement('div');
    node.className = 'tree-item';
    node.textContent = joint.userData.baseLabel || '—';
    joint.userData.treeEl = node;
    node.addEventListener('click', function (e) { e.stopPropagation(); selectJoint(joint); });
    var childJoints = joint.children.filter(function (c) { return c.isGroup && c.userData.baseLabel; });
    if (childJoints.length) {
        var childrenBox = document.createElement('div');
        childrenBox.className = 'tree-children';
        childJoints.forEach(function (c) { childrenBox.appendChild(renderTreeNode(c)); });
        node.appendChild(childrenBox);
    }
    return node;
}

function updateTreeSelection() {
    joints.forEach(function (j) { if (j.userData.treeEl) j.userData.treeEl.classList.remove('selected'); });
    if (selectedJoint && selectedJoint.userData.treeEl) selectedJoint.userData.treeEl.classList.add('selected');
}

/* ==================== MESSAGE MODAL ==================== */

var msgModal  = document.getElementById('msgModal');
var msgTitle  = document.getElementById('msgTitle');
var msgText   = document.getElementById('msgText');
var msgInput  = document.getElementById('msgInput');
var msgOk     = document.getElementById('msgOk');
var msgCancel = document.getElementById('msgCancel');

function closeMsg() { msgModal.classList.add('hidden'); }

function _msgKeyHandler(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        if (!msgCancel.classList.contains('hidden')) msgCancel.click();
        else msgOk.click();
    } else if (e.key === 'Enter') {
        if (e.target && e.target.tagName === 'INPUT') {
            e.preventDefault();
            msgOk.click();
        }
    }
}

function showMessage(text, title) {
    return new Promise(function (resolve) {
        msgTitle.textContent = title || 'Сообщение';
        msgText.textContent = text;
        msgInput.classList.add('hidden');
        msgCancel.classList.add('hidden');
        msgOk.textContent = 'OK';
        msgModal.classList.remove('hidden');
        document.addEventListener('keydown', _msgKeyHandler);
        setTimeout(function () { try { msgOk.focus(); } catch (_) {} }, 20);
        var done = function () {
            closeMsg();
            document.removeEventListener('keydown', _msgKeyHandler);
        };
        msgOk.onclick = function () { done(); resolve(); };
        msgCancel.onclick = function () { done(); resolve(); };
    });
}

function showConfirm(text, title) {
    return new Promise(function (resolve) {
        msgTitle.textContent = title || 'Подтверждение';
        msgText.textContent = text;
        msgInput.classList.add('hidden');
        msgCancel.classList.remove('hidden');
        msgCancel.textContent = 'Отмена';
        msgOk.textContent = 'Да';
        msgModal.classList.remove('hidden');
        document.addEventListener('keydown', _msgKeyHandler);
        setTimeout(function () { try { msgOk.focus(); } catch (_) {} }, 20);
        var done = function (val) {
            closeMsg();
            document.removeEventListener('keydown', _msgKeyHandler);
            resolve(val);
        };
        msgOk.onclick = function () { done(true); };
        msgCancel.onclick = function () { done(false); };
    });
}

function showPrompt(text, defaultValue, title) {
    return new Promise(function (resolve) {
        msgTitle.textContent = title || 'Ввод';
        msgText.textContent = text;
        msgInput.value = defaultValue || '';
        msgInput.classList.remove('hidden');
        msgCancel.classList.remove('hidden');
        msgCancel.textContent = 'Отмена';
        msgOk.textContent = 'OK';
        msgModal.classList.remove('hidden');
        document.addEventListener('keydown', _msgKeyHandler);
        setTimeout(function () { try { msgInput.focus(); msgInput.select(); } catch (_) {} }, 20);
        var done = function (val) {
            closeMsg();
            document.removeEventListener('keydown', _msgKeyHandler);
            resolve(val);
        };
        msgOk.onclick = function () { done(msgInput.value); };
        msgCancel.onclick = function () { done(null); };
    });
}

/* ==================== HUD ==================== */

var hud = document.getElementById('hud');
var hudTitle = hud.querySelector('.hud-title');
var rotInputs = hud.querySelectorAll('[data-rot]');
var rotVals   = hud.querySelectorAll('[data-rot-val]');
var posInputs = hud.querySelectorAll('[data-pos]');
var posVals   = hud.querySelectorAll('[data-pos-val]');
var offInputs = hud.querySelectorAll('[data-offset]');
var offVals   = hud.querySelectorAll('[data-offset-val]');
var scaleInput = hud.querySelector('[data-scale]');
var scaleVal   = hud.querySelector('[data-scale-val]');
var zoomBtns   = hud.querySelectorAll('[data-zoom]');
var fitResetBtn = hud.querySelector('[data-fit-reset]');

hud.querySelectorAll('.hud-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
        hud.querySelectorAll('.hud-tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
        hud.querySelectorAll('.hud-panel').forEach(function (p) {
            p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab);
        });
    });
});

function hasShape(joint) {
    if (!joint || !joint.userData.shapeGroup) return false;
    return joint.userData.shapeGroup.children.length > 0;
}

function updateHUD() {
    if (!selectedJoint) { hud.classList.add('hidden'); return; }
    hud.classList.remove('hidden');
    hudTitle.textContent = selectedJoint.userData.baseLabel || 'Сустав';

    var fitTab = hud.querySelector('[data-tab="fit"]');
    if (hasShape(selectedJoint)) {
        fitTab.classList.remove('hidden');
    } else {
        fitTab.classList.add('hidden');
        if (fitTab.classList.contains('active')) {
            hud.querySelector('[data-tab="rot"]').click();
        }
    }

    var rv = [selectedJoint.rotation.x, selectedJoint.rotation.y, selectedJoint.rotation.z];
    var pv = [selectedJoint.position.x, selectedJoint.position.y, selectedJoint.position.z];

    rotInputs.forEach(function (inp, i) {
        inp.value = rv[i];
        rotVals[i].textContent = Math.round(rv[i] * 180 / Math.PI) + '°';
    });
    posInputs.forEach(function (inp, i) {
        inp.value = pv[i];
        posVals[i].textContent = pv[i].toFixed(2);
    });

    if (hasShape(selectedJoint)) {
        var off = selectedJoint.userData.shapeOffset;
        offInputs.forEach(function (inp, i) {
            var key = ['x', 'y', 'z'][i];
            inp.value = off[key];
            offVals[i].textContent = off[key].toFixed(2);
        });
        if (scaleInput) scaleInput.value = selectedJoint.userData.shapeScale;
        if (scaleVal) scaleVal.textContent = selectedJoint.userData.shapeScale.toFixed(2);
    }
}

rotInputs.forEach(function (inp, i) {
    inp.addEventListener('input', function () {
        if (!selectedJoint) return;
        selectedJoint.rotation[['x', 'y', 'z'][i]] = parseFloat(inp.value);
        updateHUD();
    });
});

posInputs.forEach(function (inp, i) {
    inp.addEventListener('input', function () {
        if (!selectedJoint) return;
        var axis = ['x', 'y', 'z'][i];
        var v = parseFloat(inp.value);
        selectedJoint.position[axis] = v;
        var mirror = selectedJoint.userData.mirrorOf;
        if (mirror) {
            if (axis === 'x') mirror.position.x = -v;
            else mirror.position[axis] = v;
        }
        updateHUD();
    });
});

function setJointOffset(joint, offset) {
    if (!joint) return;
    joint.userData.shapeOffset = { x: offset.x, y: offset.y, z: offset.z };
    applyShapeFit(joint);
    var mirror = joint.userData.mirrorOf;
    if (mirror) {
        mirror.userData.shapeOffset = { x: -offset.x, y: offset.y, z: offset.z };
        applyShapeFit(mirror);
    }
}

function setJointScale(joint, s) {
    if (!joint) return;
    s = Math.max(0.3, Math.min(3, s));
    joint.userData.shapeScale = s;
    applyShapeFit(joint);
    var mirror = joint.userData.mirrorOf;
    if (mirror) {
        mirror.userData.shapeScale = s;
        applyShapeFit(mirror);
    }
}

offInputs.forEach(function (inp, i) {
    inp.addEventListener('input', function () {
        if (!selectedJoint || !hasShape(selectedJoint)) return;
        var axis = ['x', 'y', 'z'][i];
        var v = parseFloat(inp.value);
        var off = selectedJoint.userData.shapeOffset;
        off[axis] = v;
        setJointOffset(selectedJoint, off);
        offVals[i].textContent = v.toFixed(2);
    });
});

zoomBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
        if (!selectedJoint || !hasShape(selectedJoint)) return;
        var delta = btn.dataset.zoom === '+' ? 0.05 : -0.05;
        setJointScale(selectedJoint, selectedJoint.userData.shapeScale + delta);
        updateHUD();
    });
});

if (scaleInput) {
    scaleInput.addEventListener('input', function () {
        if (!selectedJoint || !hasShape(selectedJoint)) return;
        setJointScale(selectedJoint, parseFloat(scaleInput.value));
        if (scaleVal) scaleVal.textContent = parseFloat(scaleInput.value).toFixed(2);
    });
}

if (fitResetBtn) {
    fitResetBtn.addEventListener('click', function () {
        if (!selectedJoint || !hasShape(selectedJoint)) return;
        setJointOffset(selectedJoint, { x: 0, y: 0, z: 0 });
        setJointScale(selectedJoint, 1.0);
        updateHUD();
    });
}

/* ==================== POSE ==================== */

function getCurrentPose() {
    var data = {};
    joints.forEach(function (j) {
        data[j.userData.baseLabel] = {
            r: [j.rotation.x, j.rotation.y, j.rotation.z],
            p: [j.position.x, j.position.y, j.position.z]
        };
    });
    return data;
}

function applyPose(data) {
    if (!data) return;
    Object.keys(data).forEach(function (name) {
        var j = jointByName[name];
        if (!j) return;
        var entry = data[name];
        if (Array.isArray(entry)) {
            j.rotation.set(entry[0], entry[1], entry[2]);
        } else {
            if (entry.r) j.rotation.set(entry.r[0], entry.r[1], entry.r[2]);
            if (entry.p) j.position.set(entry.p[0], entry.p[1], entry.p[2]);
        }
    });
    updateHUD();
}

function getCurrentFits() {
    var fits = {};
    joints.forEach(function (j) {
        if (!hasShape(j)) return;
        fits[j.userData.baseLabel] = {
            offset: { x: j.userData.shapeOffset.x, y: j.userData.shapeOffset.y, z: j.userData.shapeOffset.z },
            scale: j.userData.shapeScale
        };
    });
    return fits;
}

function applyFits(fits) {
    if (!fits) return;
    Object.keys(fits).forEach(function (name) {
        var j = jointByName[name];
        if (!j) return;
        var f = fits[name];
        if (f.offset) j.userData.shapeOffset = { x: f.offset.x || 0, y: f.offset.y || 0, z: f.offset.z || 0 };
        if (f.scale != null) j.userData.shapeScale = f.scale;
        applyShapeFit(j);
    });
}

function buildModelData(name) {
    var profiles = (typeof ShapeEditor !== 'undefined' && ShapeEditor.getAllProfiles) ?
        ShapeEditor.getAllProfiles() : {};
    return {
        version: 4,
        type: 'character',
        face_dir: '+Z',
        name: name || 'character',
        savedAt: new Date().toISOString(),
        pose: getCurrentPose(),
        profiles: profiles,
        fits: getCurrentFits()
    };
}

function applyModelData(data) {
    if (!data) return;
    if (data.pose) applyPose(data.pose);
    else if (data.joints) applyPose(data.joints);

    if (data.profiles && typeof ShapeEditor !== 'undefined' && ShapeEditor.setProfiles) {
        ShapeEditor.setProfiles(data.profiles);
        Object.keys(data.profiles).forEach(function (name) {
            rebuildMeshForPart(name);
        });
    }
    if (data.fits) applyFits(data.fits);
    updateHUD();
}

function rebuildJointPositions() {
    hips.position.set(0, P.hipHeight, 0);
    torso.position.set(0, P.torsoPivotY, 0);
    diaphragm.position.set(0, P.torsoToDiaphragm, 0);
    chestJoint.position.set(0, P.diaphragmToChest, 0);
    neck.position.set(0, P.chestToNeck, 0);
    head.position.set(0, P.neckToHead, 0);
    armL.shoulder.position.set( P.shoulderX, P.chestToNeck - 0.02, 0);
    armR.shoulder.position.set(-P.shoulderX, P.chestToNeck - 0.02, 0);
    armL.elbow.position.set(0, -P.upperArmLen, 0);
    armR.elbow.position.set(0, -P.upperArmLen, 0);
    armL.hand.position.set(0, -P.foreArmLen, 0);
    armR.hand.position.set(0, -P.foreArmLen, 0);
    legL.hip.position.set( P.hipX, 0, 0);
    legR.hip.position.set(-P.hipX, 0, 0);
    legL.knee.position.set(0, -P.thighLen, 0);
    legR.knee.position.set(0, -P.thighLen, 0);
    legL.ankle.position.set(0, -P.shinLen, 0);
    legR.ankle.position.set(0, -P.shinLen, 0);
}

function newCharacter() {
    joints.forEach(function (j) {
        j.rotation.set(0, 0, 0);
        j.userData.shapeOffset = { x: 0, y: 0, z: 0 };
        j.userData.shapeScale = 1.0;
        applyShapeFit(j);
    });
    rebuildJointPositions();
    cam.az = 0.42; cam.el = 0.18; cam.dist = 3.4;
    cam.target.set(0, 0.9, 0);
    updateCamera(); selectJoint(null); updateHUD();
}

/* ==================== BACKGROUND ==================== */

var bgTexture = null;
function setBackgroundFromFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
        if (bgTexture) bgTexture.dispose();
        new THREE.TextureLoader().load(reader.result, function (tex) {
            bgTexture = tex; scene.background = tex;
        });
    };
    reader.readAsDataURL(file);
}
function clearBackground() {
    if (bgTexture) { bgTexture.dispose(); bgTexture = null; }
    scene.background = new THREE.Color(0x1a1a24);
}

/* ==================== SERVER API ==================== */

async function checkServer() {
    try {
        var r = await fetch('/api/ping');
        if (!r.ok) return false;
        var j = await r.json();
        state.serverAvailable = !!(j && j.ok);
        return state.serverAvailable;
    } catch (e) { state.serverAvailable = false; return false; }
}

async function apiGet(url) {
    try { var r = await fetch(url); var j = await r.json(); return j; }
    catch (e) { return { ok: false, error: String(e) }; }
}
async function apiPost(url, body) {
    try {
        var r = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await r.json();
    } catch (e) { return { ok: false, error: String(e) }; }
}
async function apiDelete(url) {
    try { var r = await fetch(url, { method: 'DELETE' }); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
}

/* ==================== SAVE / LOAD ==================== */

async function savePoseSmart() {
    var name = await showPrompt('Имя позы:', 'pose_' + Date.now(), 'Сохранить позу');
    if (!name) return;
    var data = {
        version: 4, type: 'pose', name: name, face_dir: '+Z',
        savedAt: new Date().toISOString(),
        joints: getCurrentPose()
    };
    if (await checkServer()) {
        var res = await apiPost('/api/poses/save/' + encodeURIComponent(name), data);
        if (res && res.ok) { await showMessage('Поза сохранена: ' + name, 'Готово'); return; }
        await showMessage('Ошибка: ' + (res.error || '?'), 'Ошибка');
        return;
    }
    downloadJSON(data, name + '.json');
    await showMessage('Скачано как файл: ' + name + '.json', 'Сохранено');
}

async function saveModelSmart() {
    var name = await showPrompt('Имя модели:', 'character_' + Date.now(), 'Сохранить модель');
    if (!name) return;
    var data = buildModelData(name);
    if (await checkServer()) {
        var res = await apiPost('/api/models/save/' + encodeURIComponent(name), data);
        if (res && res.ok) { await showMessage('Модель сохранена: ' + name, 'Готово'); return; }
        await showMessage('Ошибка: ' + (res.error || '?'), 'Ошибка');
        return;
    }
    downloadJSON(data, name + '.json');
    await showMessage('Скачано как файл: ' + name + '.json', 'Сохранено');
}

async function openPoseSmart() {
    if (await checkServer()) openBrowser('poses');
    else document.getElementById('filePose').click();
}
async function openModelSmart() {
    if (await checkServer()) openBrowser('models');
    else document.getElementById('fileModel').click();
}

function downloadJSON(obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

function loadPoseFromFile(file) {
    var reader = new FileReader();
    reader.onload = async function () {
        try {
            var data = JSON.parse(reader.result);
            if (!data) throw new Error('Пустой JSON');
            if (data.joints) applyPose(data.joints);
            else if (data.pose) applyModelData(data);
            else applyPose(data);
        } catch (err) {
            await showMessage('Ошибка загрузки:\n' + err.message, 'Ошибка');
        }
    };
    reader.readAsText(file);
}

/* ==================== BROWSER MODAL ==================== */

var browserModal = document.getElementById('browserModal');
var browserTitle = document.getElementById('browserTitle');
var browserList  = document.getElementById('browserList');
var browserHint  = document.getElementById('browserHint');

function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
}
function fmtDate(iso) {
    if (!iso) return '';
    try { var d = new Date(iso); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5); }
    catch (e) { return ''; }
}

async function openBrowser(type) {
    state.browserType = type;
    var titles = { models: 'Модели', poses: 'Позы (общая библиотека)', presets: 'Пресеты' };
    browserTitle.textContent = titles[type] || 'Библиотека';
    var hints = {
        models: 'Папка: library/models/',
        poses:  'Файл: library/poses.json (+ poses.bak)',
        presets:'Папка: pose_presets/'
    };
    browserHint.textContent = hints[type] || '';
    browserList.innerHTML = '<div class="browser-empty">Загрузка…</div>';
    browserModal.classList.remove('hidden');

    var items = [];
    if (type === 'poses') {
        var res = await apiGet('/api/poses/list');
        items = (res && res.ok) ? res.list : [];
    } else {
        var res2 = await apiGet('/api/' + type + '/list');
        items = (res2 && res2.ok) ? res2.list : [];
    }

    if (!items.length) {
        browserList.innerHTML = '<div class="browser-empty">Пусто.</div>';
        return;
    }
    browserList.innerHTML = '';
    items.forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'browser-item';
        var name = document.createElement('div');
        name.className = 'b-name'; name.textContent = it.name;
        var meta = document.createElement('div');
        meta.className = 'b-meta';
        meta.textContent = (it.size ? fmtSize(it.size) + ' · ' : '') + fmtDate(it.mtime || it.savedAt);
        var del = document.createElement('button');
        del.className = 'b-del'; del.title = 'Удалить'; del.textContent = '🗑';
        row.appendChild(name); row.appendChild(meta); row.appendChild(del);

        row.addEventListener('click', async function (e) {
            if (e.target === del) return;
            var data = null;
            if (type === 'poses') {
                var r = await apiGet('/api/poses/load/' + encodeURIComponent(it.name));
                data = r && r.ok ? r.data : null;
            } else {
                var r2 = await apiGet('/api/' + type + '/load/' + encodeURIComponent(it.name));
                data = r2 && r2.ok ? r2.data : null;
            }
            if (!data) { await showMessage('Не удалось загрузить: ' + it.name, 'Ошибка'); return; }
            if (type === 'models') applyModelData(data);
            else if (type === 'poses') { if (data.joints) applyPose(data.joints); }
            else if (type === 'presets') {
                if (data.joints) applyPose(data.joints);
                else if (data.data) applyPose(data.data);
            }
            browserModal.classList.add('hidden');
        });

        del.addEventListener('click', async function (e) {
            e.stopPropagation();
            var ok = await showConfirm('Удалить "' + it.name + '"?', 'Удаление');
            if (!ok) return;
            var url = (type === 'poses')
                ? '/api/poses/delete/' + encodeURIComponent(it.name)
                : '/api/' + type + '/delete/' + encodeURIComponent(it.name);
            var res = await apiDelete(url);
            if (res && res.ok) openBrowser(type);
            else await showMessage('Не удалось удалить.', 'Ошибка');
        });

        browserList.appendChild(row);
    });
}

document.getElementById('browserClose').addEventListener('click', function () { browserModal.classList.add('hidden'); });
document.getElementById('browserCancel').addEventListener('click', function () { browserModal.classList.add('hidden'); });
browserModal.addEventListener('click', function (e) { if (e.target === browserModal) browserModal.classList.add('hidden'); });

/* ==================== PRESETS ==================== */

function getLibrary() {
    if (!window.POSE_LIBRARY || !Array.isArray(window.POSE_LIBRARY.poses)) {
        window.POSE_LIBRARY = { version: 2, face_dir: '+Z', poses: [] };
    }
    return window.POSE_LIBRARY;
}

function renderPresetMenu() {
    var list = document.getElementById('presetList');
    list.innerHTML = '';
    var lib = getLibrary();

    lib.poses.forEach(function (p) {
        var btn = document.createElement('button');
        btn.textContent = p.name;
        btn.addEventListener('click', function () { applyPose(p.data); closeAllMenus(); });
        list.appendChild(btn);
    });
    list.appendChild(document.createElement('hr'));

    var saveCur = document.createElement('button');
    saveCur.textContent = '➕ Сохранить текущую в poses.js';
    saveCur.addEventListener('click', async function () {
        var name = await showPrompt('Название:', 'Пресет ' + (lib.poses.length + 1), 'Новый пресет');
        if (!name) return;
        lib.poses.push({ id: 'custom_' + Date.now(), name: name, data: getCurrentPose() });
        renderPresetMenu();
    });
    list.appendChild(saveCur);

    var exportBtn = document.createElement('button');
    exportBtn.textContent = '💾 Экспорт poses.js';
    exportBtn.addEventListener('click', function () {
        var json = 'window.POSE_LIBRARY = ' + JSON.stringify(lib, null, 4) + ';\n';
        var blob = new Blob([json], { type: 'application/javascript' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'poses.js'; a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    });
    list.appendChild(exportBtn);

    var importBtn = document.createElement('button');
    importBtn.textContent = '📂 Импорт poses.js…';
    importBtn.addEventListener('click', function () { document.getElementById('filePresets').click(); });
    list.appendChild(importBtn);

    list.appendChild(document.createElement('hr'));

    var serverLoadBtn = document.createElement('button');
    serverLoadBtn.textContent = '📥 Пресеты из pose_presets/';
    serverLoadBtn.addEventListener('click', function () { openBrowser('presets'); closeAllMenus(); });
    list.appendChild(serverLoadBtn);

    var serverSaveBtn = document.createElement('button');
    serverSaveBtn.textContent = '💾 Сохранить в pose_presets/';
    serverSaveBtn.addEventListener('click', async function () {
        var name = await showPrompt('Имя пресета:', 'preset_' + Date.now(), 'Сохранить пресет');
        if (!name) return;
        if (!await checkServer()) { await showMessage('Сервер недоступен.', 'Ошибка'); return; }
        var res = await apiPost('/api/presets/save/' + encodeURIComponent(name), {
            version: 2, face_dir: '+Z', name: name,
            savedAt: new Date().toISOString(), joints: getCurrentPose()
        });
        if (res && res.ok) await showMessage('Пресет сохранён: ' + name, 'Готово');
        else await showMessage('Ошибка: ' + (res.error || '?'), 'Ошибка');
    });
    list.appendChild(serverSaveBtn);
}

document.getElementById('filePresets').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = async function () {
        try {
            var text = reader.result, data = null;
            if (/^\s*\{/.test(text)) data = JSON.parse(text);
            else {
                var m = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
                if (!m) throw new Error('Нет объекта');
                data = JSON.parse(m[1]);
            }
            if (!data.poses || !Array.isArray(data.poses)) throw new Error('Нет poses');
            window.POSE_LIBRARY = data;
            renderPresetMenu();
        } catch (err) {
            await showMessage('Ошибка: ' + err.message, 'Ошибка');
        }
    };
    reader.readAsText(f);
});

/* ==================== MENU ==================== */

function closeAllMenus() {
    document.querySelectorAll('.menu').forEach(function (m) { m.classList.remove('open'); });
}

document.querySelectorAll('.menu .menu-toggle').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = btn.closest('.menu');
        var wasOpen = menu.classList.contains('open');
        closeAllMenus();
        if (!wasOpen) menu.classList.add('open');
    });
});
document.addEventListener('click', closeAllMenus);

document.querySelectorAll('#menuFile .menu-list button').forEach(function (btn) {
    btn.addEventListener('click', function () {
        var action = btn.dataset.action;
        closeAllMenus();
        switch (action) {
            case 'new':         newCharacter(); break;
            case 'open-pose':   openPoseSmart(); break;
            case 'save-pose':   savePoseSmart(); break;
            case 'open-model':  openModelSmart(); break;
            case 'save-model':  saveModelSmart(); break;
            case 'bg':          document.getElementById('fileBg').click(); break;
            case 'bg-clear':    clearBackground(); break;
        }
    });
});

document.getElementById('filePose').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) loadPoseFromFile(f);
    e.target.value = '';
});

document.getElementById('fileModel').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = async function () {
        try { applyModelData(JSON.parse(reader.result)); }
        catch (err) { await showMessage('Ошибка:\n' + err.message, 'Ошибка'); }
    };
    reader.readAsText(f);
});

document.getElementById('fileBg').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) setBackgroundFromFile(f);
    e.target.value = '';
});

/* ==================== TOGGLES ==================== */

function bindToggle(btnId, key, apply) {
    var btn = document.getElementById(btnId);
    btn.addEventListener('click', function () {
        state.toggles[key] = !state.toggles[key];
        btn.classList.toggle('active', state.toggles[key]);
        apply(state.toggles[key]);
    });
}
bindToggle('btnJoints', 'joints', function (on) { clickableMarkers.forEach(function (m) { m.visible = on; }); });
bindToggle('btnGizmo',  'gizmo',  function (on) { updateGizmoTransform(); });
bindToggle('btnGrid',   'grid',   function (on) { grid.visible = on; });

/* ==================== FORM EDITOR ==================== */

var formModal = document.getElementById('formModal');

async function openFormEditor() {
    if (!selectedJoint) { await showMessage('Сначала выберите часть тела.', 'Редактор формы'); return; }
    if (typeof ShapeEditor === 'undefined') { await showMessage('shapeEditor.js не загружен.', 'Ошибка'); return; }
    ShapeEditor.open(selectedJoint.userData.baseLabel);
}

function closeFormEditor() {
    if (typeof ShapeEditor !== 'undefined') ShapeEditor.close();
    else formModal.classList.add('hidden');
}

document.getElementById('btnForm').addEventListener('click', openFormEditor);
document.getElementById('formClose').addEventListener('click', closeFormEditor);
document.getElementById('formCancel').addEventListener('click', closeFormEditor);
formModal.addEventListener('click', function (e) { if (e.target === formModal) e.stopPropagation(); });
document.getElementById('formApply').addEventListener('click', function () {
    if (typeof ShapeEditor !== 'undefined') ShapeEditor.apply();
});
window.addEventListener('resize', function () {
    if (typeof ShapeEditor !== 'undefined' && !formModal.classList.contains('hidden')) ShapeEditor.resize();
});

/* ==================== PROFILE GEOMETRY ==================== */

function buildProfileGeometry(profile) {
    var RINGS = 32, SEGS = 24;
    var jointT = profile.jointT != null ? profile.jointT : 0.5;
    var scl = profile.scale != null ? profile.scale : 1.0;
    var height = profile.height;
    var vertices = [], uvs = [], indices = [];

    for (var i = 0; i <= RINGS; i++) {
        var t = i / RINGS;
        var fx = ShapeEditor.sampleView(profile.front, t);
        var fz = ShapeEditor.sampleView(profile.side, t);
        var y  = (t - jointT) * height * scl;
        for (var j = 0; j <= SEGS; j++) {
            var ang = j / SEGS * Math.PI * 2;
            var c = Math.cos(ang), s = Math.sin(ang);
            var rx = (c > 0 ? fx.rR : fx.rL) * scl;
            var rz = (s > 0 ? fz.rR : fz.rL) * scl;
            vertices.push(c * rx, y, s * rz);
            uvs.push(j / SEGS, t);
        }
    }
    for (var k = 0; k < RINGS; k++) {
        for (var m = 0; m < SEGS; m++) {
            var a = k * (SEGS + 1) + m, b = a + (SEGS + 1);
            indices.push(a, b, a + 1); indices.push(b, b + 1, a + 1);
        }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

function getPrimaryMesh(partName) {
    var j = jointByName[partName];
    if (!j || !j.userData.shapeGroup) return null;
    var sg = j.userData.shapeGroup;
    for (var i = 0; i < sg.children.length; i++) {
        if (sg.children[i].isMesh) return sg.children[i];
    }
    return null;
}

function rebuildMeshForPart(partName) {
    if (typeof ShapeEditor === 'undefined') return;
    var mesh = getPrimaryMesh(partName);
    if (!mesh) return;
    var prof = ShapeEditor.getProfile(partName);
    var oldGeo = mesh.geometry;
    mesh.geometry = buildProfileGeometry(prof);
    if (oldGeo) oldGeo.dispose();
}

if (typeof ShapeEditor !== 'undefined') {
    ShapeEditor.setApplyCallback(async function (partName, profile) {
        var mesh = getPrimaryMesh(partName);
        if (!mesh) {
            await showMessage('Редактирование формы для "' + partName + '" не поддерживается.', 'Форма');
            ShapeEditor.close();
            return;
        }
        var oldGeo = mesh.geometry;
        mesh.geometry = buildProfileGeometry(profile);
        if (oldGeo) oldGeo.dispose();
        ShapeEditor.close();
        updateHUD();
    });
}

/* ==================== RESIZE / INIT ==================== */

function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (w < 1 || h < 1) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

buildTree();
renderPresetMenu();
updateCamera();
resize();
setTimeout(resize, 60);

checkServer().then(function (ok) {
    console.log('[server] ' + (ok ? 'доступен' : 'недоступен'));
});

/* ==================== ANIMATE ==================== */

var frames = 0, lastTime = performance.now();
function animate(now) {
    requestAnimationFrame(animate);
    frames++;
    if (now - lastTime >= 500) {
        fpsEl.textContent = Math.round(frames * 1000 / (now - lastTime)) + ' FPS';
        frames = 0; lastTime = now;
    }
    updateGizmoTransform();
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);

})();
