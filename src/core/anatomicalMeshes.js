import {
    createBoxGridMesh,
    createQuadCylinderMesh,
    createQuadSphereMesh
} from './subdivMesh.js';

/**
 * Create sculpted low-poly Catmull-Clark quad meshes for each anatomical part.
 * Every part uses a true 3D vertex grid (editable in the Multiview Vertex Editor).
 */
export function createAnatomicalMeshes() {
    // 1. HEAD: sculpted quad sphere with tapered jaw & chin
    const head = createQuadSphereMesh(0.086, 0.112, 0.102, 2, [0, 0.112, 0.004]);
    head.refLength = 0.22;
    head.verts = head.verts.map(([x, y, z]) => {
        const ny = y / 0.22; // ~0..1
        // Taper jaw below eye line
        if (ny < 0.42) {
            const jawFactor = Math.max(0, (0.42 - ny) / 0.42);
            x *= 1 - jawFactor * 0.34;
            if (z > 0.01) {
                z += jawFactor * 0.018;
                y -= jawFactor * 0.012;
            } else if (z < -0.02) {
                // Narrow occipital base
                z *= 1 - jawFactor * 0.28;
            }
        }
        // Subtle cranium dome at top-back
        if (ny > 0.65 && z < 0) {
            z *= 1.06;
        }
        return [x, y, z];
    });

    // 2. NECK: tapered quad cylinder tilted slightly forward
    const neck = createQuadCylinderMesh(0.044, 0.056, -0.015, 0.11, 8, 3);
    neck.refLength = 0.095;
    neck.verts = neck.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.10));
        return [x, y, z + t * 0.012];
    });

    // 3. CHEST (Ribcage): sculpted box grid 2x4x2
    const chest = createBoxGridMesh(0.28, 0.31, 0.19, 2, 4, 2, [0, 0.145, 0]);
    chest.refLength = 0.29;
    chest.verts = chest.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.29));
        // Taper waist at bottom (t=0), flare ribcage (t=0.65), slope shoulders at top (t=1)
        let wx = 0.78 + 0.34 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.72);
        let wz = 0.80 + 0.28 * Math.sin(t * Math.PI * 0.85);
        if (t > 0.85) {
            wx *= 0.68;
            wz *= 0.72;
        }
        // Subtle sternum / pectoral forward curve (+Z) and spine hollow (-Z)
        let dz = 0;
        if (z > 0.02 && t > 0.35 && t < 0.88) dz += 0.018;
        if (z < -0.02 && Math.abs(x) < 0.03) dz += 0.012;
        return [x * wx, y, z * wz + dz];
    });

    // 4. ABDOMEN: slim waist hinge 2x3x2
    const abdomen = createBoxGridMesh(0.22, 0.165, 0.165, 2, 3, 2, [0, 0.072, 0]);
    abdomen.refLength = 0.145;
    abdomen.verts = abdomen.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.145));
        const pinch = 1 - 0.14 * Math.sin(t * Math.PI);
        return [x * pinch, y, z * pinch + (z > 0 ? 0.006 : 0)];
    });

    // 5. PELVIS: V-cut briefs/hips block 2x3x2
    const pelvis = createBoxGridMesh(0.27, 0.175, 0.185, 2, 3, 2, [0, 0.005, 0]);
    pelvis.refLength = 0.16;
    pelvis.verts = pelvis.verts.map(([x, y, z]) => {
        const t = (y + 0.082) / 0.165; // 0 bottom .. 1 top
        let wx = 0.62 + 0.44 * Math.sin(Math.min(1, t * 0.88) * Math.PI * 0.68);
        if (t < 0.2) wx *= 0.58;
        let wz = 0.72 + 0.34 * Math.sin(t * Math.PI * 0.8);
        // Subtle glute curve at -Z
        if (z < -0.02 && t > 0.15 && t < 0.75) z -= 0.018;
        return [x * wx, y, z * wz];
    });

    // 6. CLAVICLE L: deltoid-shoulder bridge along +X
    const clavicle = createBoxGridMesh(0.16, 0.095, 0.105, 3, 2, 2, [0.072, -0.005, 0]);
    clavicle.axis = 'x';
    clavicle.refLength = 0.15;
    clavicle.verts = clavicle.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, x / 0.15));
        const taper = 1 - t * 0.18;
        return [x, y * taper - t * 0.006, z * taper];
    });

    // 7. UPPER ARM L: deltoid swell + tapered biceps/triceps -> elbow
    const upperArm = createBoxGridMesh(0.095, 0.30, 0.095, 2, 4, 2, [0, -0.142, 0]);
    upperArm.refLength = 0.285;
    upperArm.verts = upperArm.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.285));
        // Wider deltoid cap near t=0.1, tapered at elbow t=1.0
        const w = 1.08 - 0.30 * t + 0.12 * Math.exp(-Math.pow((t - 0.12) / 0.16, 2));
        return [x * w, y, z * w];
    });

    // 8. FOREARM L: muscular swell near elbow -> slender oval wrist
    const forearm = createBoxGridMesh(0.078, 0.27, 0.078, 2, 4, 2, [0, -0.128, 0]);
    forearm.refLength = 0.255;
    forearm.verts = forearm.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.255));
        const swell = Math.exp(-Math.pow((t - 0.24) / 0.22, 2)) * 0.20;
        const wx = 0.88 - 0.32 * t + swell;
        const wz = 0.92 - 0.22 * t + swell;
        return [x * wx, y, z * wz];
    });

    // 9. HAND L: flat sculpted palm (width along Z, thin along X)
    const hand = createBoxGridMesh(0.028, 0.10, 0.072, 2, 3, 2, [0, -0.048, 0]);
    hand.refLength = 0.095;
    hand.verts = hand.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.095));
        const wz = 0.78 + 0.28 * Math.sin(Math.min(1, t * 0.9) * Math.PI * 0.72);
        const wx = 1.0 - 0.22 * t;
        return [x * wx, y, z * wz];
    });

    // 10. THIGH L: sculpted quadriceps & inner thigh tapering to knee
    const thigh = createBoxGridMesh(0.155, 0.445, 0.158, 2, 4, 2, [0, -0.212, 0]);
    thigh.refLength = 0.425;
    thigh.verts = thigh.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.425));
        const w = 1.08 - 0.40 * t + 0.08 * Math.exp(-Math.pow((t - 0.22) / 0.22, 2));
        const dz = (z > 0 ? 0.012 : 0) * Math.sin(t * Math.PI);
        return [x * w, y, z * w + dz];
    });

    // 11. SHIN L: knee -> gastrocnemius calf curve -> slender ankle
    const shin = createBoxGridMesh(0.108, 0.415, 0.112, 2, 4, 2, [0, -0.20, 0]);
    shin.refLength = 0.40;
    shin.verts = shin.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.40));
        const calf = Math.exp(-Math.pow((t - 0.28) / 0.20, 2));
        const wx = 0.92 - 0.36 * t + calf * 0.18;
        const wz = 0.94 - 0.34 * t + calf * 0.22;
        const dz = z < -0.01 ? -calf * 0.018 : 0;
        return [x * wx, y, z * wz + dz];
    });

    // 12. FOOT L: sculpted arch & heel along +Z
    const foot = createBoxGridMesh(0.082, 0.068, 0.185, 2, 2, 3, [0, -0.038, 0.042]);
    foot.axis = 'z';
    foot.refLength = 0.225;
    foot.verts = foot.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, (z + 0.05) / 0.185));
        const wy = 1.0 - 0.34 * t;
        const wx = 0.85 + 0.22 * t;
        return [x * wx, -0.070 + (y + 0.070) * wy, z];
    });

    // 13. TOES L: forefoot wedge along +Z
    const toes = createBoxGridMesh(0.088, 0.034, 0.082, 2, 2, 2, [0, -0.004, 0.035]);
    toes.axis = 'z';
    toes.refLength = 0.08;
    toes.verts = toes.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, z / 0.075));
        return [x * (1 - t * 0.26), y * (1 - t * 0.35), z];
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
        let sx = wFactor * (1 + muscle * 0.18 * t);
        let sz = wFactor * (1 + muscle * 0.14 * t);
        if (gender === 'male') {
            sx *= 0.98 + 0.14 * t;
            sz *= 1.03;
        } else if (gender === 'female') {
            sx *= 0.85;
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
            sx *= 1 - waist * 0.20;
            sz *= 1 - waist * 0.14;
        }
        x *= sx;
        z *= sz;
    } else if (partName === 'Таз') {
        let sx = 1 + weight * 0.26;
        let sz = 1 + weight * 0.26;
        if (gender === 'female') {
            sx *= 1.15;
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
        const s = 1 + weight * 0.14 + muscle * 0.16 - (gender === 'female' ? 0.12 : 0);
        y *= s;
        z *= s;
    } else if (partName.startsWith('Плечо') || partName.startsWith('Локоть')) {
        const s = wFactor * mFactor * (gender === 'female' ? 0.86 : 1.0);
        x *= s;
        z *= s;
    } else if (partName.startsWith('Бедро') || partName.startsWith('Колено')) {
        let s = wFactor * mFactor;
        if (gender === 'female' && partName.startsWith('Бедро')) s *= 1.06;
        if (gender === 'female' && partName.startsWith('Колено')) s *= 0.92;
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
