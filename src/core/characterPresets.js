import { createBoxGridMesh, createQuadConeMesh, createQuadCylinderMesh, createQuadPlateMesh, createQuadSphereMesh } from './subdivMesh.js';

function makeAtt(jointName, name, type, pos, rot, scale, color, meshData) {
    return {
        id: `preset_${name}_${Math.random().toString(36).slice(2, 6)}`,
        jointName,
        name,
        type,
        pos,
        rot,
        scale,
        color,
        meshData
    };
}

export const CHARACTER_PRESETS = [
    {
        id: 'mannequin',
        label: 'Базовый манекен',
        bodyPreset: 'neutral',
        buildAttachments() {
            return [];
        }
    },
    {
        id: 'king',
        label: 'Король в плаще',
        bodyPreset: 'male',
        buildAttachments() {
            const list = [];
            // Crown on Head Socket
            const crown = createQuadConeMesh(0.085, 0.10, 0.08, 8, 2);
            list.push(makeAtt('Сокет Голова', 'Корона', 'cone', [0, 0.01, 0], [0, 0, 0], [1, 1, 1], '#eab308', crown));

            // Royal tunic on Chest & Pelvis
            const tunic = createBoxGridMesh(0.30, 0.32, 0.22, 2, 3, 2, [0, 0.145, 0]);
            list.push(makeAtt('Грудь', 'Камзол', 'box', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#2e4a7d', tunic));

            const paulL = createQuadSphereMesh(0.065, 0.055, 0.065, 2, [0, 0.01, 0]);
            const paulR = createQuadSphereMesh(0.065, 0.055, 0.065, 2, [0, 0.01, 0]);
            list.push(makeAtt('Плечо L', 'Наплечник L', 'sphere', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#d4af37', paulL));
            list.push(makeAtt('Плечо R', 'Наплечник R', 'sphere', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#d4af37', paulR));

            // 3-Segment Articulated Cloak
            list.push(makeAtt('Плащ 1', 'Плащ верх', 'plate', [0, 0, 0], [0.06, 0, 0], [1.35, 1, 1], '#991b1b', createQuadPlateMesh(0.32, 0.34, 0.018, 3, 3)));
            list.push(makeAtt('Плащ 2', 'Плащ середина', 'plate', [0, 0, 0], [0.05, 0, 0], [1.55, 1, 1], '#881337', createQuadPlateMesh(0.34, 0.34, 0.018, 3, 3)));
            list.push(makeAtt('Плащ 3', 'Плащ низ', 'plate', [0, 0, 0], [0.05, 0, 0], [1.75, 1, 1], '#7f1d1d', createQuadPlateMesh(0.36, 0.34, 0.018, 3, 3)));

            // Royal Scepter in Right Hand Socket
            const staff = createQuadCylinderMesh(0.014, 0.014, -0.35, 0.62, 8, 4);
            list.push(makeAtt('Сокет Кисть R', 'Скипетр/Посох', 'cylinder', [0, 0, 0], [Math.PI * 0.48, 0, 0], [1, 1, 1], '#ca8a04', staff));
            const orb = createQuadSphereMesh(0.038, 0.038, 0.038, 2, [0, 0.64, 0]);
            list.push(makeAtt('Сокет Кисть R', 'Навершие скипетра', 'sphere', [0, 0, 0], [Math.PI * 0.48, 0, 0], [1, 1, 1], '#facc15', orb));

            return list;
        }
    },
    {
        id: 'mage',
        label: 'Маг в шляпе с посохом',
        bodyPreset: 'neutral',
        buildAttachments() {
            const list = [];
            // Wizard Hat brim + pointed cone
            const brim = createQuadCylinderMesh(0.18, 0.18, -0.01, 0.015, 12, 1);
            list.push(makeAtt('Сокет Голова', 'Поля шляпы', 'cylinder', [0, 0.0, 0], [-0.08, 0, 0], [1, 1, 1], '#312e81', brim));
            const cone = createQuadConeMesh(0.095, 0.01, 0.32, 10, 4);
            // Tilt tip slightly back
            cone.verts = cone.verts.map(([x, y, z]) => [x, y, z - Math.pow(Math.max(0, y / 0.32), 2) * 0.08]);
            list.push(makeAtt('Сокет Голова', 'Колпак шляпы', 'cone', [0, 0.01, 0], [-0.08, 0, 0], [1, 1, 1], '#3730a3', cone));

            // Mage Robe skirt & sleeves
            const skirt = createQuadConeMesh(0.22, 0.125, 0.46, 10, 4);
            list.push(makeAtt('Таз', 'Мантия (низ)', 'cone', [0, -0.38, 0], [0, 0, 0], [1, 1, 1], '#1e3a8a', skirt));
            list.push(makeAtt('Грудь', 'Мантия (грудь)', 'box', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#1e40af', createBoxGridMesh(0.29, 0.31, 0.21, 2, 3, 2, [0, 0.145, 0])));

            // Flared sleeves
            list.push(makeAtt('Локоть L', 'Рукав мага L', 'cone', [0, -0.25, 0], [0, 0, 0], [1, 1, 1], '#1d4ed8', createQuadConeMesh(0.085, 0.046, 0.25, 8, 3)));
            list.push(makeAtt('Локоть R', 'Рукав мага R', 'cone', [0, -0.25, 0], [0, 0, 0], [1, 1, 1], '#1d4ed8', createQuadConeMesh(0.085, 0.046, 0.25, 8, 3)));

            // Cloak
            list.push(makeAtt('Плащ 1', 'Плащ мага 1', 'plate', [0, 0, 0], [0.05, 0, 0], [1.2, 1, 1], '#312e81', createQuadPlateMesh(0.30, 0.34, 0.016, 3, 3)));
            list.push(makeAtt('Плащ 2', 'Плащ мага 2', 'plate', [0, 0, 0], [0.04, 0, 0], [1.4, 1, 1], '#1e1b4b', createQuadPlateMesh(0.32, 0.34, 0.016, 3, 3)));

            // Staff + crystal
            const staff = createQuadCylinderMesh(0.015, 0.017, -0.68, 0.86, 8, 4);
            list.push(makeAtt('Сокет Кисть R', 'Посох мага', 'cylinder', [0, 0, 0], [Math.PI * 0.45, 0, 0], [1, 1, 1], '#78350f', staff));
            const gem = createQuadSphereMesh(0.042, 0.058, 0.042, 1, [0, 0.90, 0]);
            list.push(makeAtt('Сокет Кисть R', 'Кристалл посоха', 'sphere', [0, 0, 0], [Math.PI * 0.45, 0, 0], [1, 1, 1], '#38bdf8', gem));

            return list;
        }
    },
    {
        id: 'zombie',
        label: 'Зомби в рваном костюме',
        bodyPreset: 'male',
        buildAttachments() {
            const list = [];
            // Tattered asymmetrical jacket
            const jacket = createBoxGridMesh(0.295, 0.31, 0.215, 2, 3, 2, [0, 0.145, 0]);
            list.push(makeAtt('Грудь', 'Рваный пиджак', 'box', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#3f4a3c', jacket));

            // Left sleeve full + left glove, right sleeve torn at upper arm
            list.push(makeAtt('Плечо L', 'Рукав пиджака L', 'cylinder', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#4d5c49', createQuadCylinderMesh(0.048, 0.056, 0, -0.27, 8, 3)));
            list.push(makeAtt('Локоть L', 'Предплечье рукав L', 'cylinder', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#4d5c49', createQuadCylinderMesh(0.040, 0.048, 0, -0.23, 8, 3)));
            list.push(makeAtt('Кисть L', 'Перчатка L', 'box', [0, -0.045, 0], [0, 0, 0], [1, 1, 1], '#27272a', createBoxGridMesh(0.036, 0.10, 0.082, 2, 2, 2, [0, 0, 0])));

            // Torn right sleeve (short jagged half)
            const tornSleeveR = createQuadCylinderMesh(0.052, 0.058, 0, -0.15, 8, 2);
            tornSleeveR.verts = tornSleeveR.verts.map(([x, y, z]) => y < -0.11 ? [x * 1.12, y + (x > 0 ? 0.02 : -0.02), z] : [x, y, z]);
            list.push(makeAtt('Плечо R', 'Оторванный рукав R', 'cylinder', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#4d5c49', tornSleeveR));

            // Asymmetric pants: full left pant leg, torn right pant at knee!
            list.push(makeAtt('Бедро L', 'Штанина L', 'cylinder', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#334155', createQuadCylinderMesh(0.068, 0.088, 0, -0.41, 8, 3)));
            list.push(makeAtt('Колено L', 'Штанина голень L', 'cylinder', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#334155', createQuadCylinderMesh(0.052, 0.066, 0, -0.37, 8, 3)));
            const tornLegR = createQuadCylinderMesh(0.072, 0.088, 0, -0.34, 8, 3);
            tornLegR.verts = tornLegR.verts.map(([x, y, z]) => y < -0.26 ? [x * 1.08, y + (z > 0 ? 0.04 : -0.02), z] : [x, y, z]);
            list.push(makeAtt('Бедро R', 'Рваная штанина R', 'cylinder', [0, 0, 0], [0, 0, 0], [1, 1, 1], '#334155', tornLegR));

            // Axe in Right Hand + Shield in Left Hand
            const handle = createQuadCylinderMesh(0.015, 0.015, -0.18, 0.46, 6, 3);
            list.push(makeAtt('Сокет Кисть R', 'Рукоять топора', 'cylinder', [0, 0, 0], [Math.PI * 0.48, 0, 0], [1, 1, 1], '#713f12', handle));
            const blade = createQuadPlateMesh(0.14, 0.16, 0.016, 2, 2);
            list.push(makeAtt('Сокет Кисть R', 'Лезвие топора', 'plate', [0, 0, 0], [Math.PI * 0.48, Math.PI * 0.5, 0], [1, 1, 1], '#94a3b8', blade));

            const shield = createQuadCylinderMesh(0.22, 0.22, -0.015, 0.015, 10, 1);
            list.push(makeAtt('Сокет Кисть L', 'Щит (дерево)', 'cylinder', [0.04, 0, 0], [0, 0, Math.PI * 0.5], [1, 1, 1], '#78350f', shield));

            return list;
        }
    }
];
