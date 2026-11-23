import * as THREE from 'three';
import { computeRigOffsets, DEFAULT_PROPORTIONS } from '../core/rigSchema.js';

export class SkeletonEditor {
    constructor(scene, character, onChanged) {
        this.scene = scene;
        this.character = character;
        this.onChanged = onChanged;
        this.active = false;

        this.guidesGroup = new THREE.Group();
        this.guidesGroup.name = 'SkeletonGuides';
        this.guidesGroup.visible = false;
        this.scene.add(this.guidesGroup);

        this.boneLineMat = new THREE.LineBasicMaterial({
            color: 0x55ddff,
            depthTest: false,
            transparent: true,
            opacity: 0.9
        });
        this.guideGridMat = new THREE.LineBasicMaterial({
            color: 0xffcc55,
            transparent: true,
            opacity: 0.35
        });
        this.centerLineMat = new THREE.LineBasicMaterial({
            color: 0x4a9eff,
            transparent: true,
            opacity: 0.65
        });

        this.canvas2d = null;
        this.ctx2d = null;
        this.dragHandle = null;
        this.hoverHandle = null;
        this.handles2D = [];
    }

    setActive(on) {
        this.active = on;
        this.guidesGroup.visible = on;
        // Make body semi-transparent in skeleton edit mode so internal rig & guides are clear
        const mats = this.character.materials;
        for (const key of ['skin', 'torso', 'pelvis', 'limbs', 'shoe']) {
            mats[key].transparent = on;
            mats[key].opacity = on ? 0.38 : 1.0;
            mats[key].depthWrite = !on;
        }
        if (on) {
            this.rebuild3DGuides();
            this.draw2DSchematic();
        }
    }

