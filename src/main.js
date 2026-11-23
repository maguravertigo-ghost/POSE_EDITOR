import './styles/main.css';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { CharacterRig } from './core/character.js';
import { BODY_PRESETS, DEFAULT_PROPORTIONS } from './core/rigSchema.js';
import { BUILTIN_POSES } from './core/posesLibrary.js';
import { SceneManager } from './viewport/sceneManager.js';
import { PropsManager } from './viewport/propsManager.js';
import { SkeletonEditor } from './editors/skeletonEditor.js';
import { ShapeEditorModal } from './editors/shapeEditor.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const fpsEl = document.getElementById('fps');

const sceneMgr = new SceneManager(canvas, stage);
const character = new CharacterRig(sceneMgr.scene);
const propsMgr = new PropsManager(sceneMgr.scene);
const skeletonEditor = new SkeletonEditor(sceneMgr.scene, character, () => syncSkeletonSliders());
const shapeEditor = new ShapeEditorModal(character, () => {});

const appState = {
    mode: 'pose', // 'pose' | 'skeleton' | 'shape'
    showJoints: true,
    showGizmo: true,
    showGrid: true,
    selectedJoint: null,
    selectedProp: null,
    gizmoMode: 'rotate',
    gizmoSpace: 'local',
    undoStack: [],
    activePresetId: 'neutral',
    serverAvailable: false
};

/* ==================== MODAL DIALOGS ==================== */

const msgModal = document.getElementById('msgModal');
const msgTitle = document.getElementById('msgTitle');
const msgText = document.getElementById('msgText');
const msgInput = document.getElementById('msgInput');
const msgOk = document.getElementById('msgOk');
const msgCancel = document.getElementById('msgCancel');

function showMessage(text, title = 'Сообщение') {
    return new Promise((resolve) => {
        msgTitle.textContent = title;
        msgText.textContent = text;
        msgInput.classList.add('hidden');
        msgCancel.classList.add('hidden');
        msgOk.textContent = 'OK';
        msgModal.classList.remove('hidden');
        msgOk.onclick = () => { msgModal.classList.add('hidden'); resolve(); };
    });
}

function showConfirm(text, title = 'Подтверждение') {
    return new Promise((resolve) => {
        msgTitle.textContent = title;
        msgText.textContent = text;
        msgInput.classList.add('hidden');
        msgCancel.classList.remove('hidden');
        msgOk.textContent = 'Да';
        msgModal.classList.remove('hidden');
        msgOk.onclick = () => { msgModal.classList.add('hidden'); resolve(true); };
        msgCancel.onclick = () => { msgModal.classList.add('hidden'); resolve(false); };
    });
}

function showPrompt(text, defaultValue = '', title = 'Ввод') {
    return new Promise((resolve) => {
        msgTitle.textContent = title;
        msgText.textContent = text;
        msgInput.value = defaultValue;
        msgInput.classList.remove('hidden');
        msgCancel.classList.remove('hidden');
        msgOk.textContent = 'OK';
        msgModal.classList.remove('hidden');
        setTimeout(() => { msgInput.focus(); msgInput.select(); }, 20);
        msgOk.onclick = () => { msgModal.classList.add('hidden'); resolve(msgInput.value); };
        msgCancel.onclick = () => { msgModal.classList.add('hidden'); resolve(null); };
    });
}

/* ==================== UNDO STACK ==================== */

function pushUndo() {
    appState.undoStack.push(JSON.stringify(character.getPoseData()));
    if (appState.undoStack.length > 40) appState.undoStack.shift();
}

function undoPose() {
    if (!appState.undoStack.length) return;
    const snap = JSON.parse(appState.undoStack.pop());
    character.applyPoseData(snap, true);
    updateHUD();
}

document.getElementById('btnUndo').addEventListener('click', undoPose);

/* ==================== SELECTION & TRANSFORM ==================== */

function updateGizmoAttachment() {
    if (appState.mode !== 'pose' || !appState.showGizmo) {
        sceneMgr.attachTransform(null);
        return;
    }
    if (appState.selectedProp) {
        sceneMgr.attachTransform(appState.selectedProp);
        sceneMgr.transform.setMode(appState.gizmoMode);
        sceneMgr.transform.setSpace(appState.gizmoSpace);
    } else if (appState.selectedJoint) {
        sceneMgr.attachTransform(appState.selectedJoint);
        const mode = (!appState.selectedJoint.userData.isRoot && appState.gizmoMode === 'translate')
            ? 'rotate' : appState.gizmoMode;
        sceneMgr.transform.setMode(mode);
        sceneMgr.transform.setSpace(appState.gizmoSpace);
    } else {
        sceneMgr.attachTransform(null);
    }
}

