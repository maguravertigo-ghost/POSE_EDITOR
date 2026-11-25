import * as THREE from 'three';

export const IK_CHAINS = {
    armL: {
        id: 'armL',
        label: 'Рука L',
        root: 'Плечо L',
        mid: 'Локоть L',
        end: 'Кисть L',
        poleSign: -1, // elbow points -Z
        defaultPoleOffset: new THREE.Vector3(0.08, 0, -0.35)
    },
    armR: {
        id: 'armR',
        label: 'Рука R',
        root: 'Плечо R',
        mid: 'Локоть R',
        end: 'Кисть R',
        poleSign: -1,
        defaultPoleOffset: new THREE.Vector3(-0.08, 0, -0.35)
    },
    legL: {
        id: 'legL',
        label: 'Нога L',
        root: 'Бедро L',
        mid: 'Колено L',
        end: 'Стопа L',
        poleSign: 1, // knee points +Z
        defaultPoleOffset: new THREE.Vector3(0.04, 0, 0.40)
    },
    legR: {
        id: 'legR',
        label: 'Нога R',
        root: 'Бедро R',
        mid: 'Колено R',
        end: 'Стопа R',
        poleSign: 1,
        defaultPoleOffset: new THREE.Vector3(-0.04, 0, 0.40)
    }
};

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _poleVec = new THREE.Vector3();
const _bendAxis = new THREE.Vector3();
const _poleDir = new THREE.Vector3();
const _desiredMid = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _worldQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _localQ = new THREE.Quaternion();

/**
 * Analytic 2-bone 3D IK solver writing clean Euler rotations directly onto rig joints.
 */
export function solveTwoBoneIK(rig, chainKey, targetWorldPos, poleWorldPos) {
    const cfg = IK_CHAINS[chainKey];
    if (!cfg) return false;
    const rootJ = rig.jointByName[cfg.root];
    const midJ = rig.jointByName[cfg.mid];
    const endJ = rig.jointByName[cfg.end];
    if (!rootJ || !midJ || !endJ) return false;

    rig.root.updateMatrixWorld(true);

    rootJ.getWorldPosition(_vA);
    midJ.getWorldPosition(_vB);
    endJ.getWorldPosition(_vC);

    const L1 = Math.max(0.01, _vA.distanceTo(_vB));
    const L2 = Math.max(0.01, _vB.distanceTo(_vC));

    _dir.subVectors(targetWorldPos, _vA);
    let D = _dir.length();
    const minD = Math.abs(L1 - L2) + 0.004;
    const maxD = L1 + L2 - 0.004;
    if (D < 1e-5) {
        _dir.set(0, -1, 0);
        D = minD;
    } else {
        _dir.divideScalar(D);
        D = Math.max(minD, Math.min(maxD, D));
    }

    const cosA = THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

    // Determine bend plane perpendicular to _dir using poleWorldPos
    _poleVec.subVectors(poleWorldPos, _vA);
    _poleDir.copy(_poleVec).addScaledVector(_dir, -_poleVec.dot(_dir));
    if (_poleDir.lengthSq() < 1e-6) {
        _poleDir.set(0, 0, cfg.poleSign);
        _poleDir.addScaledVector(_dir, -_poleDir.dot(_dir));
        if (_poleDir.lengthSq() < 1e-6) _poleDir.set(1, 0, 0);
    }
    _poleDir.normalize();

    // Desired mid-joint world position
    _desiredMid
        .copy(_vA)
        .addScaledVector(_dir, L1 * cosA)
        .addScaledVector(_poleDir, L1 * sinA);

    // Build rootJ world basis: -Y points from root -> desiredMid, Z aligns with poleSign * _poleDir
    _yAxis.subVectors(_vA, _desiredMid).normalize(); // -boneDir1
    _bendAxis.crossVectors(_yAxis, _poleDir);
    if (_bendAxis.lengthSq() < 1e-6) {
        _bendAxis.set(1, 0, 0);
    } else {
        _bendAxis.normalize();
    }
    // Ensure consistent hinge axis orientation (+X for poleSign=+1, -X? Wait: for arm poleSign=-1, cross(+Y, -Z) = -X -> flip by poleSign!)
    if (cfg.poleSign < 0) _bendAxis.negate();

    _xAxis.copy(_bendAxis);
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();

    _mat.makeBasis(_xAxis, _yAxis, _zAxis);
    _worldQ.setFromRotationMatrix(_mat);

    rootJ.parent.getWorldQuaternion(_parentQ);
    _localQ.copy(_parentQ).invert().multiply(_worldQ);
    rootJ.rotation.setFromQuaternion(_localQ);
    rootJ.updateMatrixWorld(true);

    // Solve midJ world basis: -Y points from desiredMid -> targetWorldPos, keeping same hinge axis _xAxis
    const targetClamped = _vA.clone().addScaledVector(_dir, D);
    _yAxis.subVectors(_desiredMid, targetClamped).normalize();
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();
    _mat.makeBasis(_xAxis, _yAxis, _zAxis);
    _worldQ.setFromRotationMatrix(_mat);

    rootJ.getWorldQuaternion(_parentQ);
    _localQ.copy(_parentQ).invert().multiply(_worldQ);
    midJ.rotation.setFromQuaternion(_localQ);
    midJ.updateMatrixWorld(true);

    return true;
}