    rebuild3DGuides() {
        while (this.guidesGroup.children.length) {
            const c = this.guidesGroup.children.pop();
            if (c.geometry) c.geometry.dispose();
        }
        if (!this.active) return;

        this.character.root.updateMatrixWorld(true);
        const o = computeRigOffsets(this.character.proportions);
        const totalH = o.pelvisY + o.pelvisToAbdomen + o.abdomenToChest + o.chestToNeck + o.neckLen + o.headSize;

        // 1. Centerline spine vertical guide
        const centerGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, totalH + 0.15, 0)
        ]);
        this.guidesGroup.add(new THREE.Line(centerGeo, this.centerLineMat));

        // 2. Horizontal head-unit guide lines (each head height)
        const headH = Math.max(0.12, o.headSize);
        const numHeads = Math.ceil((totalH + 0.05) / headH);
        for (let i = 0; i <= numHeads; i++) {
            const y = totalH - i * headH;
            if (y < -0.02) break;
            const g = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-0.65, y, 0),
                new THREE.Vector3(0.65, y, 0)
            ]);
            this.guidesGroup.add(new THREE.Line(g, this.guideGridMat));
        }

        // 3. Elastic bone-to-bone lines connecting all joints in hierarchy
        const segments = [];
        const pA = new THREE.Vector3();
        const pB = new THREE.Vector3();
        for (const joint of this.character.joints) {
            const parent = joint.parent;
            if (parent && parent.userData && parent.userData.baseLabel) {
                parent.getWorldPosition(pA);
                joint.getWorldPosition(pB);
                segments.push(pA.clone(), pB.clone());
            }
        }
        if (segments.length) {
            const boneGeo = new THREE.BufferGeometry().setFromPoints(segments);
            const lines = new THREE.LineSegments(boneGeo, this.boneLineMat);
            lines.renderOrder = 30;
            this.guidesGroup.add(lines);
        }
    }

    bind2DCanvas(canvas, statsEl) {
        this.canvas2d = canvas;
        this.statsEl = statsEl;
        this.ctx2d = canvas.getContext('2d');

        canvas.addEventListener('mousedown', (e) => this._onDown2D(e));
        window.addEventListener('mousemove', (e) => this._onMove2D(e));
        window.addEventListener('mouseup', () => this._onUp2D());
    }

    _getCanvasPoint(e) {
        const rect = this.canvas2d.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
    }

    _onDown2D(e) {
        if (!this.active || !this.canvas2d) return;
        const m = this._getCanvasPoint(e);
        for (const h of this.handles2D) {
            if (Math.hypot(m.x - h.x, m.y - h.y) <= 10) {
                this.dragHandle = {
                    ...h,
                    startMouseX: m.x,
                    startMouseY: m.y,
                    startProps: { ...this.character.proportions }
                };
                break;
            }
        }
    }

    _onMove2D(e) {
        if (!this.active || !this.canvas2d) return;
        const m = this._getCanvasPoint(e);
        if (!this.dragHandle) {
            let found = null;
            for (const h of this.handles2D) {
                if (Math.hypot(m.x - h.x, m.y - h.y) <= 10) {
                    found = h.id;
                    break;
                }
            }
            if (found !== this.hoverHandle) {
                this.hoverHandle = found;
                this.canvas2d.style.cursor = found ? 'grab' : 'default';
                this.draw2DSchematic();
            }
            return;
        }

        this.canvas2d.style.cursor = 'grabbing';
        const dx = (m.x - this.dragHandle.startMouseX) / this._lastScale;
        const dy = -(m.y - this.dragHandle.startMouseY) / this._lastScale;
        const sp = this.dragHandle.startProps;
        const p = this.character.proportions;
        const s = sp.heightScale || 1;
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

        switch (this.dragHandle.id) {
            case 'shoulder':
                p.shoulderWidth = clamp(sp.shoulderWidth + Math.sign(this.dragHandle.side) * dx / s, p.clavicleOffsetX + 0.04, 0.34);
                break;
            case 'clavicle':
                p.clavicleOffsetX = clamp(sp.clavicleOffsetX + Math.sign(this.dragHandle.side) * dx / s, 0.02, p.shoulderWidth - 0.03);
                break;
            case 'hip':
                p.hipWidth = clamp(sp.hipWidth + Math.sign(this.dragHandle.side) * dx / s, 0.05, 0.22);
                break;
            case 'elbow':
                p.upperArmLen = clamp(sp.upperArmLen - dy / s, 0.14, 0.45);
                break;
            case 'wrist':
                p.foreArmLen = clamp(sp.foreArmLen - dy / s, 0.14, 0.42);
                break;
            case 'knee':
                p.thighLen = clamp(sp.thighLen - dy / s, 0.22, 0.65);
                break;
            case 'ankle':
                p.shinLen = clamp(sp.shinLen - dy / s, 0.22, 0.65);
                break;
            case 'chestTop':
                p.chestHeight = clamp(sp.chestHeight + dy / s, 0.18, 0.45);
                break;
            case 'abdomenTop':
                p.abdomenHeight = clamp(sp.abdomenHeight + dy / s, 0.06, 0.28);
                break;
            case 'headTop':
                p.headSize = clamp(sp.headSize + dy / s, 0.14, 0.32);
                break;
            case 'neckTop':
                p.neckLen = clamp(sp.neckLen + dy / s, 0.04, 0.20);
                break;
        }

        this.character.rebuildGeometryAndLayout(true);
        this.rebuild3DGuides();
        this.draw2DSchematic();
        if (this.onChanged) this.onChanged();
    }

    _onUp2D() {
        if (this.dragHandle) {
            this.dragHandle = null;
            if (this.canvas2d) this.canvas2d.style.cursor = 'default';
            this.draw2DSchematic();
        }
    }

    draw2DSchematic() {
        if (!this.canvas2d || !this.ctx2d) return;
        const rect = this.canvas2d.parentElement.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;

        const dpr = window.devicePixelRatio || 1;
        this.canvas2d.width = Math.floor(rect.width * dpr);
        this.canvas2d.height = Math.floor(rect.height * dpr);
        const ctx = this.ctx2d;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const W = rect.width;
        const H = rect.height;
        ctx.fillStyle = '#0d1017';
        ctx.fillRect(0, 0, W, H);

        const o = computeRigOffsets(this.character.proportions);
        const totalH = o.pelvisY + o.pelvisToAbdomen + o.abdomenToChest + o.chestToNeck + o.neckLen + o.headSize;

        const pad = 26;
        const scale = (H - pad * 2) / Math.max(1.2, totalH + 0.12);
        this._lastScale = scale;

        const cx = W / 2;
        const baseY = H - pad;
        const toX = (mx) => cx + mx * scale;
        const toY = (my) => baseY - my * scale;

        // Reference head-unit horizontal grid
        const headH = Math.max(0.12, o.headSize);
        const numHeads = Math.ceil((totalH + 0.04) / headH);
        ctx.font = '10px ui-monospace, monospace';
        for (let i = 0; i <= numHeads; i++) {
            const wy = totalH - i * headH;
            if (wy < -0.02) break;
            const sy = toY(wy);
            ctx.strokeStyle = i === 0 || Math.abs(wy) < 0.01 ? 'rgba(255, 200, 70, 0.45)' : 'rgba(74, 158, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(12, sy);
            ctx.lineTo(W - 12, sy);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 200, 70, 0.7)';
            ctx.fillText(`${i}г`, 6, sy - 3);
        }

        // Centerline symmetry guide
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.45)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, pad * 0.5);
        ctx.lineTo(cx, baseY + 6);
        ctx.stroke();
        ctx.setLineDash([]);

        // Compute anatomical points
        const yPelvis = o.pelvisY;
        const yAbd = yPelvis + o.pelvisToAbdomen;
        const yChest = yAbd + o.abdomenToChest;
        const yShoulder = yChest + o.shoulderY;
        const yNeck = yChest + o.chestToNeck;
        const yHead = yNeck + o.neckLen;
        const yTop = yHead + o.headSize;

        const yHip = yPelvis - o.hipDrop;
        const yKnee = yHip - o.thighLen;
        const yAnkle = yKnee - o.shinLen;
        const yFoot = yAnkle - o.footHeight * 0.72;

        const yElbow = yShoulder - o.upperArmLen;
        const yWrist = yElbow - o.foreArmLen;
        const yHandTip = yWrist - o.handLen;

        // Draw oval pelvis & ribcage silhouette guides
        ctx.strokeStyle = 'rgba(142, 153, 173, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, toY(yPelvis), o.hipX * 1.35 * scale, o.pelvisHeight * 0.52 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cx, toY(yChest + o.chestHeight * 0.55), o.shoulderWidth * 0.78 * scale, o.chestHeight * 0.5 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cx, toY(yHead + o.headSize * 0.5), o.headSize * 0.38 * scale, o.headSize * 0.5 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Elastic bone lines
        const drawBone = (x1, y1, x2, y2, color = '#55ddff') => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(toX(x1), toY(y1));
            ctx.lineTo(toX(x2), toY(y2));
            ctx.stroke();
        };

        drawBone(0, yPelvis, 0, yAbd);
        drawBone(0, yAbd, 0, yChest);
        drawBone(0, yChest, 0, yNeck);
        drawBone(0, yNeck, 0, yHead);
        drawBone(0, yHead, 0, yTop, 'rgba(85,221,255,0.4)');

        const shX = o.clavicleOffsetX + o.clavicleLen;
        for (const sgn of [1, -1]) {
            drawBone(0, yShoulder, sgn * o.clavicleOffsetX, yShoulder, 'rgba(85,221,255,0.45)');
            drawBone(sgn * o.clavicleOffsetX, yShoulder, sgn * shX, yShoulder);
            drawBone(sgn * shX, yShoulder, sgn * shX, yElbow);
            drawBone(sgn * shX, yElbow, sgn * shX, yWrist);
            drawBone(sgn * shX, yWrist, sgn * shX, yHandTip, '#70c0ff');

            drawBone(0, yPelvis, sgn * o.hipX, yHip, 'rgba(85,221,255,0.5)');
            drawBone(sgn * o.hipX, yHip, sgn * o.hipX, yKnee);
            drawBone(sgn * o.hipX, yKnee, sgn * o.hipX, yAnkle);
            drawBone(sgn * o.hipX, yAnkle, sgn * o.hipX, yFoot, '#70c0ff');
        }

        // Interactive draggable handles
        this.handles2D = [
            { id: 'headTop', x: toX(0), y: toY(yTop), label: 'Голова' },
            { id: 'neckTop', x: toX(0), y: toY(yHead), label: 'Шея' },
            { id: 'chestTop', x: toX(0), y: toY(yNeck), label: 'Грудь' },
            { id: 'abdomenTop', x: toX(0), y: toY(yChest), label: 'Живот' },
            { id: 'clavicle', side: 1, x: toX(o.clavicleOffsetX), y: toY(yShoulder), label: 'Ключица' },
            { id: 'clavicle', side: -1, x: toX(-o.clavicleOffsetX), y: toY(yShoulder) },
            { id: 'shoulder', side: 1, x: toX(shX), y: toY(yShoulder), label: 'Плечо' },
            { id: 'shoulder', side: -1, x: toX(-shX), y: toY(yShoulder) },
            { id: 'elbow', side: 1, x: toX(shX), y: toY(yElbow), label: 'Локоть' },
            { id: 'elbow', side: -1, x: toX(-shX), y: toY(yElbow) },
            { id: 'wrist', side: 1, x: toX(shX), y: toY(yWrist), label: 'Кисть' },
            { id: 'wrist', side: -1, x: toX(-shX), y: toY(yWrist) },
            { id: 'hip', side: 1, x: toX(o.hipX), y: toY(yHip), label: 'Бедро' },
            { id: 'hip', side: -1, x: toX(-o.hipX), y: toY(yHip) },
            { id: 'knee', side: 1, x: toX(o.hipX), y: toY(yKnee), label: 'Колено' },
            { id: 'knee', side: -1, x: toX(-o.hipX), y: toY(yKnee) },
            { id: 'ankle', side: 1, x: toX(o.hipX), y: toY(yAnkle), label: 'Стопа' },
            { id: 'ankle', side: -1, x: toX(-o.hipX), y: toY(yAnkle) }
        ];

        for (const h of this.handles2D) {
            const isActive = (this.dragHandle && this.dragHandle.id === h.id) || this.hoverHandle === h.id;
            ctx.beginPath();
            ctx.arc(h.x, h.y, isActive ? 6.5 : 4.5, 0, Math.PI * 2);
            ctx.fillStyle = isActive ? '#ffcc44' : '#ff9944';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }

        if (this.statsEl) {
            const heads = (totalH / headH).toFixed(1);
            const ratio = (o.shoulderWidth / Math.max(0.01, o.hipX)).toFixed(2);
            this.statsEl.textContent = `Рост: ${totalH.toFixed(2)} м (${heads} голов) · Плечи/Таз: ${ratio}`;
        }
    }

    resetProportions() {
        this.character.proportions = { ...DEFAULT_PROPORTIONS };
        this.character.rebuildGeometryAndLayout(true);
        this.rebuild3DGuides();
        this.draw2DSchematic();
        if (this.onChanged) this.onChanged();
    }
}