function selectJoint(joint) {
    if (appState.selectedJoint) {
        character.setJointSelectedStyle(appState.selectedJoint, false);
    }
    appState.selectedJoint = joint;
    appState.selectedProp = null;
    if (joint) {
        character.setJointSelectedStyle(joint, true);
        if (!joint.userData.isRoot && appState.gizmoMode === 'translate') {
            appState.gizmoMode = 'rotate';
        }
    }
    updateTreeSelection();
    renderPropsList();
    updateGizmoAttachment();
    updateHUD();
}

function selectProp(prop) {
    if (appState.selectedJoint) {
        character.setJointSelectedStyle(appState.selectedJoint, false);
        appState.selectedJoint = null;
    }
    appState.selectedProp = prop;
    updateTreeSelection();
    renderPropsList();
    updateGizmoAttachment();
    updateHUD();
}

sceneMgr.onTransformChange = () => {
    updateHUD();
};
sceneMgr.onTransformEnd = () => {
    // Undo snapshot captured on pointerdown before drag
};

/* ==================== RAYCAST PICKING ==================== */

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerDownPos = null;

canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || sceneMgr.isDraggingGizmo) return;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    if (appState.selectedJoint) pushUndo();
});

canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !pointerDownPos || sceneMgr.isDraggingGizmo) {
        pointerDownPos = null;
        return;
    }
    const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    pointerDownPos = null;
    if (moveDist > 5) return; // Was an orbit drag

    if (appState.mode !== 'pose') return;

    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    sceneMgr.scene.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, sceneMgr.camera);

    // 1. Try joint markers first (when visible)
    if (appState.showJoints) {
        const markerHits = raycaster.intersectObjects(character.markers.filter((m) => m.visible), false);
        if (markerHits.length) {
            selectJoint(markerHits[0].object.userData.joint);
            return;
        }
    }

    // 2. Try body meshes -> select owning joint
    const bodyHits = raycaster.intersectObjects(character.bodyMeshes, false);
    if (bodyHits.length && bodyHits[0].object.userData.joint) {
        selectJoint(bodyHits[0].object.userData.joint);
        return;
    }

    // 3. Try scene props
    const propHits = raycaster.intersectObjects(propsMgr.getPickableMeshes(), false);
    if (propHits.length && propHits[0].object.userData.propRoot) {
        selectProp(propHits[0].object.userData.propRoot);
        return;
    }

    selectJoint(null);
});

/* ==================== HIERARCHY TREE ==================== */

const treeContainer = document.getElementById('tree');

function buildTree() {
    treeContainer.innerHTML = '';
    const pelvis = character.jointByName['Таз'];
    if (pelvis) treeContainer.appendChild(renderTreeNode(pelvis, 0));
}

function renderTreeNode(joint, depth) {
    const node = document.createElement('div');
    node.className = 'tree-node';

    const childJoints = joint.children.filter((c) => c.isGroup && c.userData.baseLabel);
    const hasChildren = childJoints.length > 0;
    const isHand = joint.userData.baseLabel && joint.userData.baseLabel.startsWith('Кисть');

    const row = document.createElement('div');
    row.className = 'tree-row';

    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    if (hasChildren) {
        toggle.innerHTML = `<span class="material-icons sm">${isHand ? 'chevron_right' : 'expand_more'}</span>`;
    }
    row.appendChild(toggle);

    const label = document.createElement('span');
    label.textContent = joint.userData.baseLabel;
    row.appendChild(label);

    joint.userData.treeRowEl = row;
    node.appendChild(row);

    let childrenBox = null;
    if (hasChildren) {
        childrenBox = document.createElement('div');
        childrenBox.className = 'tree-children' + (isHand ? ' collapsed' : '');
        for (const c of childJoints) {
            childrenBox.appendChild(renderTreeNode(c, depth + 1));
        }
        node.appendChild(childrenBox);

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const collapsed = childrenBox.classList.toggle('collapsed');
            toggle.innerHTML = `<span class="material-icons sm">${collapsed ? 'chevron_right' : 'expand_more'}</span>`;
        });
    }

    row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (appState.mode !== 'pose') switchEditorMode('pose');
        selectJoint(joint);
    });

    return node;
}

function updateTreeSelection() {
    for (const j of character.joints) {
        if (j.userData.treeRowEl) {
            j.userData.treeRowEl.classList.toggle('selected', j === appState.selectedJoint);
        }
    }
}

/* ==================== HUD CONTROLS ==================== */

const hud = document.getElementById('hud');
const hudTitle = hud.querySelector('.hud-title');
const hudJointControls = document.getElementById('hudJointControls');
const hudPropControls = document.getElementById('hudPropControls');
const rotInputs = hud.querySelectorAll('[data-rot]');
const rotVals = hud.querySelectorAll('[data-rot-val]');
const gizmoRotateBtn = document.getElementById('gizmoRotateBtn');
const gizmoMoveBtn = document.getElementById('gizmoMoveBtn');
const gizmoSpaceBtn = document.getElementById('gizmoSpaceBtn');

