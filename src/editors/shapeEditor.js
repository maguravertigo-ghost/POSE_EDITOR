import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    buildBufferGeometryFromQuadMesh,
    cloneEditableMesh,
    createBoxGridMesh,
    createQuadCylinderMesh,
    createQuadSphereMesh
} from '../core/subdivMesh.js';
import { applyAnatomicalMorph, createAnatomicalMeshes } from '../core/anatomicalMeshes.js';

export class ShapeEditorModal {
    constructor(character, onApplied) {
        this.character = character;
        this.onApplied = onApplied;

        this.modal = document.getElementById('shapeModal');
        this.partTitleEl = document.getElementById('shapePartName');
        this.subdivEl = document.getElementById('shapeSubdiv');
        this.primitiveEl = document.getElementById('shapePrimitiveType');
        this.symXEl = document.getElementById('shapeSymX');
        this.symZEl = document.getElementById('shapeSymZ');
        this.snapGridEl = document.getElementById('shapeSnapGrid');
        this.softFalloffEl = document.getElementById('shapeSoftFalloff');
        this.scaleEl = document.getElementById('shapeScale');
        this.scaleValEl = document.getElementById('shapeScaleVal');

        this.views = {
            paneA: { canvas: document.getElementById('shapeCanvasA'), mode: 'front' },
            paneB: { canvas: document.getElementById('shapeCanvasB'), mode: 'left' },
            paneC: { canvas: document.getElementById('shapeCanvasC'), mode: 'top' }
        };
        this.canvas3D = document.getElementById('shapeCanvas3D');

        this.activePart = null;
        this.canonicalKey = null;
        this.workingMesh = null;
        this.selectedVerts = new Set();
        this.dragState = null;
        this.boxSelect = null;
        this.hoverVert = null;
        this.partScale = 1.0;

        this._init3DPreview();
        this._bindEvents();
    }

