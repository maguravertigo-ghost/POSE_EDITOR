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
    // 1. LOOMIS / ASARO HEAD: cranium with flat temporal side planes, brow ridge, cheekbones, jaw & chin
    const head = createQuadSphereMesh(0.084, 0.112, 0.102, 2, [0, 0.112, 0.004]);
    head.refLength = 0.22;
    head.verts = head.verts.map(([x, y, z]) => {
        const ny = y / 0.22; // ~0..1

        // Flatten temporal sides (Loomis sliced sides of cranial sphere)
        if (Math.abs(x) > 0.055 && ny > 0.25 && ny < 0.85) {
            x *= 0.88;
        }

        // Subtle brow ridge & cheekbone prominence at +Z
        if (z > 0.04 && ny >= 0.42 && ny <= 0.65) {
            z += 0.008;
        }

        // Jawline & tapered chin below ear level
        if (ny < 0.44) {
            const jaw = Math.max(0, (0.44 - ny) / 0.44);
            x *= 1 - jaw * 0.42;
            if (z > 0.01) {
                z += jaw * 0.022;
                y -= jaw * 0.014;
            } else if (z < -0.015) {
                // Undercut behind jaw into neck
                z *= 1 - jaw * 0.38;
            }
        }

        // Occipital curve at back of skull
        if (ny > 0.55 && ny < 0.85 && z < -0.04) {
            z -= 0.008;
        }
        return [x, y, z];
    });

    // 2. NECK: tapered cylinder tilted gently forward with trapezius base flare
    const neck = createQuadCylinderMesh(0.043, 0.058, -0.018, 0.112, 8, 3);
    neck.refLength = 0.095;
    neck.verts = neck.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.10));
        // Base flares slightly in X for trapezius transition
        const xFlare = t < 0.35 ? 1 + (0.35 - t) * 0.35 : 1.0;
        return [x * xFlare, y, z + t * 0.014];
    });

    // 3. CHEST / RIBCAGE: egg-barrel ribcage, sloped trapezius top, pectoral shelf, waist taper
    const chest = createBoxGridMesh(0.28, 0.31, 0.195, 2, 4, 2, [0, 0.145, 0]);
    chest.refLength = 0.29;
    chest.verts = chest.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.29));
        // Ribcage width curve: narrower waist -> broad upper ribcage -> sloped shoulders
        let wx = 0.72 + 0.38 * Math.sin(Math.min(1, t * 1.12) * Math.PI * 0.72);
        let wz = 0.76 + 0.30 * Math.sin(t * Math.PI * 0.85);
        if (t > 0.84) {
            wx *= 0.64;
            wz *= 0.74;
        }
        // Pectoral shelf (+Z) & slight thoracic kyphosis (-Z) + lumbar hollow at bottom
        let dz = 0;
        if (z > 0.02 && t > 0.40 && t < 0.86) dz += 0.024;
        if (z < -0.02 && t > 0.30 && t < 0.85) dz -= 0.010;
        if (z < -0.02 && Math.abs(x) < 0.03) dz += 0.014; // spinal furrow
        // Slight backward tilt of ribcage at top
        const tiltZ = (t - 0.5) * -0.012;
        return [x * wx, y, z * wz + dz + tiltZ];
    });

    // 4. ABDOMEN: tapered waist bridging ribcage arch to iliac crest
    const abdomen = createBoxGridMesh(0.215, 0.165, 0.165, 2, 3, 2, [0, 0.072, 0]);
    abdomen.refLength = 0.145;
    abdomen.verts = abdomen.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, y / 0.145));
        const pinch = 1 - 0.14 * Math.sin(t * Math.PI);
        const belly = z > 0.02 ? 0.008 * Math.sin(t * Math.PI) : 0;
        return [x * pinch, y, z * pinch + belly];
    });

    // 5. PELVIS: iliac crest + V-cut groin + gluteal volume
    const pelvis = createBoxGridMesh(0.275, 0.175, 0.19, 2, 3, 2, [0, 0.005, 0]);
    pelvis.refLength = 0.16;
    pelvis.verts = pelvis.verts.map(([x, y, z]) => {
        const t = (y + 0.082) / 0.165;
        let wx = 0.58 + 0.46 * Math.sin(Math.min(1, t * 0.9) * Math.PI * 0.68);
        if (t < 0.22) wx *= 0.52; // V-cut pelvic floor
        let wz = 0.70 + 0.36 * Math.sin(t * Math.PI * 0.8);
        if (z < -0.02 && t > 0.15 && t < 0.78) z -= 0.024; // glutes
        if (z > 0.02 && t > 0.3 && t < 0.8) z += 0.008;
        return [x * wx, y, z * wz];
    });

    // 6. CLAVICLE / DELTOID BRIDGE L: smooth shoulder cap connecting chest to upper arm
    const clavicle = createBoxGridMesh(0.16, 0.098, 0.108, 3, 2, 2, [0.072, -0.004, 0]);
    clavicle.axis = 'x';
    clavicle.refLength = 0.15;
    clavicle.verts = clavicle.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, x / 0.15));
        const cap = 1 + 0.10 * Math.sin(t * Math.PI);
        return [x, y * cap - t * 0.008, z * cap];
    });

    // 7. UPPER ARM L: deltoid teardrop cap + laterally-compressed biceps/triceps -> elbow
    const upperArm = createBoxGridMesh(0.088, 0.30, 0.098, 2, 4, 2, [0, -0.142, 0]);
    upperArm.refLength = 0.285;
    upperArm.verts = upperArm.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.285));
        const deltoid = Math.exp(-Math.pow((t - 0.14) / 0.18, 2)) * 0.24;
        const bicep = Math.exp(-Math.pow((t - 0.52) / 0.24, 2)) * 0.08;
        const wx = 0.94 - 0.28 * t + deltoid;
        const wz = 1.02 - 0.24 * t + deltoid * 0.8 + (z > 0 ? bicep : bicep * 0.6);
        return [x * wx, y, z * wz];
    });

    // 8. FOREARM L: upper extensor/brachioradialis swell -> flat oval wrist
    const forearm = createBoxGridMesh(0.076, 0.27, 0.082, 2, 4, 2, [0, -0.128, 0]);
    forearm.refLength = 0.255;
    forearm.verts = forearm.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.255));
        const swell = Math.exp(-Math.pow((t - 0.24) / 0.20, 2)) * 0.24;
        const wx = 0.86 - 0.38 * t + swell; // wrist flattens in X
        const wz = 0.96 - 0.22 * t + swell * 0.9; // wrist stays wider in Z
        return [x * wx, y, z * wz];
    });

    // 9. HAND PALM L: trapezoidal wedge palm + subtle arch + thumb-base pad (+Z)
    const hand = createBoxGridMesh(0.026, 0.098, 0.074, 2, 3, 2, [0, -0.048, 0]);
    hand.refLength = 0.095;
    hand.verts = hand.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.095));
        // Wider at knuckles (t=0.8), narrower at wrist (t=0)
        const wz = 0.72 + 0.34 * Math.sin(Math.min(1, t * 0.88) * Math.PI * 0.72);
        const wx = 1.0 - 0.26 * t;
        // Thenar pad thickness near thumb side (+Z, inner side)
        const thenar = (z > 0.01 && t < 0.65) ? 0.004 : 0;
        return [x * wx - Math.sign(x) * thenar, y, z * wz];
    });

    // 10. THIGH L: sweeping outer curve + quadriceps arc + knee taper
    const thigh = createBoxGridMesh(0.152, 0.445, 0.160, 2, 4, 2, [0, -0.212, 0]);
    thigh.refLength = 0.425;
    thigh.verts = thigh.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.425));
        const quad = Math.exp(-Math.pow((t - 0.34) / 0.26, 2)) * 0.12;
        const wx = 1.06 - 0.40 * t + (x > 0 ? quad * 0.8 : 0);
        const wz = 1.04 - 0.36 * t + (z > 0 ? quad : quad * 0.4);
        const dz = (z > 0 ? 0.016 : 0) * Math.sin(t * Math.PI);
        return [x * wx, y, z * wz + dz];
    });

    // 11. SHIN / CALF L: kneecap top -> asymmetric calf swell -> slim ankle
    const shin = createBoxGridMesh(0.106, 0.415, 0.112, 2, 4, 2, [0, -0.20, 0]);
    shin.refLength = 0.40;
    shin.verts = shin.verts.map(([x, y, z]) => {
        const t = Math.max(0, Math.min(1, -y / 0.40));
        const calf = Math.exp(-Math.pow((t - 0.28) / 0.18, 2));
        const wx = 0.90 - 0.38 * t + calf * 0.22;
        const wz = 0.94 - 0.34 * t + calf * 0.26;
        // Gastrocnemius pushes backward (-Z), tibia ridge stays crisp in front (+Z)
        const dz = z < -0.01 ? -calf * 0.022 : (t < 0.12 ? 0.008 : 0);
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