function updateHUD() {
    if (appState.mode !== 'pose' || (!appState.selectedJoint && !appState.selectedProp)) {
        hud.classList.add('hidden');
        return;
    }
    hud.classList.remove('hidden');

    if (appState.selectedProp) {
        hudTitle.textContent = appState.selectedProp.userData.propLabel || 'Объект';
        hudJointControls.classList.add('hidden');
        hudPropControls.classList.remove('hidden');
        document.querySelectorAll('[data-prop-mode]').forEach((b) => {
            b.classList.toggle('active', b.dataset.propMode === appState.gizmoMode);
        });
        return;
    }

    const j = appState.selectedJoint;
    hudTitle.textContent = j.userData.baseLabel;
    hudJointControls.classList.remove('hidden');
    hudPropControls.classList.add('hidden');

    gizmoMoveBtn.style.display = j.userData.isRoot ? '' : 'none';
    gizmoRotateBtn.classList.toggle('active', appState.gizmoMode === 'rotate');
    gizmoMoveBtn.classList.toggle('active', appState.gizmoMode === 'translate');
    gizmoSpaceBtn.innerHTML = `<span class="material-icons sm">public</span> ${appState.gizmoSpace === 'local' ? 'Локально' : 'Мир'}`;

    const rv = [j.rotation.x, j.rotation.y, j.rotation.z];
    rotInputs.forEach((inp, i) => {
        inp.value = rv[i];
        rotVals[i].textContent = `${Math.round((rv[i] * 180) / Math.PI)}°`;
    });

    const hasCage = !j.userData.isFinger;
    document.getElementById('hudOpenShape').style.display = hasCage ? '' : 'none';

    const isHand = j.userData.baseLabel === 'Кисть L' || j.userData.baseLabel === 'Кисть R';
    document.getElementById('hudHandControls').classList.toggle('hidden', !isHand);
}

const handCurlSlider = document.getElementById('handCurlSlider');
const valHandCurl = document.getElementById('valHandCurl');
handCurlSlider.addEventListener('pointerdown', () => pushUndo());
handCurlSlider.addEventListener('input', () => {
    if (!appState.selectedJoint) return;
    const lbl = appState.selectedJoint.userData.baseLabel;
    if (lbl !== 'Кисть L' && lbl !== 'Кисть R') return;
    const side = lbl.endsWith('L') ? 'L' : 'R';
    const v = parseFloat(handCurlSlider.value);
    valHandCurl.textContent = `${Math.round(v * 100)}%`;
    character.setHandCurl(side, v);
});

document.querySelectorAll('[data-hand-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (!appState.selectedJoint) return;
        const lbl = appState.selectedJoint.userData.baseLabel;
        if (lbl !== 'Кисть L' && lbl !== 'Кисть R') return;
        pushUndo();
        const side = lbl.endsWith('L') ? 'L' : 'R';
        character.setHandPreset(side, btn.dataset.handPreset);
    });
});

rotInputs.forEach((inp, i) => {
    inp.addEventListener('pointerdown', () => pushUndo());
    inp.addEventListener('input', () => {
        if (!appState.selectedJoint) return;
        const axis = ['x', 'y', 'z'][i];
        appState.selectedJoint.rotation[axis] = parseFloat(inp.value);
        updateHUD();
    });
});

gizmoRotateBtn.addEventListener('click', () => {
    appState.gizmoMode = 'rotate';
    updateGizmoAttachment();
    updateHUD();
});
gizmoMoveBtn.addEventListener('click', () => {
    if (appState.selectedJoint && appState.selectedJoint.userData.isRoot) {
        appState.gizmoMode = 'translate';
        updateGizmoAttachment();
        updateHUD();
    }
});
gizmoSpaceBtn.addEventListener('click', () => {
    appState.gizmoSpace = appState.gizmoSpace === 'local' ? 'world' : 'local';
    updateGizmoAttachment();
    updateHUD();
});

document.getElementById('hudResetJoint').addEventListener('click', () => {
    if (appState.selectedJoint) {
        pushUndo();
        appState.selectedJoint.rotation.set(0, 0, 0);
        if (appState.selectedJoint.userData.isRoot) character.updateJointPositions(true);
        updateHUD();
    } else if (appState.selectedProp) {
        appState.selectedProp.rotation.set(0, 0, 0);
        appState.selectedProp.scale.set(1, 1, 1);
    }
});

document.getElementById('hudOpenShape').addEventListener('click', () => {
    if (appState.selectedJoint) {
        shapeEditor.open(appState.selectedJoint.userData.baseLabel);
    }
});

document.getElementById('btnMirrorPose').addEventListener('click', () => {
    pushUndo();
    character.mirrorPoseLeftToRight();
    updateHUD();
});

/* ==================== PROPS ==================== */

const propsListEl = document.getElementById('propsList');