    _init3DPreview() {
        this.renderer3D = new THREE.WebGLRenderer({ canvas: this.canvas3D, antialias: true });
        this.renderer3D.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.scene3D = new THREE.Scene();
        this.scene3D.background = new THREE.Color(0x0d1017);
        this.cam3D = new THREE.PerspectiveCamera(40, 1, 0.02, 20);
        this.cam3D.position.set(0.45, 0.25, 0.55);

        this.orbit3D = new OrbitControls(this.cam3D, this.canvas3D);
        this.orbit3D.enableDamping = true;
        this.orbit3D.dampingFactor = 0.1;

        this.scene3D.add(new THREE.AmbientLight(0xffffff, 0.65));
        const dl1 = new THREE.DirectionalLight(0xffffff, 1.05);
        dl1.position.set(1.5, 2.5, 2.0);
        this.scene3D.add(dl1);
        const dl2 = new THREE.DirectionalLight(0x88b0ff, 0.45);
        dl2.position.set(-2, -1, -1.5);
        this.scene3D.add(dl2);

        this.mesh3D = new THREE.Mesh(
            new THREE.BufferGeometry(),
            new THREE.MeshStandardMaterial({ color: 0xd0d8e8, roughness: 0.60, metalness: 0.04 })
        );
        this.cageLines3D = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.65 })
        );
        this.vertPoints3D = new THREE.Points(
            new THREE.BufferGeometry(),
            new THREE.PointsMaterial({ size: 0.012, vertexColors: true })
        );
        this.scene3D.add(this.mesh3D, this.cageLines3D, this.vertPoints3D);
        this.scene3D.add(new THREE.AxesHelper(0.16));

        this._animId = null;
    }

    _bindEvents() {
        document.getElementById('shapeClose').addEventListener('click', () => this.close());
        document.getElementById('shapeCancel').addEventListener('click', () => this.close());
        document.getElementById('shapeApply').addEventListener('click', () => this.apply());
        document.getElementById('shapeResetPart').addEventListener('click', () => this.resetCurrentPart());
        document.getElementById('shapeClearSel').addEventListener('click', () => {
            this.selectedVerts.clear();
            this.draw2DViews();
            this.update3DPreview();
        });
        document.getElementById('shapeApplyPrimitive').addEventListener('click', () => this._replaceWithPrimitive());

        document.querySelectorAll('[data-pane-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const pane = btn.dataset.pane;
                this.views[pane].mode = btn.dataset.paneMode;
                document.querySelectorAll(`[data-pane="${pane}"]`).forEach((b) => {
                    b.classList.toggle('active', b === btn);
                });
                this.draw2DViews();
            });
        });

        this.subdivEl.addEventListener('change', () => {
            if (!this.workingMesh) return;
            this.workingMesh.subdiv = parseInt(this.subdivEl.value, 10) || 0;
            this.update3DPreview();
        });

        this.scaleEl.addEventListener('input', () => {
            const newScale = parseFloat(this.scaleEl.value);
            const factor = newScale / (this.partScale || 1);
            this.partScale = newScale;
            this.scaleValEl.textContent = newScale.toFixed(2);
            if (this.workingMesh && Math.abs(factor - 1) > 1e-4) {
                const targets = this.selectedVerts.size > 0
                    ? Array.from(this.selectedVerts)
                    : this.workingMesh.verts.map((_, i) => i);
                // Scale around centroid of target verts (or 0,0,0 if full part)
                let cx = 0, cy = 0, cz = 0;
                if (this.selectedVerts.size > 0) {
                    for (const idx of targets) {
                        cx += this.workingMesh.verts[idx][0];
                        cy += this.workingMesh.verts[idx][1];
                        cz += this.workingMesh.verts[idx][2];
                    }
                    cx /= targets.length; cy /= targets.length; cz /= targets.length;
                }
                for (const idx of targets) {
                    const v = this.workingMesh.verts[idx];
                    v[0] = cx + (v[0] - cx) * factor;
                    v[1] = cy + (v[1] - cy) * factor;
                    v[2] = cz + (v[2] - cz) * factor;
                }
                this.draw2DViews();
                this.update3DPreview();
            }
        });

        for (const paneKey of Object.keys(this.views)) {
            const cvs = this.views[paneKey].canvas;
            cvs.addEventListener('mousedown', (e) => this._onDown(paneKey, e));
            cvs.addEventListener('contextmenu', (e) => e.preventDefault());
        }
        window.addEventListener('mousemove', (e) => this._onMove(e));
        window.addEventListener('mouseup', (e) => this._onUp(e));
        window.addEventListener('resize', () => {
            if (this.isOpen()) this.resize();
        });
    }

    isOpen() {
        return !this.modal.classList.contains('hidden');
    }

    open(partName) {
        let key = partName;
        if (key.endsWith(' R')) key = key.slice(0, -2) + ' L';
        if (!this.character.cages[key]) return false;

        this.activePart = partName;
        this.canonicalKey = key;
        this.workingMesh = cloneEditableMesh(this.character.cages[key]);
        this.workingMesh.subdiv = this.character.globalSubdiv;
        this.selectedVerts.clear();
        this.partScale = 1.0;
        this.scaleEl.value = '1';
        this.scaleValEl.textContent = '1.00';
        this.subdivEl.value = String(this.workingMesh.subdiv);

        const isPaired = key.endsWith(' L');
        this.partTitleEl.textContent = isPaired ? `${key.slice(0, -2)} (зеркально L ↔ R)` : key;
        this.symXEl.checked = !isPaired;
        this.symZEl.checked = false;

        this.modal.classList.remove('hidden');
        this.resize();
        this._frameCamera3D();
        this._startLoop3D();
        return true;
    }

    close() {
        this.modal.classList.add('hidden');
        this.dragState = null;
        this.boxSelect = null;
        if (this._animId) {
            cancelAnimationFrame(this._animId);
            this._animId = null;
        }
    }

    resetCurrentPart() {
        if (!this.canonicalKey) return;
        const defaults = createAnatomicalMeshes();
        if (defaults[this.canonicalKey]) {
            this.workingMesh = cloneEditableMesh(defaults[this.canonicalKey]);
            this.workingMesh.subdiv = parseInt(this.subdivEl.value, 10) || 2;
            this.selectedVerts.clear();
            this.partScale = 1.0;
            this.scaleEl.value = '1';
            this.scaleValEl.textContent = '1.00';
            this.draw2DViews();
            this.update3DPreview();
        }
    }

    _replaceWithPrimitive() {
        if (!this.workingMesh) return;
        const prim = this.primitiveEl.value;
        const boneLen = this.character.getBoneLengthForPart(this.canonicalKey) || 0.25;
        const axis = this.workingMesh.axis || 'y';

        let created = null;
        if (prim === 'box') {
            if (axis === 'x') created = createBoxGridMesh(boneLen, 0.10, 0.10, 3, 2, 2, [boneLen * 0.5, 0, 0]);
            else if (axis === 'z') created = createBoxGridMesh(0.10, 0.08, boneLen, 2, 2, 3, [0, -0.04, boneLen * 0.4]);
            else if (this.canonicalKey === 'Голова' || this.canonicalKey === 'Грудь' || this.canonicalKey === 'Живот' || this.canonicalKey === 'Таз' || this.canonicalKey === 'Шея') {
                const cy = this.canonicalKey === 'Таз' ? 0 : boneLen * 0.5;
                created = createBoxGridMesh(0.16, boneLen, 0.14, 2, 3, 2, [0, cy, 0]);
            } else {
                created = createBoxGridMesh(0.10, boneLen, 0.10, 2, 4, 2, [0, -boneLen * 0.5, 0]);
            }
        } else if (prim === 'cylinder') {
            if (axis === 'y') {
                const isUp = ['Голова', 'Грудь', 'Живот', 'Таз', 'Шея'].includes(this.canonicalKey);
                created = createQuadCylinderMesh(0.06, 0.055, isUp ? 0 : 0, isUp ? boneLen : -boneLen, 8, 4);
            } else {
                created = createQuadCylinderMesh(0.055, 0.055, 0, -boneLen, 8, 4);
            }
        } else {
            const cy = ['Голова', 'Грудь', 'Живот', 'Шея'].includes(this.canonicalKey) ? boneLen * 0.5 : (this.canonicalKey === 'Таз' ? 0 : -boneLen * 0.5);
            created = createQuadSphereMesh(0.08, boneLen * 0.5, 0.08, 2, [0, cy, 0]);
        }

        created.axis = axis;
        created.refLength = boneLen;
        created.subdiv = parseInt(this.subdivEl.value, 10) || 2;
        this.workingMesh = created;
        this.selectedVerts.clear();
        this.draw2DViews();
        this.update3DPreview();
    }

    apply() {
        if (!this.canonicalKey || !this.workingMesh) return;
        this.character.cages[this.canonicalKey] = cloneEditableMesh(this.workingMesh);
        this.character.globalSubdiv = parseInt(this.subdivEl.value, 10) || 0;
        this.character.rebuildPartMesh(this.canonicalKey);
        if (this.canonicalKey.endsWith(' L')) {
            this.character.rebuildPartMesh(this.canonicalKey.slice(0, -2) + ' R');
        }
        this.close();
        if (this.onApplied) this.onApplied(this.canonicalKey);
    }

    _getViewAxes(mode) {
        switch (mode) {
            case 'front':  return { hi: 0, hs:  1, vi: 1, vs:  1, lh: '+X', lv: '+Y' };
            case 'back':   return { hi: 0, hs: -1, vi: 1, vs:  1, lh: '-X', lv: '+Y' };
            case 'left':   return { hi: 2, hs:  1, vi: 1, vs:  1, lh: '+Z', lv: '+Y' };
            case 'right':  return { hi: 2, hs: -1, vi: 1, vs:  1, lh: '-Z', lv: '+Y' };
            case 'top':    return { hi: 0, hs:  1, vi: 2, vs: -1, lh: '+X', lv: '-Z' };
            case 'bottom': return { hi: 0, hs:  1, vi: 2, vs:  1, lh: '+X', lv: '+Z' };
            default:       return { hi: 0, hs:  1, vi: 1, vs:  1, lh: '+X', lv: '+Y' };
        }
    }

    _computeViewport(canvas, mode) {
        const rect = canvas.parentElement.getBoundingClientRect();
        const W = Math.max(10, rect.width);
        const H = Math.max(10, rect.height);
        const ax = this._getViewAxes(mode);

        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (const pt of this.workingMesh.verts) {
            const u = pt[ax.hi] * ax.hs;
            const v = pt[ax.vi] * ax.vs;
            if (u < minU) minU = u;
            if (u > maxU) maxU = u;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }
        const spanU = Math.max(0.14, maxU - minU);
        const spanV = Math.max(0.14, maxV - minV);
        const midU = (minU + maxU) / 2;
        const midV = (minV + maxV) / 2;
        const pad = 34;
        const scale = Math.min((W - pad * 2) / spanU, (H - pad * 2) / spanV) * 0.85;

        return {
            W, H, ax, midU, midV, scale,
            toScreen: (pt) => ({
                x: W / 2 + (pt[ax.hi] * ax.hs - midU) * scale,
                y: H / 2 - (pt[ax.vi] * ax.vs - midV) * scale
            })
        };
    }

    _setupCanvasHiDPI(canvas) {
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w: rect.width, h: rect.height };
    }

    draw2DViews() {
        if (!this.workingMesh) return;
        const { verts, quads } = this.workingMesh;

        for (const paneKey of Object.keys(this.views)) {
            const view = this.views[paneKey];
            const { ctx, w, h } = this._setupCanvasHiDPI(view.canvas);
            const vp = this._computeViewport(view.canvas, view.mode);

            ctx.fillStyle = '#0d1017';
            ctx.fillRect(0, 0, w, h);

            // Grid
            ctx.strokeStyle = 'rgba(74, 158, 255, 0.08)';
            ctx.lineWidth = 1;
            for (let gx = 0; gx < w; gx += 22) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
            for (let gy = 0; gy < h; gy += 22) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

            // Joint origin axes
            const orig = vp.toScreen([0, 0, 0]);
            ctx.strokeStyle = 'rgba(255, 200, 60, 0.38)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(orig.x, 0); ctx.lineTo(orig.x, h);
            ctx.moveTo(0, orig.y); ctx.lineTo(w, orig.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(orig.x, orig.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffcc44';
            ctx.fill();

            // Draw quad mesh edges
            ctx.strokeStyle = 'rgba(110, 168, 255, 0.45)';
            ctx.lineWidth = 1.1;
            const drawnEdges = new Set();
            for (const q of quads) {
                for (let k = 0; k < 4; k++) {
                    const a = q[k], b = q[(k + 1) % 4];
                    const ek = a < b ? `${a}_${b}` : `${b}_${a}`;
                    if (drawnEdges.has(ek)) continue;
                    drawnEdges.add(ek);
                    const pA = vp.toScreen(verts[a]);
                    const pB = vp.toScreen(verts[b]);
                    ctx.beginPath();
                    ctx.moveTo(pA.x, pA.y);
                    ctx.lineTo(pB.x, pB.y);
                    ctx.stroke();
                }
            }

            // Draw vertices
            for (let i = 0; i < verts.length; i++) {
                const p = vp.toScreen(verts[i]);
                const isSel = this.selectedVerts.has(i);
                const isHov = this.hoverVert && this.hoverVert.pane === paneKey && this.hoverVert.idx === i;

                ctx.beginPath();
                ctx.arc(p.x, p.y, isSel ? 5.2 : (isHov ? 5.0 : 3.6), 0, Math.PI * 2);
                ctx.fillStyle = isSel ? '#ff8833' : (isHov ? '#ffdd55' : '#4a9eff');
                ctx.fill();
                ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.65)';
                ctx.lineWidth = isSel ? 1.5 : 1.0;
                ctx.stroke();
            }

            // Box selection marquee
            if (this.boxSelect && this.boxSelect.pane === paneKey) {
                const bs = this.boxSelect;
                const rx = Math.min(bs.x0, bs.x1);
                const ry = Math.min(bs.y0, bs.y1);
                const rw = Math.abs(bs.x1 - bs.x0);
                const rh = Math.abs(bs.y1 - bs.y0);
                ctx.fillStyle = 'rgba(74, 158, 255, 0.16)';
                ctx.fillRect(rx, ry, rw, rh);
                ctx.strokeStyle = '#6ea8ff';
                ctx.setLineDash([4, 3]);
                ctx.strokeRect(rx, ry, rw, rh);
                ctx.setLineDash([]);
            }

            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = '10px ui-monospace, monospace';
            ctx.fillText(`${vp.ax.lh} →   ↑ ${vp.ax.lv}`, 10, h - 8);
        }
    }

    _findSymPartner(idx, mirrorX, mirrorZ, sourceVerts) {
        const v = sourceVerts[idx];
        const tx = mirrorX ? -v[0] : v[0];
        const ty = v[1];
        const tz = mirrorZ ? -v[2] : v[2];
        let best = -1;
        let bestD = 0.015;
        for (let i = 0; i < sourceVerts.length; i++) {
            if (i === idx) continue;
            const d = Math.hypot(sourceVerts[i][0] - tx, sourceVerts[i][1] - ty, sourceVerts[i][2] - tz);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        return best;
    }

    _onDown(paneKey, e) {
        if (e.button !== 0 || !this.workingMesh) return;
        const view = this.views[paneKey];
        const rect = view.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const vp = this._computeViewport(view.canvas, view.mode);

        // Pick closest vertex (note: multiple overlapping vertices in ortho view can share screen pos — pick all overlapping if Shift or drag selected)
        let hitIdx = -1;
        let hitDist = 10;
        for (let i = 0; i < this.workingMesh.verts.length; i++) {
            const p = vp.toScreen(this.workingMesh.verts[i]);
            const d = Math.hypot(mx - p.x, my - p.y);
            if (d < hitDist) {
                hitDist = d;
                hitIdx = i;
            }
        }

        if (hitIdx !== -1) {
            if (e.shiftKey) {
                if (this.selectedVerts.has(hitIdx)) this.selectedVerts.delete(hitIdx);
                else this.selectedVerts.add(hitIdx);
            } else if (!this.selectedVerts.has(hitIdx)) {
                this.selectedVerts.clear();
                // Select all vertices overlapping right at this screen point (front+back in orthographic view!)
                const hp = vp.toScreen(this.workingMesh.verts[hitIdx]);
                for (let i = 0; i < this.workingMesh.verts.length; i++) {
                    const p = vp.toScreen(this.workingMesh.verts[i]);
                    if (Math.hypot(hp.x - p.x, hp.y - p.y) < 4) {
                        this.selectedVerts.add(i);
                    }
                }
            }

            const startMesh = cloneEditableMesh(this.workingMesh);
            // Build symmetry partner map for selected vertices
            const symMap = new Map();
            const sx = this.symXEl.checked;
            const sz = this.symZEl.checked;
            for (const idx of this.selectedVerts) {
                const partners = [];
                if (sx) {
                    const px = this._findSymPartner(idx, true, false, startMesh.verts);
                    if (px !== -1 && !this.selectedVerts.has(px)) partners.push({ idx: px, mx: -1, mz: 1 });
                }
                if (sz) {
                    const pz = this._findSymPartner(idx, false, true, startMesh.verts);
                    if (pz !== -1 && !this.selectedVerts.has(pz)) partners.push({ idx: pz, mx: 1, mz: -1 });
                }
                if (sx && sz) {
                    const pxz = this._findSymPartner(idx, true, true, startMesh.verts);
                    if (pxz !== -1 && !this.selectedVerts.has(pxz)) partners.push({ idx: pxz, mx: -1, mz: -1 });
                }
                symMap.set(idx, partners);
            }

            this.dragState = {
                pane: paneKey,
                startMouseX: e.clientX,
                startMouseY: e.clientY,
                startVerts: startMesh.verts,
                symMap,
                vp
            };
            this.draw2DViews();
            this.update3DPreview();
        } else {
            // Start box selection marquee
            if (!e.shiftKey) this.selectedVerts.clear();
            this.boxSelect = { pane: paneKey, x0: mx, y0: my, x1: mx, y1: my, shift: e.shiftKey, vp };
            this.draw2DViews();
            this.update3DPreview();
        }
    }

    _onMove(e) {
        if (!this.isOpen() || !this.workingMesh) return;

        if (this.boxSelect) {
            const view = this.views[this.boxSelect.pane];
            const rect = view.canvas.getBoundingClientRect();
            this.boxSelect.x1 = e.clientX - rect.left;
            this.boxSelect.y1 = e.clientY - rect.top;
            this.draw2DViews();
            return;
        }

        if (this.dragState) {
            const ds = this.dragState;
            const dx = e.clientX - ds.startMouseX;
            const dy = e.clientY - ds.startMouseY;
            let dU = dx / ds.vp.scale;
            let dV = -dy / ds.vp.scale;

            if (this.snapGridEl.checked) {
                const snap = 0.005;
                dU = Math.round(dU / snap) * snap;
                dV = Math.round(dV / snap) * snap;
            }

            const ax = ds.vp.ax;
            const dH = dU * ax.hs;
            const dV3 = dV * ax.vs;

            // Reset from startVerts then apply deltas
            for (let i = 0; i < this.workingMesh.verts.length; i++) {
                this.workingMesh.verts[i] = [...ds.startVerts[i]];
            }

            const moveVert = (idx, weight, mulX = 1, mulZ = 1) => {
                const v = this.workingMesh.verts[idx];
                const mulH = ax.hi === 0 ? mulX : (ax.hi === 2 ? mulZ : 1);
                const mulV = ax.vi === 0 ? mulX : (ax.vi === 2 ? mulZ : 1);
                v[ax.hi] += dH * weight * mulH;
                v[ax.vi] += dV3 * weight * mulV;
            };

            for (const idx of this.selectedVerts) {
                moveVert(idx, 1, 1, 1);
                const partners = ds.symMap.get(idx) || [];
                for (const p of partners) {
                    moveVert(p.idx, 1, p.mx, p.mz);
                }
            }

            // Optional soft proportional falloff on unselected neighbors
            if (this.softFalloffEl.checked) {
                const radius = 0.11;
                for (let i = 0; i < ds.startVerts.length; i++) {
                    if (this.selectedVerts.has(i)) continue;
                    let minDist = Infinity;
                    for (const sIdx of this.selectedVerts) {
                        const a = ds.startVerts[i];
                        const b = ds.startVerts[sIdx];
                        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
                        if (d < minDist) minDist = d;
                    }
                    if (minDist < radius) {
                        const w = 0.5 * (1 + Math.cos((Math.PI * minDist) / radius));
                        moveVert(i, w, 1, 1);
                    }
                }
            }

            this.draw2DViews();
            this.update3DPreview();
            return;
        }

        // Hover vertex highlight
        let found = null;
        for (const paneKey of Object.keys(this.views)) {
            const view = this.views[paneKey];
            const rect = view.canvas.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) continue;
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const vp = this._computeViewport(view.canvas, view.mode);
            for (let i = 0; i < this.workingMesh.verts.length; i++) {
                const p = vp.toScreen(this.workingMesh.verts[i]);
                if (Math.hypot(mx - p.x, my - p.y) < 9) {
                    found = { pane: paneKey, idx: i };
                    break;
                }
            }
            if (found) break;
        }
        if (JSON.stringify(found) !== JSON.stringify(this.hoverVert)) {
            this.hoverVert = found;
            this.draw2DViews();
        }
    }

    _onUp() {
        if (this.boxSelect) {
            const bs = this.boxSelect;
            const rx0 = Math.min(bs.x0, bs.x1);
            const rx1 = Math.max(bs.x0, bs.x1);
            const ry0 = Math.min(bs.y0, bs.y1);
            const ry1 = Math.max(bs.y0, bs.y1);
            if (rx1 - rx0 > 4 || ry1 - ry0 > 4) {
                for (let i = 0; i < this.workingMesh.verts.length; i++) {
                    const p = bs.vp.toScreen(this.workingMesh.verts[i]);
                    if (p.x >= rx0 && p.x <= rx1 && p.y >= ry0 && p.y <= ry1) {
                        this.selectedVerts.add(i);
                    }
                }
            }
            this.boxSelect = null;
            this.draw2DViews();
            this.update3DPreview();
        }
        this.dragState = null;
    }

    _frameCamera3D() {
        const box = new THREE.Box3().setFromObject(this.mesh3D);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const maxDim = Math.max(0.15, size.x, size.y, size.z);
        this.orbit3D.target.copy(center);
        this.cam3D.position.set(center.x + maxDim * 1.4, center.y + maxDim * 0.6, center.z + maxDim * 1.8);
        this.orbit3D.update();
    }

    update3DPreview() {
        if (!this.workingMesh) return;
        const boneLen = this.character.getBoneLengthForPart(this.canonicalKey);
        const geo = buildBufferGeometryFromQuadMesh(
            this.workingMesh,
            boneLen,
            (pName, v) => applyAnatomicalMorph(this.character.morph, pName, v),
            this.canonicalKey
        );

        this.mesh3D.geometry.dispose();
        this.mesh3D.geometry = geo;

        // Build control cage wireframe + vertex points in 3D
        const refLen = this.workingMesh.refLength || boneLen || 1;
        const ratio = boneLen ? boneLen / refLen : 1;
        const axis = this.workingMesh.axis || 'y';

        const displayVerts = this.workingMesh.verts.map((v) => {
            const mv = applyAnatomicalMorph(this.character.morph, this.canonicalKey, v);
            return [
                axis === 'x' ? mv[0] * ratio : mv[0],
                axis === 'y' ? mv[1] * ratio : mv[1],
                axis === 'z' ? mv[2] * ratio : mv[2]
            ];
        });

        const linePts = [];
        const seen = new Set();
        for (const q of this.workingMesh.quads) {
            for (let k = 0; k < 4; k++) {
                const a = q[k], b = q[(k + 1) % 4];
                const ek = a < b ? `${a}_${b}` : `${b}_${a}`;
                if (seen.has(ek)) continue;
                seen.add(ek);
                linePts.push(new THREE.Vector3(...displayVerts[a]), new THREE.Vector3(...displayVerts[b]));
            }
        }
        this.cageLines3D.geometry.dispose();
        this.cageLines3D.geometry = new THREE.BufferGeometry().setFromPoints(linePts);

        const posArr = new Float32Array(displayVerts.length * 3);
        const colArr = new Float32Array(displayVerts.length * 3);
        for (let i = 0; i < displayVerts.length; i++) {
            posArr[i * 3] = displayVerts[i][0];
            posArr[i * 3 + 1] = displayVerts[i][1];
            posArr[i * 3 + 2] = displayVerts[i][2];
            const isSel = this.selectedVerts.has(i);
            colArr[i * 3] = isSel ? 1.0 : 0.3;
            colArr[i * 3 + 1] = isSel ? 0.55 : 0.65;
            colArr[i * 3 + 2] = isSel ? 0.2 : 1.0;
        }
        this.vertPoints3D.geometry.dispose();
        const ptGeo = new THREE.BufferGeometry();
        ptGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        ptGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
        this.vertPoints3D.geometry = ptGeo;
    }

    _startLoop3D() {
        if (this._animId) cancelAnimationFrame(this._animId);
        const tick = () => {
            if (!this.isOpen()) return;
            this._animId = requestAnimationFrame(tick);
            this.orbit3D.update();
            this.renderer3D.render(this.scene3D, this.cam3D);
        };
        tick();
    }

    resize() {
        this.draw2DViews();
        this.update3DPreview();
        const rect = this.canvas3D.parentElement.getBoundingClientRect();
        if (rect.width > 4 && rect.height > 4) {
            this.renderer3D.setSize(rect.width, rect.height, false);
            this.cam3D.aspect = rect.width / rect.height;
            this.cam3D.updateProjectionMatrix();
        }
    }
}
