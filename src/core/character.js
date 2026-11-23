import * as THREE from 'three';
import {
    BODY_PRESETS,
    DEFAULT_PROPORTIONS,
    MIRROR_PAIRS,
    computeRigOffsets
} from './rigSchema.js';
import {
    buildBufferGeometryFromQuadMesh,
    buildFingerGeometry,
    cloneEditableMesh,
    mirrorEditableMeshX
} from './subdivMesh.js';
import {
    applyAnatomicalMorph,
    createAnatomicalMeshes
} from './anatomicalMeshes.js';

export class CharacterRig {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'CharacterRoot';
        this.scene.add(this.root);

        this.proportions = { ...DEFAULT_PROPORTIONS };
        this.morph = { gender: 'neutral', weight: 0.0, muscle: 0.1 };
        this.cages = createAnatomicalMeshes();
        this.globalSubdiv = 2;

        this.joints = [];
        this.jointByName = {};
        this.markers = [];
        this.bodyMeshes = [];
        this.guideLines = [];
        this.showConstructionGuides = true;

        this.materials = {
            skin: new THREE.MeshStandardMaterial({ color: 0xe6dcd0, roughness: 0.72, metalness: 0.02 }),
            torso: new THREE.MeshStandardMaterial({ color: 0xcbd0dc, roughness: 0.76, metalness: 0.02 }),
            pelvis: new THREE.MeshStandardMaterial({ color: 0x9aa4b8, roughness: 0.78, metalness: 0.02 }),
            limbs: new THREE.MeshStandardMaterial({ color: 0xe0d5c5, roughness: 0.72, metalness: 0.02 }),
            shoe: new THREE.MeshStandardMaterial({ color: 0x525b6e, roughness: 0.65, metalness: 0.04 }),
            marker: new THREE.MeshBasicMaterial({ color: 0xff9944, depthTest: true, depthWrite: false }),
            guideLine: new THREE.LineBasicMaterial({
                color: 0x3b4458,
                transparent: true,
                opacity: 0.35
            })
        };