function renderPropsList() {
    propsListEl.innerHTML = '';
    for (const p of propsMgr.props) {
        const row = document.createElement('div');
        row.className = 'prop-item' + (p === appState.selectedProp ? ' selected' : '');
        const span = document.createElement('span');
        span.textContent = p.userData.propLabel;
        const del = document.createElement('button');
        del.className = 'prop-del';
        del.innerHTML = '<span class="material-icons sm">close</span>';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            if (appState.selectedProp === p) selectProp(null);
            propsMgr.removeProp(p);
            renderPropsList();
        });
        row.append(span, del);
        row.addEventListener('click', () => {
            if (appState.mode !== 'pose') switchEditorMode('pose');
            appState.gizmoMode = 'translate';
            selectProp(p);
        });
        propsListEl.appendChild(row);
    }
}

document.querySelectorAll('[data-add-prop]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const p = propsMgr.addProp(btn.dataset.addProp);
        appState.gizmoMode = 'translate';
        selectProp(p);
        renderPropsList();
    });
});

document.querySelectorAll('[data-prop-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
        appState.gizmoMode = btn.dataset.propMode;
        updateGizmoAttachment();
        updateHUD();
    });
});

document.getElementById('hudDeleteProp').addEventListener('click', () => {
    if (!appState.selectedProp) return;
    const p = appState.selectedProp;
    selectProp(null);
    propsMgr.removeProp(p);
    renderPropsList();
});

/* ==================== SKELETON EDITOR UI ==================== */

const SKELETON_SLIDERS = [
    { key: 'heightScale', label: 'Общий масштаб роста', min: 0.75, max: 1.25, step: 0.01 },
    { key: 'headSize', label: 'Размер головы', min: 0.16, max: 0.28, step: 0.005 },
    { key: 'neckLen', label: 'Длина шеи', min: 0.05, max: 0.16, step: 0.005 },
    { key: 'chestHeight', label: 'Высота груди', min: 0.20, max: 0.40, step: 0.005 },
    { key: 'abdomenHeight', label: 'Живот (шарнир)', min: 0.08, max: 0.24, step: 0.005 },
    { key: 'pelvisHeight', label: 'Высота таза', min: 0.11, max: 0.22, step: 0.005 },
    { key: 'clavicleOffsetX', label: 'Отступ ключицы', min: 0.025, max: 0.12, step: 0.005 },
    { key: 'shoulderWidth', label: 'Ширина плеч', min: 0.14, max: 0.30, step: 0.005 },
    { key: 'hipWidth', label: 'Ширина бёдер', min: 0.06, max: 0.18, step: 0.005 },
    { key: 'upperArmLen', label: 'Плечо (верх руки)', min: 0.18, max: 0.38, step: 0.005 },
    { key: 'foreArmLen', label: 'Предплечье', min: 0.18, max: 0.36, step: 0.005 },
    { key: 'handLen', label: 'Длина кисти', min: 0.06, max: 0.14, step: 0.005 },
    { key: 'thighLen', label: 'Бедро (верх ноги)', min: 0.28, max: 0.56, step: 0.005 },
    { key: 'shinLen', label: 'Голень', min: 0.26, max: 0.54, step: 0.005 },
    { key: 'footLen', label: 'Длина стопы', min: 0.15, max: 0.30, step: 0.005 }
];

const skeletonSlidersEl = document.getElementById('skeletonSliders');
const skeletonSliderInputs = {};

function buildSkeletonSliders() {
    skeletonSlidersEl.innerHTML = '';
    for (const spec of SKELETON_SLIDERS) {
        const row = document.createElement('div');
        row.className = 'slider-row';
        const head = document.createElement('div');
        head.className = 'slider-head';
        const lbl = document.createElement('span');
        lbl.textContent = spec.label;
        const val = document.createElement('span');
        val.textContent = character.proportions[spec.key].toFixed(2);
        head.append(lbl, val);

        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = String(spec.min);
        inp.max = String(spec.max);
        inp.step = String(spec.step);
        inp.value = String(character.proportions[spec.key]);

        inp.addEventListener('input', () => {
            let v = parseFloat(inp.value);
            if (spec.key === 'clavicleOffsetX') {
                v = Math.min(v, character.proportions.shoulderWidth - 0.03);
            } else if (spec.key === 'shoulderWidth') {
                v = Math.max(v, character.proportions.clavicleOffsetX + 0.03);
            }
            character.proportions[spec.key] = v;
            val.textContent = v.toFixed(2);
            character.rebuildGeometryAndLayout(true);
            skeletonEditor.rebuild3DGuides();
            skeletonEditor.draw2DSchematic();
        });

        skeletonSliderInputs[spec.key] = { inp, val };
        row.append(head, inp);
        skeletonSlidersEl.appendChild(row);
    }
}

function syncSkeletonSliders() {
    for (const spec of SKELETON_SLIDERS) {
        const item = skeletonSliderInputs[spec.key];
        if (!item) continue;
        const v = character.proportions[spec.key];
        item.inp.value = String(v);
        item.val.textContent = v.toFixed(2);
    }
}

skeletonEditor.bind2DCanvas(
    document.getElementById('skeleton2DCanvas'),
    document.getElementById('skeletonStats')
);

