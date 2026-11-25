import {
    createBoxGridMesh,
    createQuadCylinderMesh,
    createQuadSphereMesh
} from './subdivMesh.js';

/**
 * Anatomically sculpted Low-Poly Quad Cages (Loomis / Bridgman / Hampton proportions).
 * Works cleanly in both Low-Poly planar mode (0) and Catmull-Clark Smooth mode (1, 2).
 */
export function createAnatomicalMeshes() {
    // 1. ARTIST OVOID / LOOMIS HEAD: smooth egg cranium tapering cleanly to jaw & chin
    const head = createQuadSphereMesh(0.080, 0.112, 0.098, 2, [0, 0.112, 0.004]);
    head.refLength = 0.22;
    head.verts = head.verts.map(([x, y, z]) => {
        const ny = y / 0.22; // ~0..1

        // Slight Loomis side plane flatten
        if (Math.abs(x) > 0.052 && ny > 0.26 && ny < 0.84) {
            x *= 0.90;
        }

        // Gentle brow/cheekbone forward projection
        if (z > 0.035 && ny >= 0.42 && ny <= 0.65) {
            z += 0.006;
        }

        // Smooth tapered chin & jawline
        if (ny < 0.44) {
            const jaw = Math.max(0, (0.44 - ny) / 0.44);
            x *= 1 - jaw * 0.46;
            if (z > 0.01) {
                z += jaw * 0.018;
                y -= jaw * 0.012;
            } else if (z < -0.012) {
                z *= 1 - jaw * 0.42;
            }
        }
        return [x, y, z];
    });

    // 2. NECK: graceful tapered cylinder tilted slightly forward
    const neck = createQuadCylinderMesh(0.040, 0.052, -0.014, 0.110, 8, 3);
    neck.refLength = 0.095;
    neck.verts = neck.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.10));
        const xFlare = t < 0.35 ? 1 + (0.35 - t) * 0.28 : 1.0;
        return [x * xFlare, y, z + t * 0.012];
    });

    // 3. CHEST / RIBCAGE: clean tapered mannequin ribcage with natural waist transition
    const chest = createBoxGridMesh(0.265, 0.305, 0.188, 2, 4, 2, [0, 0.145, 0]);
    chest.refLength = 0.29;
    chest.verts = chest.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.29));
        let wx = 0.68 + 0.40 * Math.sin(Math.min(1, t * 1.10) * Math.PI * 0.72);
        let wz = 0.74 + 0.30 * Math.sin(t * Math.PI * 0.85);
        if (t > 0.85) {
            wx *= 0.62;
            wz *= 0.72;
        }
        let dz = 0;
        if (z > 0.02 && t > 0.42 && t < 0.85) dz += 0.020;
        if (z < -0.02 && t > 0.32 && t < 0.85) dz -= 0.008;
        if (z < -0.02 && Math.abs(x) < 0.03) dz += 0.012;
        const tiltZ = (t - 0.5) * -0.010;
        return [x * wx, y, z * wz + dz + tiltZ];
    });

    // 4. ABDOMEN / WAIST: clean hourglass / articulated waist segment
    const abdomen = createBoxGridMesh(0.205, 0.160, 0.158, 2, 3, 2, [0, 0.072, 0]);
    abdomen.refLength = 0.145;
    abdomen.verts = abdomen.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.145));
        const pinch = 1 - 0.18 * Math.sin(t * Math.PI);
        const belly = z > 0.02 ? 0.006 * Math.sin(t * Math.PI) : 0;
        return [x * pinch, y, z * pinch + belly];
    });

    // 5. PELVIS: classic sketch mannequin brief-shaped pelvis with hip socket transition
    const pelvis = createBoxGridMesh(0.270, 0.172, 0.185, 2, 3, 2, [0, 0.005, 0]);
    pelvis.refLength = 0.16;
    pelvis.verts = pelvis.verts.map(([x, y, z]) => {
        const t = (y + 0.082) / 0.165;
        let wx = 0.55 + 0.48 * Math.sin(Math.min(1, t * 0.92) * Math.PI * 0.68);
        if (t < 0.24) wx *= 0.48; // crisp V-cut brief bottom
        let wz = 0.68 + 0.36 * Math.sin(t * Math.PI * 0.8);
        if (z < -0.02 && t > 0.16 && t < 0.78) z -= 0.022;
        if (z > 0.02 && t > 0.3 && t < 0.8) z += 0.006;
        return [x * wx, y, z * wz];
    });

    // 6. CLAVICLE / DELTOID BRIDGE L
    const clavicle = createBoxGridMesh(0.155, 0.090, 0.100, 3, 2, 2, [0.070, -0.004, 0]);
    clavicle.axis = 'x';
    clavicle.refLength = 0.15;
    clavicle.verts = clavicle.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, x / 0.15));
        const cap = 1 + 0.08 * Math.sin(t * Math.PI);
        return [x, y * cap - t * 0.008, z * cap];
    });

    // 7. UPPER ARM L: clean tapered mannequin spindle connecting into spherical shoulder/elbow balls
    const upperArm = createBoxGridMesh(0.080, 0.285, 0.086, 2, 4, 2, [0, -0.142, 0]);
    upperArm.refLength = 0.285;
    upperArm.verts = upperArm.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.285));
        const swell = Math.sin(t * Math.PI) * 0.18;
        const deltoid = Math.exp(-Math.pow((t - 0.18) / 0.20, 2)) * 0.14;
        const wx = 0.76 - 0.14 * t + swell + deltoid;
        const wz = 0.80 - 0.12 * t + swell + deltoid * 0.8;
        return [x * wx, y, z * wz];
    });

    // 8. FOREARM L: clean forearm taper from elbow ball to wrist ball
    const forearm = createBoxGridMesh(0.068, 0.255, 0.074, 2, 4, 2, [0, -0.128, 0]);
    forearm.refLength = 0.255;
    forearm.verts = forearm.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.255));
        const swell = Math.exp(-Math.pow((t - 0.28) / 0.22, 2)) * 0.24;
        const wx = 0.76 - 0.26 * t + swell;
        const wz = 0.84 - 0.16 * t + swell * 0.9;
        return [x * wx, y, z * wz];
    });

    // 9. HAND PALM L
    const hand = createBoxGridMesh(0.025, 0.096, 0.072, 2, 3, 2, [0, -0.048, 0]);
    hand.refLength = 0.095;
    hand.verts = hand.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.095));
        const wz = 0.70 + 0.34 * Math.sin(Math.min(1, t * 0.88) * Math.PI * 0.72);
        const wx = 1.0 - 0.26 * t;
        const thenar = (z > 0.01 && t < 0.65) ? 0.004 : 0;
        return [x * wx - Math.sign(x) * thenar, y, z * wz];
    });

    // 10. THIGH L: graceful sweeping curve tapering cleanly into knee ball
    const thigh = createBoxGridMesh(0.144, 0.425, 0.152, 2, 4, 2, [0, -0.212, 0]);
    thigh.refLength = 0.425;
    thigh.verts = thigh.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.425));
        const midSwell = Math.sin(t * Math.PI) * 0.14;
        const quad = Math.exp(-Math.pow((t - 0.34) / 0.26, 2)) * 0.10;
        const wx = 0.92 - 0.34 * t + midSwell + (x > 0 ? quad * 0.7 : 0);
        const wz = 0.92 - 0.30 * t + midSwell + (z > 0 ? quad : quad * 0.4);
        const dz = (z > 0 ? 0.014 : 0) * Math.sin(t * Math.PI);
        return [x * wx, y, z * wz + dz];
    });

    // 11. SHIN / CALF L: classic sketch calf curve tapering into ankle ball
    const shin = createBoxGridMesh(0.100, 0.40, 0.106, 2, 4, 2, [0, -0.20, 0]);
    shin.refLength = 0.40;
    shin.verts = shin.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.40));
        const calf = Math.exp(-Math.pow((t - 0.30) / 0.19, 2));
        const wx = 0.80 - 0.32 * t + calf * 0.24;
        const wz = 0.84 - 0.28 * t + calf * 0.28;
        const dz = z < -0.01 ? -calf * 0.020 : (t < 0.12 ? 0.006 : 0);
        return [x * wx, y, z * wz + dz];
    });

    // 12. FOOT L: heel ball + elevated arch + sloped instep along +Z
    const foot = createBoxGridMesh(0.080, 0.070, 0.185, 2, 2, 3, [0, -0.036, 0.040]);
    foot.axis = 'z';
    foot.refLength = 0.225;
    foot.verts = foot.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, (z + 0.05) / 0.185));
        const wy = 1.0 - 0.40 * t;
        const wx = 0.80 + 0.26 * t;
        // Subtle arch lift under middle of sole
        const archLift = (y < -0.055 && t > 0.25 && t < 0.72) ? 0.008 : 0;
        return [x * wx, -0.070 + (y + 0.070) * wy + archLift, z];
    });

    // 13. TOES L: clean tapered toe wedge along +Z
    const toes = createBoxGridMesh(0.086, 0.030, 0.080, 2, 2, 2, [0, -0.004, 0.034]);
    toes.axis = 'z';
    toes.refLength = 0.08;
    toes.verts = toes.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, z / 0.075));
        return [x * (1 - t * 0.28), y * (1 - t * 0.38), z];
    });

    return {
        'Голова': head,
        'Шея': neck,
        'Грудь': chest,
        'Живот': abdomen,
        'Таз': pelvis,
        'Ключица L': clavicle,
        'Плечо L': upperArm,
        'Локоть L': forearm,
        'Кисть L': hand,
        'Бедро L': thigh,
        'Колено L': shin,
        'Стопа L': foot,
        'Носок L': toes
    };
}

