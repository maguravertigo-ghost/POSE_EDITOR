/**
 * Anatomical Skeleton & Proportions Schema
 * Coordinate system: +Y up, +Z forward (face direction), +X character's Left, -X character's Right.
 */

export const DEFAULT_PROPORTIONS = {
    heightScale: 1.0,
    headSize: 0.22,
    neckLen: 0.095,
    chestHeight: 0.29,
    abdomenHeight: 0.145,
    pelvisHeight: 0.16,
    clavicleOffsetX: 0.055,
    shoulderWidth: 0.205,
    shoulderYRatio: 0.80,
    hipWidth: 0.10,
    upperArmLen: 0.285,
    foreArmLen: 0.255,
    handLen: 0.095,
    thighLen: 0.425,
    shinLen: 0.40,
    footLen: 0.225,
    footHeight: 0.072
};

export const BODY_PRESETS = {
    neutral: {
        label: 'Манекен (нейтральный)',
        proportions: { ...DEFAULT_PROPORTIONS },
        morph: { gender: 'neutral', weight: 0.0, muscle: 0.1 }
    },
    male: {
        label: 'Мужчина',
        proportions: {
            ...DEFAULT_PROPORTIONS,
            heightScale: 1.03,
            headSize: 0.225,
            neckLen: 0.095,
            chestHeight: 0.305,
            abdomenHeight: 0.145,
            pelvisHeight: 0.155,
            clavicleOffsetX: 0.06,
            shoulderWidth: 0.23,
            hipWidth: 0.098,
            upperArmLen: 0.295,
            foreArmLen: 0.265,
            thighLen: 0.43,
            shinLen: 0.41
        },
        morph: { gender: 'male', weight: 0.0, muscle: 0.35 }
    },
    female: {
        label: 'Женщина',
        proportions: {
            ...DEFAULT_PROPORTIONS,
            heightScale: 0.96,
            headSize: 0.215,
            neckLen: 0.10,
            chestHeight: 0.265,
            abdomenHeight: 0.145,
            pelvisHeight: 0.165,
            clavicleOffsetX: 0.05,
            shoulderWidth: 0.175,
            hipWidth: 0.112,
            upperArmLen: 0.265,
            foreArmLen: 0.235,
            handLen: 0.088,
            thighLen: 0.415,
            shinLen: 0.39,
            footLen: 0.205
        },
        morph: { gender: 'female', weight: 0.0, muscle: 0.0 }
    }
};

export const MIRROR_PAIRS = [
    ['Ключица L', 'Ключица R'],
    ['Плечо L', 'Плечо R'],
    ['Локоть L', 'Локоть R'],
    ['Кисть L', 'Кисть R'],
    ['Большой L', 'Большой R'],
    ['Большой L 2', 'Большой R 2'],
    ['Указательный L', 'Указательный R'],
    ['Указательный L 2', 'Указательный R 2'],
    ['Средний L', 'Средний R'],
    ['Средний L 2', 'Средний R 2'],
    ['Безымянный L', 'Безымянный R'],
    ['Безымянный L 2', 'Безымянный R 2'],
    ['Мизинец L', 'Мизинец R'],
    ['Мизинец L 2', 'Мизинец R 2'],
    ['Бедро L', 'Бедро R'],
    ['Колено L', 'Колено R'],
    ['Стопа L', 'Стопа R'],
    ['Носок L', 'Носок R']
];

export const PART_GROUP_LABELS = {
    'Таз': 'Таз (овал)',
    'Живот': 'Живот (шарнир)',
    'Грудь': 'Грудная клетка',
    'Шея': 'Шея',
    'Голова': 'Голова',
    'Ключица L': 'Ключица L',
    'Плечо L': 'Плечо (верх) L',
    'Локоть L': 'Предплечье L',
    'Кисть L': 'Кисть L',
    'Бедро L': 'Бедро L',
    'Колено L': 'Голень L',
    'Стопа L': 'Стопа L',
    'Носок L': 'Пальцы стопы L'
};

/**
 * Compute world/local joint offsets from proportions.
 * Keeps feet planted cleanly near Y = 0 in rest pose.
 */
export function computeRigOffsets(p) {
    const s = p.heightScale || 1.0;
    const footH = p.footHeight * s;
    const shin = p.shinLen * s;
    const thigh = p.thighLen * s;
    const hipDrop = p.pelvisHeight * s * 0.22;
    const pelvisY = footH + shin + thigh + hipDrop;

    const clavicleLen = Math.max(0.03, (p.shoulderWidth - p.clavicleOffsetX) * s);
    const chestH = p.chestHeight * s;
    const abdH = p.abdomenHeight * s;
    const pelvH = p.pelvisHeight * s;

    return {
        scale: s,
        pelvisY,
        hipDrop,
        pelvisToAbdomen: pelvH * 0.52,
        abdomenToChest: abdH,
        chestToNeck: chestH,
        neckLen: p.neckLen * s,
        headSize: p.headSize * s,
        clavicleOffsetX: p.clavicleOffsetX * s,
        clavicleLen,
        shoulderY: chestH * (p.shoulderYRatio ?? 0.80),
        hipX: p.hipWidth * s,
        upperArmLen: p.upperArmLen * s,
        foreArmLen: p.foreArmLen * s,
        handLen: p.handLen * s,
        thighLen: thigh,
        shinLen: shin,
        footLen: p.footLen * s,
        footHeight: footH,
        pelvisHeight: pelvH,
        abdomenHeight: abdH,
        chestHeight: chestH
    };
}
