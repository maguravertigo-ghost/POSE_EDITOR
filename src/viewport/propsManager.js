import * as THREE from 'three';

let propCounter = 1;

export class PropsManager {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'SceneProps';
        this.scene.add(this.group);

        this.props = [];
        this.material = new THREE.MeshStandardMaterial({
            color: 0x727c90,
            roughness: 0.85,
            metalness: 0.04
        });
        this.accentMat = new THREE.MeshStandardMaterial({
            color: 0x5c6475,
            roughness: 0.85,
            metalness: 0.04
        });
    }

    _makeBox(w, h, d, mat = this.material) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    }

    addProp(type) {
        const id = `prop_${propCounter++}`;
        const root = new THREE.Group();
        root.name = id;
        root.userData.isProp = true;
        root.userData.propType = type;

        let label = 'Объект';

        if (type === 'wall') {
            label = 'Стена';
            const wall = this._makeBox(2.6, 2.4, 0.14);
            wall.position.set(0, 1.2, 0);
            root.add(wall);
            root.position.set(0, 0, -0.55);
        } else if (type === 'corner') {
            label = 'Угол комнаты';
            const wallBack = this._makeBox(2.4, 2.4, 0.14);
            wallBack.position.set(0, 1.2, -1.13);
            const wallLeft = this._makeBox(0.14, 2.4, 2.4);
            wallLeft.position.set(-1.13, 1.2, 0);
            root.add(wallBack, wallLeft);
            root.position.set(0.3, 0, 0.2);
        } else if (type === 'table') {
            label = 'Стол';
            const top = this._makeBox(1.1, 0.05, 0.70, this.accentMat);
            top.position.set(0, 0.735, 0);
            root.add(top);
            for (const sx of [-0.48, 0.48]) {
                for (const sz of [-0.28, 0.28]) {
                    const leg = this._makeBox(0.05, 0.71, 0.05);
                    leg.position.set(sx, 0.355, sz);
                    root.add(leg);
                }
            }
            root.position.set(0, 0, 0.58);
        } else if (type === 'chair') {
            label = 'Стул';
            const seat = this._makeBox(0.44, 0.045, 0.44, this.accentMat);
            seat.position.set(0, 0.45, 0);
            const back = this._makeBox(0.44, 0.48, 0.045, this.accentMat);
            back.position.set(0, 0.71, -0.20);
            root.add(seat, back);
            for (const sx of [-0.18, 0.18]) {
                for (const sz of [-0.18, 0.18]) {
                    const leg = this._makeBox(0.04, 0.43, 0.04);
                    leg.position.set(sx, 0.215, sz);
                    root.add(leg);
                }
            }
            root.position.set(0, 0, -0.05);
        } else {
            label = 'Куб / опора';
            const box = this._makeBox(0.5, 0.5, 0.5, this.accentMat);
            box.position.set(0, 0.25, 0);
            root.add(box);
            root.position.set(0.55, 0, 0);
        }

        root.userData.propLabel = `${label} #${propCounter - 1}`;
        root.traverse((obj) => {
            if (obj.isMesh) obj.userData.propRoot = root;
        });

        this.group.add(root);
        this.props.push(root);
        return root;
    }

    removeProp(root) {
        if (!root) return;
        const idx = this.props.indexOf(root);
        if (idx !== -1) this.props.splice(idx, 1);
        root.traverse((obj) => {
            if (obj.isMesh && obj.geometry) obj.geometry.dispose();
        });
        this.group.remove(root);
    }

    clearAll() {
        for (const p of [...this.props]) {
            this.removeProp(p);
        }
    }

    getPickableMeshes() {
        const meshes = [];
        for (const p of this.props) {
            p.traverse((o) => { if (o.isMesh) meshes.push(o); });
        }
        return meshes;
    }

    serialize() {
        return this.props.map((p) => ({
            type: p.userData.propType,
            label: p.userData.propLabel,
            position: p.position.toArray(),
            rotation: [p.rotation.x, p.rotation.y, p.rotation.z],
            scale: p.scale.toArray()
        }));
    }

    deserialize(list) {
        this.clearAll();
        if (!Array.isArray(list)) return;
        for (const item of list) {
            const p = this.addProp(item.type || 'block');
            if (item.position) p.position.fromArray(item.position);
            if (item.rotation) p.rotation.set(...item.rotation);
            if (item.scale) p.scale.fromArray(item.scale);
        }
    }
}