/**
 * Smooth parametric body morph function applied to base vertices before Catmull-Clark subdivision.
 */
export function applyAnatomicalMorph(morph, partName, v) {
    if (!morph) return v;
    let [x, y, z] = v;
    const weight = morph.weight || 0;
    const muscle = morph.muscle || 0;
    const gender = morph.gender || 'neutral';

    const wFactor = 1 + weight * 0.28;
    const mFactor = 1 + muscle * 0.16;

    if (partName === 'Грудь') {
        const t = Math.max(0, Math.min(1, y / 0.29));
        let sx = wFactor * (1 + muscle * 0.20 * t);
        let sz = wFactor * (1 + muscle * 0.16 * t);
        if (gender === 'male') {
            sx *= 0.98 + 0.15 * t;
            sz *= 1.04;
        } else if (gender === 'female') {
            sx *= 0.84;
            sz *= 0.90;
            const bust = Math.exp(-Math.pow((t - 0.50) / 0.22, 2));
            if (z > 0.02) z += bust * 0.044 * (1 + weight * 0.2);
        }
        x *= sx;
        z *= sz;
    } else if (partName === 'Живот') {
        const t = Math.max(0, Math.min(1, y / 0.145));
        let sx = 1 + weight * 0.34 - muscle * 0.05;
        let sz = 1 + weight * 0.34 - muscle * 0.05;
        if (gender === 'female') {
            const waist = Math.exp(-Math.pow((t - 0.50) / 0.38, 2));
            sx *= 1 - waist * 0.22;
            sz *= 1 - waist * 0.15;
        }
        x *= sx;
        z *= sz;
    } else if (partName === 'Таз') {
        let sx = 1 + weight * 0.26;
        let sz = 1 + weight * 0.26;
        if (gender === 'female') {
            sx *= 1.16;
            sz *= 1.10;
            if (z < -0.02) z *= 1.14;
        } else if (gender === 'male') {
            sx *= 0.92;
        }
        x *= sx;
        z *= sz;
    } else if (partName === 'Голова') {
        if (gender === 'female') { x *= 0.95; z *= 0.97; }
        else if (gender === 'male') { x *= 1.03; }
    } else if (partName === 'Шея') {
        const s = 1 + weight * 0.10 + muscle * 0.14 - (gender === 'female' ? 0.12 : 0);
        x *= s;
        z *= s;
    } else if (partName.startsWith('Ключица')) {
        const s = 1 + weight * 0.14 + muscle * 0.18 - (gender === 'female' ? 0.12 : 0);
        y *= s;
        z *= s;
    } else if (partName.startsWith('Плечо') || partName.startsWith('Локоть')) {
        const s = wFactor * mFactor * (gender === 'female' ? 0.85 : 1.0);
        x *= s;
        z *= s;
    } else if (partName.startsWith('Бедро') || partName.startsWith('Колено')) {
        let s = wFactor * mFactor;
        if (gender === 'female' && partName.startsWith('Бедро')) s *= 1.07;
        if (gender === 'female' && partName.startsWith('Колено')) s *= 0.91;
        x *= s;
        z *= s;
    } else if (partName.startsWith('Кисть')) {
        const s = (1 + weight * 0.08) * (gender === 'female' ? 0.88 : 1.0);
        x *= s;
        z *= s;
    } else if (partName.startsWith('Стопа') || partName.startsWith('Носок')) {
        const s = (1 + weight * 0.08) * (gender === 'female' ? 0.90 : 1.0);
        x *= s;
        y *= s;
    }
    return [x, y, z];
}