document.getElementById('btnResetSkeleton').addEventListener('click', () => {
    skeletonEditor.resetProportions();
    syncSkeletonSliders();
});

/* ==================== SHAPE & PRESETS UI ==================== */

const shapePartsListEl = document.getElementById('shapePartsList');
const EDITABLE_PARTS = [
    'Голова', 'Шея', 'Грудь', 'Живот', 'Таз',
    'Ключица L', 'Плечо L', 'Локоть L', 'Кисть L',
    'Бедро L', 'Колено L', 'Стопа L', 'Носок L'
];

function buildShapePartsButtons() {
    shapePartsListEl.innerHTML = '';
    for (const part of EDITABLE_PARTS) {
        const btn = document.createElement('button');
        btn.className = 'mini-btn';
        btn.textContent = part.endsWith(' L') ? `${part.slice(0, -2)} (L↔R)` : part;
        btn.addEventListener('click', () => shapeEditor.open(part));
        shapePartsListEl.appendChild(btn);
    }
}

document.querySelectorAll('[data-body-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const id = btn.dataset.bodyPreset;
        appState.activePresetId = id;
        character.setBodyPreset(id);
        document.querySelectorAll('[data-body-preset]').forEach((b) => b.classList.toggle('active', b === btn));
        syncMorphSliders();
        syncSkeletonSliders();
        if (skeletonEditor.active) {
            skeletonEditor.rebuild3DGuides();
            skeletonEditor.draw2DSchematic();
        }
    });
});

document.querySelectorAll('[data-global-subdiv]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const level = parseInt(btn.dataset.globalSubdiv, 10) || 0;
        character.setSubdivLevel(level);
        document.querySelectorAll('[data-global-subdiv]').forEach((b) => b.classList.toggle('active', b === btn));
    });
});

const morphWeightEl = document.getElementById('morphWeight');
const morphMuscleEl = document.getElementById('morphMuscle');
const valWeightEl = document.getElementById('valWeight');
const valMuscleEl = document.getElementById('valMuscle');

function syncMorphSliders() {
    morphWeightEl.value = String(character.morph.weight || 0);
    morphMuscleEl.value = String(character.morph.muscle || 0);
    valWeightEl.textContent = (character.morph.weight || 0).toFixed(2);
    valMuscleEl.textContent = (character.morph.muscle || 0).toFixed(2);
}

morphWeightEl.addEventListener('input', () => {
    character.morph.weight = parseFloat(morphWeightEl.value);
    valWeightEl.textContent = character.morph.weight.toFixed(2);
    character.rebuildAllMeshes();
});
morphMuscleEl.addEventListener('input', () => {
    character.morph.muscle = parseFloat(morphMuscleEl.value);
    valMuscleEl.textContent = character.morph.muscle.toFixed(2);
    character.rebuildAllMeshes();
});

/* ==================== MODE & RENDER TABS ==================== */

function switchEditorMode(mode) {
    appState.mode = mode;
    document.querySelectorAll('.mode-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    document.querySelectorAll('.sidebar-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.paneSide !== mode));

    const isSkel = mode === 'skeleton';
    skeletonEditor.setActive(isSkel);
    if (isSkel) {
        syncSkeletonSliders();
        setTimeout(() => skeletonEditor.draw2DSchematic(), 20);
    }

    updateGizmoAttachment();
    updateHUD();
}

document.querySelectorAll('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchEditorMode(btn.dataset.mode));
});

const sketchPipEl = document.getElementById('sketchPip');
const pipViewportEl = document.getElementById('pipViewport');
const btnPip = document.getElementById('btnPip');
sceneMgr.pip.viewportEl = pipViewportEl;

function syncPipVisibility() {
    const show = sceneMgr.pip.enabled && sceneMgr.sketch.settings.mode === '3d';
    sketchPipEl.classList.toggle('hidden', !show);
    btnPip.classList.toggle('active', sceneMgr.pip.enabled);
}

btnPip.addEventListener('click', () => {
    sceneMgr.pip.enabled = !sceneMgr.pip.enabled;
    syncPipVisibility();
});
document.getElementById('pipClose').addEventListener('click', () => {
    sceneMgr.pip.enabled = false;
    syncPipVisibility();
});
document.getElementById('pipModeLine').addEventListener('click', () => {
    sceneMgr.pip.mode = 'sketch-line';
    document.getElementById('pipModeLine').classList.add('active');
    document.getElementById('pipModeTone').classList.remove('active');
});
document.getElementById('pipModeTone').addEventListener('click', () => {
    sceneMgr.pip.mode = 'sketch-tone';
    document.getElementById('pipModeTone').classList.add('active');
    document.getElementById('pipModeLine').classList.remove('active');
});
document.getElementById('pipExpand').addEventListener('click', () => {
    const targetMode = sceneMgr.pip.mode;
    sceneMgr.sketch.settings.mode = targetMode;
    document.querySelectorAll('.render-tab').forEach((b) => b.classList.toggle('active', b.dataset.render === targetMode));
    syncPipVisibility();
});

