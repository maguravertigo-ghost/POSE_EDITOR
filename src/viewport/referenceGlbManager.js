import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ReferenceGlbManager {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();

        this.rulerGroup = new THREE.Group();
        this.rulerGroup.name = 'MetricHeightRuler';
        this.scene.add(this.rulerGroup);
        this.rulerVisible = true;
        this._buildHeightRuler();

        this.slots = {
            male: { label: 'Мужская база .glb', targetHeight: 1.80, group: null, displayMode: 'xray', visible: true, xOffset: 0 },
            female: { label: 'Женская база .glb', targetHeight: 1.68, group: null, displayMode: 'xray', visible: true, xOffset: 0 }
        };
        this.sideBySide = false;
    }

    _makeTextSprite(text, color = '#94a3b8') {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 150, 24);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.24, 0.072, 1);
        return sprite;
    }

    _buildHeightRuler() {
        const xBase = -0.68;
        const poleGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(xBase, 0, 0),
            new THREE.Vector3(xBase, 2.2, 0)
        ]);
        const poleMat = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.65 });
        this.rulerGroup.add(new THREE.Line(poleGeo, poleMat));

        const tickMatMajor = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.85 });
        const tickMatMinor = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45 });

        for (let i = 0; i <= 22; i++) {
            const y = Math.round(i * 10) / 100;
            const isMajor = i % 5 === 0;
            const len = isMajor ? 0.10 : 0.045;
            const tGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(xBase - len, y, 0),
                new THREE.Vector3(xBase + (isMajor ? 0.45 : 0.03), y, 0)
            ]);
            this.rulerGroup.add(new THREE.Line(tGeo, isMajor ? tickMatMajor : tickMatMinor));

            if (isMajor || i === 17 || i === 18) {
                const label = `${y.toFixed(2)}м`;
                const sp = this._makeTextSprite(label, isMajor ? '#93c5fd' : '#64748b');
                sp.position.set(xBase - 0.16, y, 0);
                this.rulerGroup.add(sp);
            }
        }
    }

    setRulerVisible(v) {
        this.rulerVisible = v;
        this.rulerGroup.visible = v;
    }

    async loadGlbIntoSlot(slotKey, file, targetHeight) {
        const slot = this.slots[slotKey];
        if (!slot) return null;
        if (targetHeight) slot.targetHeight = targetHeight;

        const buf = await file.arrayBuffer();
        return new Promise((resolve, reject) => {
            this.loader.parse(
                buf,
                '',
                (gltf) => {
                    if (slot.group) {
                        this.scene.remove(slot.group);
                    }
                    const wrapper = new THREE.Group();
                    wrapper.name = `RefGlb_${slotKey}`;
                    wrapper.add(gltf.scene);
                    slot.group = wrapper;
                    slot.fileName = file.name;
                    this.scene.add(wrapper);
                    this.applyDisplayMode(slotKey, slot.displayMode);
                    this.alignSlotToFeetAndHeight(slotKey, slot.targetHeight);
                    resolve(slot);
                },
                (err) => reject(err)
            );
        });
    }

    applyDisplayMode(slotKey, mode) {
        const slot = this.slots[slotKey];
        if (!slot) return;
        slot.displayMode = mode;
        if (!slot.group) return;

        const baseColor = slotKey === 'male' ? 0x38bdf8 : 0xf472b6;
        slot.group.traverse((obj) => {
            if (!obj.isMesh) return;
            if (!obj.userData._origMat) obj.userData._origMat = obj.material;

            if (mode === 'wireframe') {
                obj.material = new THREE.MeshBasicMaterial({
                    color: baseColor,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.45
                });
            } else if (mode === 'solid') {
                obj.material = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    roughness: 0.75,
                    metalness: 0.05,
                    transparent: true,
                    opacity: 0.85
                });
            } else {
                // X-Ray semi-transparent ghost
                obj.material = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    roughness: 0.65,
                    transparent: true,
                    opacity: 0.28,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            }
        });
    }

    setSlotVisible(slotKey, visible) {
        const slot = this.slots[slotKey];
        if (!slot) return;
        slot.visible = visible;
        if (slot.group) slot.group.visible = visible;
    }

    setSideBySide(enabled) {
        this.sideBySide = enabled;
        if (this.slots.male.group) this.alignSlotToFeetAndHeight('male', this.slots.male.targetHeight);
        if (this.slots.female.group) this.alignSlotToFeetAndHeight('female', this.slots.female.targetHeight);
    }

    alignSlotToFeetAndHeight(slotKey, targetHeightMeters) {
        const slot = this.slots[slotKey];
        if (!slot || !slot.group) return null;
        if (targetHeightMeters && targetHeightMeters > 0.2) {
            slot.targetHeight = targetHeightMeters;
        }

        const root = slot.group;
        root.position.set(0, 0, 0);
        root.scale.set(1, 1, 1);
        root.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) return null;

        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = size.y > 1e-4 ? (slot.targetHeight / size.y) : 1;
        root.scale.setScalar(scale);
        root.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);

        const xShift = this.sideBySide ? (slotKey === 'male' ? -0.52 : 0.52) : 0;
        root.position.set(xShift - center.x, -scaledBox.min.y, -center.z);
        root.updateMatrixWorld(true);
        return { scale, height: slot.targetHeight };
    }

    clearSlot(slotKey) {
        const slot = this.slots[slotKey];
        if (!slot || !slot.group) return;
        this.scene.remove(slot.group);
        slot.group = null;
        slot.fileName = null;
    }

    getHelperObjects() {
        const arr = [this.rulerGroup];
        if (this.slots.male.group) arr.push(this.slots.male.group);
        if (this.slots.female.group) arr.push(this.slots.female.group);
        return arr;
    }
}