export class IKManager {
    constructor(scene, rig) {
        this.scene = scene;
        this.rig = rig;
        this.enabled = false;
        this.pinFeet = false;

        this.targets = {};
        this.poles = {};
        this.pinnedFeetWorld = { legL: null, legR: null };
        this.pinnedFootQuat = { legL: null, legR: null };

        this.group = new THREE.Group();
        this.group.name = 'IKHandles';
        this.group.visible = false;
        this.scene.add(this.group);

        this.handleMeshes = [];
        this._buildHandles();
    }

    _buildHandles() {
        const targetMat = new THREE.MeshBasicMaterial({ color: 0x3ddc97, depthTest: false, transparent: true, opacity: 0.9 });
        const poleMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, transparent: true, opacity: 0.85, wireframe: true });

        for (const [key, cfg] of Object.entries(IK_CHAINS)) {
            const tMesh = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.052, 0.052), targetMat.clone());
            tMesh.renderOrder = 30;
            tMesh.userData.isIKHandle = true;
            tMesh.userData.ikType = 'target';
            tMesh.userData.chainKey = key;
            tMesh.userData.baseLabel = `IK ${cfg.label}`;
            this.group.add(tMesh);
            this.targets[key] = tMesh;
            this.handleMeshes.push(tMesh);

            const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), poleMat.clone());
            pMesh.renderOrder = 30;
            pMesh.userData.isIKHandle = true;
            pMesh.userData.ikType = 'pole';
            pMesh.userData.chainKey = key;
            pMesh.userData.baseLabel = `Pole ${cfg.label}`;
            this.group.add(pMesh);
            this.poles[key] = pMesh;
            this.handleMeshes.push(pMesh);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.group.visible = enabled;
        if (enabled) this.syncHandlesFromRig();
    }

    setPinFeet(pin) {
        this.pinFeet = pin;
        if (pin) {
            this.rig.root.updateMatrixWorld(true);
            for (const key of ['legL', 'legR']) {
                const cfg = IK_CHAINS[key];
                const endJ = this.rig.jointByName[cfg.end];
                if (endJ) {
                    const p = new THREE.Vector3();
                    const q = new THREE.Quaternion();
                    endJ.getWorldPosition(p);
                    endJ.getWorldQuaternion(q);
                    this.pinnedFeetWorld[key] = p;
                    this.pinnedFootQuat[key] = q;
                    this.targets[key].position.copy(p);
                }
            }
            this.syncPolesFromRig();
        }
    }

    syncPolesFromRig() {
        this.rig.root.updateMatrixWorld(true);
        for (const [key, cfg] of Object.entries(IK_CHAINS)) {
            const midJ = this.rig.jointByName[cfg.mid];
            if (!midJ) continue;
            const mp = new THREE.Vector3();
            midJ.getWorldPosition(mp);
            mp.add(cfg.defaultPoleOffset);
            this.poles[key].position.copy(mp);
        }
    }

    syncHandlesFromRig() {
        this.rig.root.updateMatrixWorld(true);
        for (const [key, cfg] of Object.entries(IK_CHAINS)) {
            const endJ = this.rig.jointByName[cfg.end];
            if (endJ) {
                endJ.getWorldPosition(this.targets[key].position);
            }
        }
        this.syncPolesFromRig();
    }

    solveChain(chainKey) {
        const t = this.targets[chainKey];
        const p = this.poles[chainKey];
        if (!t || !p) return;
        solveTwoBoneIK(this.rig, chainKey, t.position, p.position);
        if (this.pinFeet && (chainKey === 'legL' || chainKey === 'legR')) {
            this.pinnedFeetWorld[chainKey] = t.position.clone();
        }
    }

    solvePinnedFeet() {
        if (!this.pinFeet) return;
        for (const key of ['legL', 'legR']) {
            const targetPos = this.pinnedFeetWorld[key];
            if (!targetPos) continue;
            this.targets[key].position.copy(targetPos);
            solveTwoBoneIK(this.rig, key, targetPos, this.poles[key].position);

            // Keep foot level on ground if desired
            const cfg = IK_CHAINS[key];
            const endJ = this.rig.jointByName[cfg.end];
            if (endJ && this.pinnedFootQuat[key]) {
                const pQ = new THREE.Quaternion();
                endJ.parent.getWorldQuaternion(pQ);
                const lQ = pQ.invert().multiply(this.pinnedFootQuat[key]);
                endJ.rotation.setFromQuaternion(lQ);
            }
        }
    }
}