document.querySelectorAll('.render-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        sceneMgr.sketch.settings.mode = btn.dataset.render;
        document.querySelectorAll('.render-tab').forEach((b) => b.classList.toggle('active', b === btn));
        syncPipVisibility();
    });
});

/* ==================== SCENE CARD (CAMERA, LIGHT, SKETCH) ==================== */

document.querySelectorAll('.sc-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        const key = btn.dataset.sc;
        document.querySelectorAll('.sc-tab').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.sc-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.scPanel !== key));
    });
});

document.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.addEventListener('click', () => sceneMgr.setCameraPreset(btn.dataset.cam));
});

document.getElementById('camFocal').addEventListener('input', (e) => {
    const mm = parseInt(e.target.value, 10);
    document.getElementById('valFocal').textContent = `${mm} mm`;
    sceneMgr.setFocalLength(mm);
});

document.getElementById('lightAz').addEventListener('input', (e) => {
    sceneMgr.lightParams.az = parseFloat(e.target.value);
    document.getElementById('valLightAz').textContent = `${sceneMgr.lightParams.az}°`;
    sceneMgr.updateLights();
});
document.getElementById('lightEl').addEventListener('input', (e) => {
    sceneMgr.lightParams.el = parseFloat(e.target.value);
    document.getElementById('valLightEl').textContent = `${sceneMgr.lightParams.el}°`;
    sceneMgr.updateLights();
});
document.getElementById('lightInt').addEventListener('input', (e) => {
    sceneMgr.lightParams.intensity = parseFloat(e.target.value);
    document.getElementById('valLightInt').textContent = sceneMgr.lightParams.intensity.toFixed(2);
    sceneMgr.updateLights();
});

document.getElementById('sketchLineW').addEventListener('input', (e) => {
    sceneMgr.sketch.settings.lineWidth = parseFloat(e.target.value);
    document.getElementById('valLineW').textContent = sceneMgr.sketch.settings.lineWidth.toFixed(2);
});
document.getElementById('sketchThresh').addEventListener('input', (e) => {
    sceneMgr.sketch.settings.threshold = parseFloat(e.target.value);
    document.getElementById('valThresh').textContent = sceneMgr.sketch.settings.threshold.toFixed(2);
});
document.getElementById('sketchTone').addEventListener('input', (e) => {
    sceneMgr.sketch.settings.toneStrength = parseFloat(e.target.value);
    document.getElementById('valTone').textContent = sceneMgr.sketch.settings.toneStrength.toFixed(2);
});
document.getElementById('sketchHideHelpers').addEventListener('change', (e) => {
    sceneMgr.sketch.settings.hideHelpersInSketch = e.target.checked;
});
document.getElementById('sketchGuides').addEventListener('change', (e) => {
    character.setConstructionGuidesVisible(e.target.checked);
});
document.getElementById('sketchInk').addEventListener('change', (e) => {
    sceneMgr.sketch.settings.ink = e.target.value;
});
document.getElementById('sketchPaper').addEventListener('change', (e) => {
    sceneMgr.sketch.settings.paper = e.target.value;
});

/* ==================== HEADER TOGGLES & EXPORTS ==================== */

function bindToggle(id, key, apply) {
    const btn = document.getElementById(id);
    btn.addEventListener('click', () => {
        appState[key] = !appState[key];
        btn.classList.toggle('active', appState[key]);
        apply(appState[key]);
    });
}
bindToggle('btnJoints', 'showJoints', (on) => character.setMarkersVisible(on));
bindToggle('btnGizmo', 'showGizmo', () => updateGizmoAttachment());
bindToggle('btnGrid', 'showGrid', (on) => { sceneMgr.grid.visible = on; });

function exportPNGFrame() {
    const prevMode = sceneMgr.sketch.settings.mode;
    const exportMode = prevMode === '3d' ? 'sketch-tone' : prevMode;
    sceneMgr.sketch.settings.mode = exportMode;
    const dataUrl = sceneMgr.exportFramePNG(
        character.markers,
        character.guideLines,
        character.showConstructionGuides,
        1600,
        1200
    );
    sceneMgr.sketch.settings.mode = prevMode;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `pose_sketch_${Date.now()}.png`;
    a.click();
}

document.getElementById('btnExportPng').addEventListener('click', exportPNGFrame);