        this._buildHierarchy();
        this._linkMirrors();
        this.rebuildGeometryAndLayout(true);
    }

    _makeJoint(parent, name, options = {}) {
        const g = new THREE.Group();
        g.name = name;
        g.userData.baseLabel = name;
        g.userData.cageKey = options.cageKey || null;
        g.userData.isFinger = !!options.isFinger;
        g.userData.fingerInfo = options.fingerInfo || null;
        g.userData.isRoot = !!options.isRoot;
        parent.add(g);

        const shapeGroup = new THREE.Group();
        shapeGroup.userData.isShapeGroup = true;
        g.add(shapeGroup);
        g.userData.shapeGroup = shapeGroup;

        const guideGroup = new THREE.Group();
        guideGroup.userData.isConstructionGuide = true;
        g.add(guideGroup);
        g.userData.guideGroup = guideGroup;

        const markerMat = this.materials.marker.clone();
        const radius = options.isFinger ? 0.008 : (options.markerRadius || 0.026);
        const marker = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), markerMat);
        marker.userData.isMarker = true;
        marker.userData.joint = g;
        marker.renderOrder = 20;
        g.add(marker);

        g.userData.marker = marker;
        this.markers.push(marker);
        this.joints.push(g);
        this.jointByName[name] = g;
        return g;
    }

    _addMesh(joint, mat) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.joint = joint;
        joint.userData.shapeGroup.add(mesh);
        joint.userData.primaryMesh = mesh;
        this.bodyMeshes.push(mesh);
        return mesh;
    }

    _buildHierarchy() {
        const pelvis = this._makeJoint(this.root, 'Таз', { isRoot: true, cageKey: 'Таз', markerRadius: 0.034 });
        this._addMesh(pelvis, this.materials.pelvis);

        const abdomen = this._makeJoint(pelvis, 'Живот', { cageKey: 'Живот', markerRadius: 0.028 });
        this._addMesh(abdomen, this.materials.skin);

        const chest = this._makeJoint(abdomen, 'Грудь', { cageKey: 'Грудь', markerRadius: 0.030 });
        this._addMesh(chest, this.materials.torso);

        const neck = this._makeJoint(chest, 'Шея', { cageKey: 'Шея', markerRadius: 0.022 });
        this._addMesh(neck, this.materials.skin);

        const head = this._makeJoint(neck, 'Голова', { cageKey: 'Голова', markerRadius: 0.024 });
        this._addMesh(head, this.materials.skin);

        const buildArm = (side) => {
            const clav = this._makeJoint(chest, `Ключица ${side}`, { cageKey: `Ключица ${side}`, markerRadius: 0.022 });
            this._addMesh(clav, this.materials.torso);

            const shoulder = this._makeJoint(clav, `Плечо ${side}`, { cageKey: `Плечо ${side}`, markerRadius: 0.026 });
            this._addMesh(shoulder, this.materials.limbs);

            const elbow = this._makeJoint(shoulder, `Локоть ${side}`, { cageKey: `Локоть ${side}`, markerRadius: 0.022 });
            this._addMesh(elbow, this.materials.limbs);

            const hand = this._makeJoint(elbow, `Кисть ${side}`, { cageKey: `Кисть ${side}`, markerRadius: 0.018 });
            this._addMesh(hand, this.materials.skin);

            const fingerSpecs = [
                { name: `Большой ${side}`, len1: 0.030, len2: 0.025, r: 0.0085, isThumb: true },
                { name: `Указательный ${side}`, len1: 0.038, len2: 0.032, r: 0.0072, zRatio: 0.28 },
                { name: `Средний ${side}`, len1: 0.042, len2: 0.035, r: 0.0075, zRatio: 0.10 },
                { name: `Безымянный ${side}`, len1: 0.039, len2: 0.033, r: 0.0071, zRatio: -0.09 },
                { name: `Мизинец ${side}`, len1: 0.031, len2: 0.026, r: 0.0064, zRatio: -0.26 }
            ];
            for (const fs of fingerSpecs) {
                const fj1 = this._makeJoint(hand, fs.name, { isFinger: true, fingerInfo: { ...fs, seg: 1, len: fs.len1 } });
                this._addMesh(fj1, this.materials.skin);

                const fj2 = this._makeJoint(fj1, `${fs.name} 2`, { isFinger: true, fingerInfo: { ...fs, seg: 2, len: fs.len2, r: fs.r * 0.85 } });
                this._addMesh(fj2, this.materials.skin);
            }
        };

        buildArm('L');
        buildArm('R');

        const buildLeg = (side) => {
            const hip = this._makeJoint(pelvis, `Бедро ${side}`, { cageKey: `Бедро ${side}`, markerRadius: 0.028 });
            this._addMesh(hip, this.materials.limbs);

            const knee = this._makeJoint(hip, `Колено ${side}`, { cageKey: `Колено ${side}`, markerRadius: 0.024 });
            this._addMesh(knee, this.materials.limbs);

            const ankle = this._makeJoint(knee, `Стопа ${side}`, { cageKey: `Стопа ${side}`, markerRadius: 0.022 });
            this._addMesh(ankle, this.materials.shoe);

            const toes = this._makeJoint(ankle, `Носок ${side}`, { cageKey: `Носок ${side}`, markerRadius: 0.016 });
            this._addMesh(toes, this.materials.shoe);
        };

        buildLeg('L');
        buildLeg('R');
    }

    _linkMirrors() {
        for (const [a, b] of MIRROR_PAIRS) {
            const ja = this.jointByName[a];
            const jb = this.jointByName[b];
            if (ja && jb) {
                ja.userData.mirrorOf = jb;
                jb.userData.mirrorOf = ja;
            }
        }
    }

    getMeshDataForPart(partName) {
        if (this.cages[partName]) return this.cages[partName];
        if (partName.endsWith(' R')) {
            const leftName = partName.slice(0, -2) + ' L';
            if (this.cages[leftName]) return mirrorEditableMeshX(this.cages[leftName]);
        }
        return null;
    }

    getBoneLengthForPart(partName, offsets) {
        const o = offsets || computeRigOffsets(this.proportions);
        const base = partName.replace(/ [LR]$/, '');
        switch (base) {
            case 'Таз': return o.pelvisHeight;
            case 'Живот': return o.abdomenHeight;
            case 'Грудь': return o.chestHeight;
            case 'Шея': return o.neckLen;
            case 'Голова': return o.headSize;
            case 'Ключица': return o.clavicleLen;
            case 'Плечо': return o.upperArmLen;
            case 'Локоть': return o.foreArmLen;
            case 'Кисть': return o.handLen;
            case 'Бедро': return o.thighLen;
            case 'Колено': return o.shinLen;
            case 'Стопа': return o.footLen;
            case 'Носок': return o.footLen * 0.36;
            default: return null;
        }
    }

    updateJointPositions(resetRootHeight = false) {
        const o = computeRigOffsets(this.proportions);
        const j = this.jointByName;

        if (resetRootHeight || (Math.abs(j['Таз'].position.x) < 0.001 && Math.abs(j['Таз'].position.z) < 0.001)) {
            j['Таз'].position.y = o.pelvisY;
            if (resetRootHeight) {
                j['Таз'].position.x = 0;
                j['Таз'].position.z = 0;
            }
        }

        j['Живот'].position.set(0, o.pelvisToAbdomen, 0);
        j['Грудь'].position.set(0, o.abdomenToChest, 0);
        j['Шея'].position.set(0, o.chestToNeck, 0);
        j['Голова'].position.set(0, o.neckLen, 0);

        for (const side of ['L', 'R']) {
            const sign = side === 'L' ? 1 : -1;
            j[`Ключица ${side}`].position.set(sign * o.clavicleOffsetX, o.shoulderY, 0);
            j[`Плечо ${side}`].position.set(sign * o.clavicleLen, 0, 0);
            j[`Локоть ${side}`].position.set(0, -o.upperArmLen, 0);
            j[`Кисть ${side}`].position.set(0, -o.foreArmLen, 0);

            const handScale = o.handLen / 0.095;
            const palmDepth = 0.032 * handScale;
            const thumb = j[`Большой ${side}`];
            const thumb2 = j[`Большой ${side} 2`];
            if (thumb) {
                thumb.position.set(-sign * 0.008 * handScale, -o.handLen * 0.34, palmDepth * 0.96);
                if (thumb.rotation.x === 0 && thumb.rotation.z === 0) {
                    thumb.rotation.set(-0.46, 0, -sign * 0.22);
                }
            }
            if (thumb2 && thumb) {
                thumb2.position.set(0, -thumb.userData.fingerInfo.len1 * handScale, 0);
                if (thumb2.rotation.z === 0) thumb2.rotation.set(0, 0, -sign * 0.32);
            }

            const spread = [0.10, 0.03, -0.04, -0.11];
            const fNames = ['Указательный', 'Средний', 'Безымянный', 'Мизинец'];
            fNames.forEach((fName, idx) => {
                const fj1 = j[`${fName} ${side}`];
                const fj2 = j[`${fName} ${side} 2`];
                if (fj1 && fj1.userData.fingerInfo) {
                    fj1.position.set(0, -o.handLen * 0.96, fj1.userData.fingerInfo.zRatio * o.handLen);
                    if (fj1.rotation.x === 0 && fj1.rotation.y === 0 && fj1.rotation.z === 0) {
                        fj1.rotation.set(spread[idx], 0, -sign * 0.16);
                    }
                    if (fj2) {
                        fj2.position.set(0, -fj1.userData.fingerInfo.len1 * handScale, 0);
                        if (fj2.rotation.z === 0) fj2.rotation.set(0, 0, -sign * 0.28);
                    }
                }
            });

            j[`Бедро ${side}`].position.set(sign * o.hipX, -o.hipDrop, 0);
            j[`Колено ${side}`].position.set(0, -o.thighLen, 0);
            j[`Стопа ${side}`].position.set(0, -o.shinLen, 0);
            j[`Носок ${side}`].position.set(0, -o.footHeight * 0.72, o.footLen * 0.58);
        }
    }

    _rebuildConstructionGuidesForPart(joint) {
        const guideGroup = joint.userData.guideGroup;
        if (!guideGroup) return;
        while (guideGroup.children.length) {
            const c = guideGroup.children.pop();
            if (c.geometry) c.geometry.dispose();
            const idx = this.guideLines.indexOf(c);
            if (idx !== -1) this.guideLines.splice(idx, 1);
        }

        const mesh = joint.userData.primaryMesh;
        if (!mesh || !mesh.geometry) return;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        if (!box) return;

        const name = joint.userData.baseLabel;
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const addLoop = (points) => {
            const g = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(g, this.materials.guideLine);
            line.visible = this.showConstructionGuides;
            line.userData.isGuide = true;
            guideGroup.add(line);
            this.guideLines.push(line);
        };

        // Loomis Head construction: vertical centerline, brow line, nose-base line, left/right temporal side ovals + ear crosshairs
        if (name === 'Голова') {
            const rx = size.x * 0.505;
            const ry = size.y * 0.49;
            const rz = size.z * 0.515;
            const vPts = [];
            for (let i = 0; i <= 28; i++) {
                const ang = -Math.PI * 0.48 + (i / 28) * Math.PI * 0.96;
                vPts.push(new THREE.Vector3(0, center.y + Math.sin(ang) * ry, center.z + Math.cos(ang) * rz));
            }
            addLoop(vPts);

            const eyeY = box.min.y + size.y * 0.48;
            const hPts = [];
            for (let i = 0; i <= 32; i++) {
                const ang = (i / 32) * Math.PI * 2;
                hPts.push(new THREE.Vector3(Math.cos(ang) * rx, eyeY, center.z + Math.sin(ang) * rz * 0.95));
            }
            addLoop(hPts);

            // Nose-base / cheekbone line (front arc)
            const noseY = box.min.y + size.y * 0.30;
            const nPts = [];
            for (let i = 0; i <= 16; i++) {
                const ang = Math.PI * 0.12 + (i / 16) * Math.PI * 0.76;
                nPts.push(new THREE.Vector3(Math.cos(ang) * rx * 0.88, noseY, center.z + Math.sin(ang) * rz * 0.94));
            }
            addLoop(nPts);

            // Loomis temporal oval planes (left + right sides of head)
            const earY = box.min.y + size.y * 0.52;
            const earZ = center.z - size.z * 0.04;
            const ovalR = size.y * 0.25;
            for (const sgn of [1, -1]) {
                const sideX = sgn * rx * 0.92;
                const earOval = [];
                for (let i = 0; i <= 24; i++) {
                    const ang = (i / 24) * Math.PI * 2;
                    earOval.push(new THREE.Vector3(sideX, earY + Math.sin(ang) * ovalR, earZ + Math.cos(ang) * ovalR * 0.92));
                }
                addLoop(earOval);
                addLoop([new THREE.Vector3(sideX, earY - ovalR, earZ), new THREE.Vector3(sideX, earY + ovalR, earZ)]);
            }
        } else if (name === 'Грудь') {
            // Sternum centerline + pectoral guide + costal ribcage arch
            addLoop([
                new THREE.Vector3(0, box.min.y + 0.01, box.max.z * 0.92),
                new THREE.Vector3(0, center.y, box.max.z * 1.02),
                new THREE.Vector3(0, box.max.y - 0.01, box.max.z * 0.85)
            ]);
            const pecY = box.min.y + size.y * 0.55;
            const ringPts = [];
            for (let i = 0; i <= 28; i++) {
                const ang = (i / 28) * Math.PI * 2;
                ringPts.push(new THREE.Vector3(Math.cos(ang) * size.x * 0.46, pecY, center.z + Math.sin(ang) * size.z * 0.49));
            }
            addLoop(ringPts);

            // Costal arch inverted U on front of ribcage
            const archPts = [];
            for (let i = 0; i <= 16; i++) {
                const u = (i / 16) * 2 - 1; // -1..1
                const ay = box.min.y + size.y * (0.08 + (1 - u * u) * 0.30);
                archPts.push(new THREE.Vector3(u * size.x * 0.36, ay, box.max.z * (0.94 - Math.abs(u) * 0.14)));
            }
            addLoop(archPts);
        } else if (name === 'Живот') {
            addLoop([
                new THREE.Vector3(0, box.min.y + 0.01, box.max.z * 0.96),
                new THREE.Vector3(0, center.y, box.max.z * 1.02),
                new THREE.Vector3(0, box.max.y - 0.01, box.max.z * 0.96)
            ]);
            const waistPts = [];
            for (let i = 0; i <= 24; i++) {
                const ang = (i / 24) * Math.PI * 2;
                waistPts.push(new THREE.Vector3(Math.cos(ang) * size.x * 0.45, center.y, center.z + Math.sin(ang) * size.z * 0.48));
            }
            addLoop(waistPts);
        } else if (name === 'Таз') {
            // V-cut briefs/pelvis guide + iliac belt ring + centerline
            addLoop([
                new THREE.Vector3(0, box.min.y + 0.01, box.max.z * 0.86),
                new THREE.Vector3(0, center.y, box.max.z * 1.01),
                new THREE.Vector3(0, box.max.y - 0.01, box.max.z * 0.95)
            ]);
            const beltPts = [];
            const beltY = box.min.y + size.y * 0.68;
            for (let i = 0; i <= 28; i++) {
                const ang = (i / 28) * Math.PI * 2;
                beltPts.push(new THREE.Vector3(Math.cos(ang) * size.x * 0.47, beltY, center.z + Math.sin(ang) * size.z * 0.48));
            }
            addLoop(beltPts);
            // V-cut front curve
            addLoop([
                new THREE.Vector3(-size.x * 0.40, box.min.y + size.y * 0.68, box.max.z * 0.65),
                new THREE.Vector3(0, box.min.y + size.y * 0.08, box.max.z * 0.86),
                new THREE.Vector3(size.x * 0.40, box.min.y + size.y * 0.68, box.max.z * 0.65)
            ]);
        } else if (name.startsWith('Плечо') || name.startsWith('Локоть') || name.startsWith('Бедро') || name.startsWith('Колено')) {
            const r = Math.min(size.x, size.z) * 0.45;
            const capPts = [];
            for (let i = 0; i <= 24; i++) {
                const ang = (i / 24) * Math.PI * 2;
                capPts.push(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
            }
            addLoop(capPts);
            addLoop([
                new THREE.Vector3(0, box.max.y - 0.01, box.max.z * 0.86),
                new THREE.Vector3(0, box.min.y + 0.01, box.max.z * 0.84)
            ]);
        } else if (name.startsWith('Носок')) {
            // Big-toe notch hint (like foot sketch references)
            const sgn = name.endsWith('L') ? -1 : 1; // inner big-toe side
            addLoop([
                new THREE.Vector3(sgn * size.x * 0.16, center.y, box.min.z + 0.005),
                new THREE.Vector3(sgn * size.x * 0.16, center.y, box.max.z * 0.96)
            ]);
        }
    }

    rebuildPartMesh(partName) {
        const joint = this.jointByName[partName];
        if (!joint || !joint.userData.primaryMesh) return;

        const mesh = joint.userData.primaryMesh;
        const offsets = computeRigOffsets(this.proportions);

        if (joint.userData.isFinger && joint.userData.fingerInfo) {
            const handScale = offsets.handLen / 0.095;
            const info = joint.userData.fingerInfo;
            const oldGeo = mesh.geometry;
            mesh.geometry = buildFingerGeometry(
                info.len * handScale,
                info.r * handScale * (1 + (this.morph.weight || 0) * 0.1)
            );
            if (oldGeo) oldGeo.dispose();
            return;
        }

        const meshData = this.getMeshDataForPart(partName);
        if (!meshData) return;
        const boneLen = this.getBoneLengthForPart(partName, offsets);
        const dataWithSubdiv = { ...meshData, subdiv: this.globalSubdiv };
        const oldGeo = mesh.geometry;
        mesh.geometry = buildBufferGeometryFromQuadMesh(
            dataWithSubdiv,
            boneLen,
            (pName, v) => applyAnatomicalMorph(this.morph, pName, v),
            partName
        );
        if (oldGeo) oldGeo.dispose();

        this._rebuildConstructionGuidesForPart(joint);
    }

    rebuildAllMeshes() {
        for (const joint of this.joints) {
            this.rebuildPartMesh(joint.userData.baseLabel);
        }
    }

    rebuildGeometryAndLayout(resetRootHeight = false) {
        this.updateJointPositions(resetRootHeight);
        this.rebuildAllMeshes();
    }

    setSubdivLevel(level) {
        this.globalSubdiv = Math.max(0, Math.min(2, level));
        this.rebuildAllMeshes();
    }

    setConstructionGuidesVisible(visible) {
        this.showConstructionGuides = visible;
        for (const l of this.guideLines) {
            l.visible = visible;
        }
    }

    setBodyPreset(presetId) {
        const preset = BODY_PRESETS[presetId];
        if (!preset) return;
        this.proportions = { ...preset.proportions };
        this.morph = { ...preset.morph };
        this.rebuildGeometryAndLayout(true);
    }

    setMarkersVisible(visible) {
        for (const m of this.markers) {
            m.visible = visible;
        }
    }

    setJointSelectedStyle(joint, selected) {
        if (!joint || !joint.userData.marker) return;
        const m = joint.userData.marker;
        if (selected) {
            m.material.color.setHex(0x4a9eff);
            m.scale.setScalar(1.45);
        } else {
            m.material.color.setHex(0xff9944);
            m.scale.setScalar(1.0);
        }
    }

    getPoseData() {
        const pose = {};
        for (const j of this.joints) {
            pose[j.userData.baseLabel] = {
                r: [j.rotation.x, j.rotation.y, j.rotation.z],
                p: [j.position.x, j.position.y, j.position.z]
            };
        }
        return pose;
    }

    applyPoseData(data, resetMissing = true) {
        if (resetMissing) {
            for (const j of this.joints) {
                j.rotation.set(0, 0, 0);
            }
            this.updateJointPositions(true);
        }
        if (!data) return;
        for (const name of Object.keys(data)) {
            const j = this.jointByName[name];
            if (!j) continue;
            const entry = data[name];
            if (Array.isArray(entry)) {
                j.rotation.set(entry[0] || 0, entry[1] || 0, entry[2] || 0);
            } else {
                if (entry.r) j.rotation.set(entry.r[0] || 0, entry.r[1] || 0, entry.r[2] || 0);
                if (entry.p && j.userData.isRoot) {
                    j.position.set(entry.p[0] || 0, entry.p[1] ?? j.position.y, entry.p[2] || 0);
                }
            }
        }
    }

    mirrorPoseLeftToRight() {
        for (const [lName, rName] of MIRROR_PAIRS) {
            const jl = this.jointByName[lName];
            const jr = this.jointByName[rName];
            if (!jl || !jr) continue;
            jr.rotation.set(jl.rotation.x, -jl.rotation.y, -jl.rotation.z);
        }
    }

    setHandCurl(side, curl01) {
        const sign = side === 'L' ? 1 : -1;
        const c = Math.max(0, Math.min(1, curl01));
        const spread = [0.09 * (1 - c * 0.7), 0.02 * (1 - c * 0.7), -0.04 * (1 - c * 0.7), -0.10 * (1 - c * 0.7)];
        const fNames = ['Указательный', 'Средний', 'Безымянный', 'Мизинец'];
        fNames.forEach((fName, idx) => {
            const j1 = this.jointByName[`${fName} ${side}`];
            const j2 = this.jointByName[`${fName} ${side} 2`];
            if (j1) j1.rotation.set(spread[idx], 0, -sign * (0.04 + c * 1.25));
            if (j2) j2.rotation.set(0, 0, -sign * (0.05 + c * 1.45));
        });
        const t1 = this.jointByName[`Большой ${side}`];
        const t2 = this.jointByName[`Большой ${side} 2`];
        if (t1) t1.rotation.set(-0.48 + c * 0.28, 0, -sign * (0.08 + c * 0.65));
        if (t2) t2.rotation.set(0, 0, -sign * (0.08 + c * 0.85));
    }

    setHandPreset(side, preset) {
        const sign = side === 'L' ? 1 : -1;
        if (preset === 'open') { this.setHandCurl(side, 0.0); return; }
        if (preset === 'relaxed') { this.setHandCurl(side, 0.22); return; }
        if (preset === 'grip') { this.setHandCurl(side, 0.58); return; }
        if (preset === 'fist') { this.setHandCurl(side, 0.96); return; }
        if (preset === 'point') {
            this.setHandCurl(side, 0.92);
            const i1 = this.jointByName[`Указательный ${side}`];
            const i2 = this.jointByName[`Указательный ${side} 2`];
            if (i1) i1.rotation.set(0.04, 0, -sign * 0.04);
            if (i2) i2.rotation.set(0, 0, -sign * 0.05);
        }
    }

    exportCharacterJSON(name = 'character') {
        const meshes = {};
        for (const [k, v] of Object.entries(this.cages)) {
            meshes[k] = cloneEditableMesh(v);
        }
        return {
            version: 6,
            type: 'character',
            face_dir: '+Z',
            name,
            savedAt: new Date().toISOString(),
            proportions: { ...this.proportions },
            morph: { ...this.morph },
            subdiv: this.globalSubdiv,
            meshes,
            pose: this.getPoseData()
        };
    }

    importCharacterJSON(data) {
        if (!data) return;
        if (data.proportions) this.proportions = { ...DEFAULT_PROPORTIONS, ...data.proportions };
        if (data.morph) this.morph = { ...this.morph, ...data.morph };
        if (data.subdiv != null) this.globalSubdiv = data.subdiv;
        if (data.meshes) {
            const base = createAnatomicalMeshes();
            for (const [k, v] of Object.entries(data.meshes)) {
                if (v && Array.isArray(v.verts) && Array.isArray(v.quads)) {
                    base[k] = cloneEditableMesh(v);
                }
            }
            this.cages = base;
        }
        this.rebuildGeometryAndLayout(true);
        if (data.pose) this.applyPoseData(data.pose, true);
        else if (data.joints) this.applyPoseData(data.joints, true);
    }
}