function exportGLB() {
    const exporter = new GLTFExporter();
    const prevMarkers = appState.showJoints;
    character.setMarkersVisible(false);
    skeletonEditor.guidesGroup.visible = false;

    exporter.parse(
        character.root,
        (result) => {
            character.setMarkersVisible(prevMarkers);
            skeletonEditor.guidesGroup.visible = skeletonEditor.active;
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `character_${Date.now()}.glb`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        async (err) => {
            character.setMarkersVisible(prevMarkers);
            skeletonEditor.guidesGroup.visible = skeletonEditor.active;
            await showMessage(`Ошибка экспорта GLB: ${err.message || err}`, 'Ошибка');
        },
        { binary: true }
    );
}

/* ==================== SERVER API & LIBRARY BROWSER ==================== */

async function checkServer() {
    try {
        const r = await fetch('/api/ping');
        if (!r.ok) return false;
        const j = await r.json();
        appState.serverAvailable = !!(j && j.ok);
        return appState.serverAvailable;
    } catch {
        appState.serverAvailable = false;
        return false;
    }
}

async function apiGet(url) {
    try { return await (await fetch(url)).json(); }
    catch (e) { return { ok: false, error: String(e) }; }
}
async function apiPost(url, body) {
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await r.json();
    } catch (e) { return { ok: false, error: String(e) }; }
}
async function apiDelete(url) {
    try { return await (await fetch(url, { method: 'DELETE' })).json(); }
    catch (e) { return { ok: false, error: String(e) }; }
}

function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

const browserModal = document.getElementById('browserModal');
const browserTitle = document.getElementById('browserTitle');
const browserList = document.getElementById('browserList');
const browserHint = document.getElementById('browserHint');

document.getElementById('browserClose').addEventListener('click', () => browserModal.classList.add('hidden'));
document.getElementById('browserCancel').addEventListener('click', () => browserModal.classList.add('hidden'));

async function openBrowser(type) {
    const titles = { models: 'Сохранённые персонажи', poses: 'Библиотека поз', presets: 'Пресеты поз' };
    const hints = {
        models: 'Папка: library/models/',
        poses: 'Файл: library/poses.json',
        presets: 'Папка: pose_presets/'
    };
    browserTitle.textContent = titles[type] || 'Библиотека';
    browserHint.textContent = hints[type] || '';
    browserList.innerHTML = '<div class="browser-empty">Загрузка…</div>';
    browserModal.classList.remove('hidden');

    const res = await apiGet(`/api/${type}/list`);
    const items = (res && res.ok) ? res.list : [];
    if (!items.length) {
        browserList.innerHTML = '<div class="browser-empty">Пока пусто.</div>';
        return;
    }

    browserList.innerHTML = '';
    for (const it of items) {
        const row = document.createElement('div');
        row.className = 'browser-item';
        const name = document.createElement('div');
        name.className = 'b-name';
        name.textContent = it.name;
        const meta = document.createElement('div');
        meta.className = 'b-meta';
        meta.textContent = it.savedAt ? new Date(it.savedAt).toLocaleString() : (it.mtime ? new Date(it.mtime).toLocaleString() : '');
        const del = document.createElement('button');
        del.className = 'b-del';
        del.innerHTML = '<span class="material-icons sm">delete</span>';

        row.append(name, meta, del);
        row.addEventListener('click', async (e) => {
            if (e.target === del) return;
            const r = await apiGet(`/api/${type}/load/${encodeURIComponent(it.name)}`);
            if (!r || !r.ok || !r.data) {
                await showMessage(`Не удалось загрузить ${it.name}`, 'Ошибка');
                return;
            }
            if (type === 'models') {
                character.importCharacterJSON(r.data);
                if (r.data.props) propsMgr.deserialize(r.data.props);
                syncSkeletonSliders();
                syncMorphSliders();
                renderPropsList();
            } else {
                pushUndo();
                character.applyPoseData(r.data.joints || r.data.data || r.data, true);
            }
            updateHUD();
            browserModal.classList.add('hidden');
        });

        del.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!await showConfirm(`Удалить "${it.name}"?`, 'Удаление')) return;
            const dr = await apiDelete(`/api/${type}/delete/${encodeURIComponent(it.name)}`);
            if (dr && dr.ok) openBrowser(type);
        });

        browserList.appendChild(row);
    }
}

/* ==================== MENUS & FILE ACTIONS ==================== */

function closeAllMenus() {
    document.querySelectorAll('.menu').forEach((m) => m.classList.remove('open'));
}
document.querySelectorAll('.menu .menu-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.menu');
        const wasOpen = menu.classList.contains('open');
        closeAllMenus();
        if (!wasOpen) menu.classList.add('open');
    });
});
document.addEventListener('click', closeAllMenus);

document.querySelectorAll('#menuFile .menu-list button').forEach((btn) => {
    btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        closeAllMenus();
        switch (action) {
            case 'new':
                pushUndo();
                character.proportions = { ...DEFAULT_PROPORTIONS };
                character.setBodyPreset('neutral');
                character.applyPoseData({}, true);
                propsMgr.clearAll();
                renderPropsList();
                syncSkeletonSliders();
                syncMorphSliders();
                selectJoint(null);
                break;
            case 'open-pose':
                if (await checkServer()) openBrowser('poses');
                else document.getElementById('filePose').click();
                break;
            case 'save-pose': {
                const name = await showPrompt('Имя позы:', `pose_${Date.now()}`, 'Сохранить позу');
                if (!name) return;
                const payload = { version: 5, type: 'pose', name, savedAt: new Date().toISOString(), joints: character.getPoseData() };
                if (await checkServer()) {
                    const res = await apiPost(`/api/poses/save/${encodeURIComponent(name)}`, payload);
                    await showMessage(res && res.ok ? `Поза сохранена: ${name}` : `Ошибка: ${res.error}`, 'Поза');
                } else {
                    downloadJSON(payload, `${name}.json`);
                }
                break;
            }
            case 'open-model':
                if (await checkServer()) openBrowser('models');
                else document.getElementById('fileModel').click();
                break;
            case 'save-model': {
                const name = await showPrompt('Имя модели персонажа:', `character_${Date.now()}`, 'Сохранить модель');
                if (!name) return;
                const payload = character.exportCharacterJSON(name);
                payload.props = propsMgr.serialize();
                if (await checkServer()) {
                    const res = await apiPost(`/api/models/save/${encodeURIComponent(name)}`, payload);
                    await showMessage(res && res.ok ? `Модель сохранена: ${name}` : `Ошибка: ${res.error}`, 'Модель');
                } else {
                    downloadJSON(payload, `${name}.json`);
                }
                break;
            }
            case 'export-png':
                exportPNGFrame();
                break;
            case 'export-glb':
                exportGLB();
                break;
            case 'bg':
                document.getElementById('fileBg').click();
                break;
            case 'bg-clear':
                sceneMgr.clearBackground();
                break;
        }
    });
});

document.getElementById('filePose').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            pushUndo();
            character.applyPoseData(data.joints || data.pose || data, true);
            updateHUD();
        } catch (err) {
            showMessage(`Ошибка JSON: ${err.message}`);
        }
    };
    reader.readAsText(f);
});

document.getElementById('fileModel').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            character.importCharacterJSON(data);
            if (data.props) propsMgr.deserialize(data.props);
            syncSkeletonSliders();
            syncMorphSliders();
            renderPropsList();
            updateHUD();
        } catch (err) {
            showMessage(`Ошибка модели: ${err.message}`);
        }
    };
    reader.readAsText(f);
});

document.getElementById('fileBg').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) sceneMgr.setBackgroundFile(f);
    e.target.value = '';
});

function renderPoseMenu() {
    const list = document.getElementById('presetList');
    list.innerHTML = '';
    for (const p of BUILTIN_POSES) {
        const btn = document.createElement('button');
        btn.textContent = p.name;
        btn.addEventListener('click', () => {
            pushUndo();
            character.applyPoseData(p.data, true);
            updateHUD();
            closeAllMenus();
        });
        list.appendChild(btn);
    }
    list.appendChild(document.createElement('hr'));
    const serverBtn = document.createElement('button');
    serverBtn.innerHTML = '<span class="material-icons sm">cloud_download</span> Из библиотеки сервера…';
    serverBtn.addEventListener('click', async () => {
        closeAllMenus();
        if (await checkServer()) openBrowser('poses');
        else showMessage('Локальный сервер не отвечает.');
    });
    list.appendChild(serverBtn);
}

/* ==================== KEYBOARD SHORTCUTS ==================== */

window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (shapeEditor.isOpen()) return;

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        undoPose();
        return;
    }
    if (e.code === 'KeyW') {
        if (appState.selectedProp || (appState.selectedJoint && appState.selectedJoint.userData.isRoot)) {
            appState.gizmoMode = 'translate';
            updateGizmoAttachment();
            updateHUD();
        }
    } else if (e.code === 'KeyE') {
        appState.gizmoMode = 'rotate';
        updateGizmoAttachment();
        updateHUD();
    } else if (e.code === 'KeyR' && appState.selectedProp) {
        appState.gizmoMode = 'scale';
        updateGizmoAttachment();
        updateHUD();
    } else if ((e.code === 'Delete' || e.code === 'Backspace') && appState.selectedProp) {
        const p = appState.selectedProp;
        selectProp(null);
        propsMgr.removeProp(p);
        renderPropsList();
    }
});

/* ==================== INIT & RENDER LOOP ==================== */

buildTree();
renderPoseMenu();
buildSkeletonSliders();
buildShapePartsButtons();
syncMorphSliders();
sceneMgr.resize();
checkServer();

if (window.ResizeObserver) {
    new ResizeObserver(() => sceneMgr.resize()).observe(stage);
}
window.addEventListener('resize', () => sceneMgr.resize());

let frames = 0;
let lastFps = performance.now();
function animate(now) {
    requestAnimationFrame(animate);
    frames++;
    if (now - lastFps >= 500) {
        fpsEl.textContent = `${Math.round((frames * 1000) / (now - lastFps))} FPS`;
        frames = 0;
        lastFps = now;
    }
    sceneMgr.render(
        [...character.markers, skeletonEditor.guidesGroup],
        character.guideLines,
        character.showConstructionGuides
    );
}
requestAnimationFrame(animate);
