import * as THREE from 'three';

export const EASING_TYPES = {
    linear: { label: 'Linear', desc: 'Равномерно' },
    easeIn: { label: 'EaseIn', desc: 'Нарастание / Разгон' },
    easeOut: { label: 'EaseOut', desc: 'Плавное торможение' },
    easeInOut: { label: 'EaseInOut', desc: 'Плавный переход' },
    overshoot: { label: 'Overshoot', desc: 'Инерционный перехлёст' },
    anticipation: { label: 'Anticipation', desc: 'Предварительный замах' }
};

export function evaluateEasing(type, tRaw) {
    const t = Math.max(0, Math.min(1, tRaw));
    switch (type) {
        case 'easeIn':
            return t * t * t;
        case 'easeOut':
            return 1 - Math.pow(1 - t, 3);
        case 'easeInOut':
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        case 'overshoot': {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }
        case 'anticipation': {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return c3 * t * t * t - c1 * t * t;
        }
        default:
            return t;
    }
}

export const BUILTIN_ANIMATIONS = [
    {
        id: 'head_tilt_demo',
        name: 'Запрокидывание головы (EaseIn → EaseOut)',
        duration: 2.2,
        loop: true,
        keyframes: [
            {
                time: 0.0,
                easing: 'easeIn',
                pose: {
                    'Шея': { r: [0.08, 0, 0] },
                    'Голова': { r: [0.12, 0, 0] },
                    'Грудь': { r: [0.05, 0, 0] }
                }
            },
            {
                time: 0.55,
                easing: 'easeOut',
                pose: {
                    'Шея': { r: [-0.36, 0, 0] },
                    'Голова': { r: [-0.48, 0, 0] },
                    'Грудь': { r: [-0.14, 0, 0] }
                }
            },
            {
                time: 2.2,
                easing: 'easeOut',
                pose: {
                    'Шея': { r: [0.08, 0, 0] },
                    'Голова': { r: [0.12, 0, 0] },
                    'Грудь': { r: [0.05, 0, 0] }
                }
            }
        ]
    },
    {
        id: 'idle',
        name: 'Idle (дыхание)',
        duration: 2.4,
        loop: true,
        keyframes: [
            {
                time: 0.0,
                easing: 'easeInOut',
                pose: {
                    'Грудь': { r: [0.02, 0, 0] },
                    'Плечо L': { r: [0.04, 0, -0.14] },
                    'Плечо R': { r: [0.04, 0, 0.14] },
                    'Локоть L': { r: [-0.22, 0, 0] },
                    'Локоть R': { r: [-0.22, 0, 0] },
                    'Плащ 1': { r: [0.06, 0, 0] },
                    'Плащ 2': { r: [0.04, 0, 0] }
                }
            },
            {
                time: 1.2,
                easing: 'easeInOut',
                pose: {
                    'Грудь': { r: [-0.03, 0, 0] },
                    'Голова': { r: [0.03, 0.04, 0] },
                    'Плечо L': { r: [0.06, 0, -0.18] },
                    'Плечо R': { r: [0.06, 0, 0.18] },
                    'Локоть L': { r: [-0.26, 0, 0] },
                    'Локоть R': { r: [-0.26, 0, 0] },
                    'Плащ 1': { r: [0.12, 0, 0] },
                    'Плащ 2': { r: [0.08, 0, 0] }
                }
            },
            {
                time: 2.4,
                easing: 'easeInOut',
                pose: {
                    'Грудь': { r: [0.02, 0, 0] },
                    'Плечо L': { r: [0.04, 0, -0.14] },
                    'Плечо R': { r: [0.04, 0, 0.14] },
                    'Локоть L': { r: [-0.22, 0, 0] },
                    'Локоть R': { r: [-0.22, 0, 0] },
                    'Плащ 1': { r: [0.06, 0, 0] },
                    'Плащ 2': { r: [0.04, 0, 0] }
                }
            }
        ]
    },
    {
        id: 'walk',
        name: 'Walk (ходьба)',
        duration: 1.2,
        loop: true,
        keyframes: [
            {
                time: 0.0,
                easing: 'easeInOut',
                pose: {
                    'Таз': { r: [0.04, -0.10, 0] },
                    'Грудь': { r: [0.04, 0.10, 0] },
                    'Бедро L': { r: [-0.42, 0, 0] },
                    'Колено L': { r: [0.18, 0, 0] },
                    'Бедро R': { r: [0.36, 0, 0] },
                    'Колено R': { r: [0.24, 0, 0] },
                    'Плечо L': { r: [0.32, 0, -0.12] },
                    'Локоть L': { r: [-0.30, 0, 0] },
                    'Плечо R': { r: [-0.35, 0, 0.12] },
                    'Локоть R': { r: [-0.45, 0, 0] },
                    'Плащ 1': { r: [0.18, 0, 0] },
                    'Плащ 2': { r: [0.14, 0, 0] }
                }
            },
            {
                time: 0.6,
                easing: 'easeInOut',
                pose: {
                    'Таз': { r: [0.04, 0.10, 0] },
                    'Грудь': { r: [0.04, -0.10, 0] },
                    'Бедро L': { r: [0.36, 0, 0] },
                    'Колено L': { r: [0.24, 0, 0] },
                    'Бедро R': { r: [-0.42, 0, 0] },
                    'Колено R': { r: [0.18, 0, 0] },
                    'Плечо L': { r: [-0.35, 0, -0.12] },
                    'Локоть L': { r: [-0.45, 0, 0] },
                    'Плечо R': { r: [0.32, 0, 0.12] },
                    'Локоть R': { r: [-0.30, 0, 0] },
                    'Плащ 1': { r: [0.24, 0, 0] },
                    'Плащ 2': { r: [0.18, 0, 0] }
                }
            },
            {
                time: 1.2,
                easing: 'easeInOut',
                pose: {
                    'Таз': { r: [0.04, -0.10, 0] },
                    'Грудь': { r: [0.04, 0.10, 0] },
                    'Бедро L': { r: [-0.42, 0, 0] },
                    'Колено L': { r: [0.18, 0, 0] },
                    'Бедро R': { r: [0.36, 0, 0] },
                    'Колено R': { r: [0.24, 0, 0] },
                    'Плечо L': { r: [0.32, 0, -0.12] },
                    'Локоть L': { r: [-0.30, 0, 0] },
                    'Плечо R': { r: [-0.35, 0, 0.12] },
                    'Локоть R': { r: [-0.45, 0, 0] },
                    'Плащ 1': { r: [0.18, 0, 0] },
                    'Плащ 2': { r: [0.14, 0, 0] }
                }
            }
        ]
    },
    {
        id: 'run_cloak',
        name: 'Run с плащом',
        duration: 0.76,
        loop: true,
        keyframes: [
            {
                time: 0.0,
                easing: 'easeInOut',
                pose: {
                    'Таз': { r: [0.14, -0.16, 0] },
                    'Грудь': { r: [0.16, 0.18, 0] },
                    'Голова': { r: [-0.12, 0, 0] },
                    'Бедро L': { r: [-0.95, 0, 0] },
                    'Колено L': { r: [0.65, 0, 0] },
                    'Бедро R': { r: [0.68, 0, 0] },
                    'Колено R': { r: [0.88, 0, 0] },
                    'Плечо L': { r: [0.78, 0, -0.15] },
                    'Локоть L': { r: [-1.15, 0, 0] },
                    'Плечо R': { r: [-0.82, 0, 0.15] },
                    'Локоть R': { r: [-1.25, 0, 0] },
                    'Плащ 1': { r: [0.58, 0, 0] },
                    'Плащ 2': { r: [0.36, 0, 0.08] },
                    'Плащ 3': { r: [0.25, 0, -0.06] }
                }
            },
            {
                time: 0.38,
                easing: 'easeInOut',
                pose: {
                    'Таз': { r: [0.14, 0.16, 0] },
                    'Грудь': { r: [0.16, -0.18, 0] },
                    'Голова': { r: [-0.12, 0, 0] },
                    'Бедро L': { r: [0.68, 0, 0] },
                    'Колено L': { r: [0.88, 0, 0] },
                    'Бедро R': { r: [-0.95, 0, 0] },
                    'Колено R': { r: [0.65, 0, 0] },
                    'Плечо L': { r: [-0.82, 0, -0.15] },
                    'Локоть L': { r: [-1.25, 0, 0] },
                    'Плечо R': { r: [0.78, 0, 0.15] },
                    'Локоть R': { r: [-1.15, 0, 0] },
                    'Плащ 1': { r: [0.68, 0, 0] },
                    'Плащ 2': { r: [0.24, 0, -0.09] },
                    'Плащ 3': { r: [0.32, 0, 0.08] }
                }
            },
            {
                time: 0.76,
                easing: 'easeInOut',
                pose: {
                    'Таз': { r: [0.14, -0.16, 0] },
                    'Грудь': { r: [0.16, 0.18, 0] },
                    'Голова': { r: [-0.12, 0, 0] },
                    'Бедро L': { r: [-0.95, 0, 0] },
                    'Колено L': { r: [0.65, 0, 0] },
                    'Бедро R': { r: [0.68, 0, 0] },
                    'Колено R': { r: [0.88, 0, 0] },
                    'Плечо L': { r: [0.78, 0, -0.15] },
                    'Локоть L': { r: [-1.15, 0, 0] },
                    'Плечо R': { r: [-0.82, 0, 0.15] },
                    'Локоть R': { r: [-1.25, 0, 0] },
                    'Плащ 1': { r: [0.58, 0, 0] },
                    'Плащ 2': { r: [0.36, 0, 0.08] },
                    'Плащ 3': { r: [0.25, 0, -0.06] }
                }
            }
        ]
    },
    {
        id: 'weapon_swing',
        name: 'Взмах палкой / топором (Overshoot)',
        duration: 1.35,
        loop: true,
        keyframes: [
            {
                time: 0.0,
                easing: 'anticipation',
                pose: {
                    'Грудь': { r: [0.05, 0.18, 0] },
                    'Плечо R': { r: [-0.35, 0, 0.25] },
                    'Локоть R': { r: [-0.55, 0, 0] },
                    'Кисть R': { r: [0, 0, 0] },
                    'Плечо L': { r: [-0.25, 0, -0.35] },
                    'Локоть L': { r: [-0.65, 0, 0] },
                    'Плащ 1': { r: [0.10, 0, 0] }
                }
            },
            {
                time: 0.42,
                easing: 'overshoot',
                pose: {
                    'Грудь': { r: [-0.10, -0.38, 0] },
                    'Плечо R': { r: [-2.15, 0, 0.45] },
                    'Локоть R': { r: [-0.75, 0, 0] },
                    'Кисть R': { r: [-0.35, 0, 0] },
                    'Плечо L': { r: [0.20, 0, -0.45] },
                    'Локоть L': { r: [-0.55, 0, 0] },
                    'Плащ 1': { r: [0.35, -0.25, 0] },
                    'Плащ 2': { r: [0.25, -0.15, 0] }
                }
            },
            {
                time: 0.72,
                easing: 'easeOut',
                pose: {
                    'Грудь': { r: [0.24, 0.44, 0] },
                    'Плечо R': { r: [-0.42, 0.40, 0.12] },
                    'Локоть R': { r: [-0.28, 0, 0] },
                    'Кисть R': { r: [0.45, 0, 0] },
                    'Плечо L': { r: [0.30, 0, -0.30] },
                    'Локоть L': { r: [-0.70, 0, 0] },
                    'Плащ 1': { r: [0.45, 0.30, 0] },
                    'Плащ 2': { r: [0.30, 0.22, 0] }
                }
            },
            {
                time: 1.35,
                easing: 'easeOut',
                pose: {
                    'Грудь': { r: [0.05, 0.18, 0] },
                    'Плечо R': { r: [-0.35, 0, 0.25] },
                    'Локоть R': { r: [-0.55, 0, 0] },
                    'Кисть R': { r: [0, 0, 0] },
                    'Плечо L': { r: [-0.25, 0, -0.35] },
                    'Локоть L': { r: [-0.65, 0, 0] },
                    'Плащ 1': { r: [0.10, 0, 0] }
                }
            }
        ]
    }
];

const _eA = new THREE.Euler();
const _eB = new THREE.Euler();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _qOut = new THREE.Quaternion();

export class AnimationEngine {
    constructor(rig) {
        this.rig = rig;
        this.clips = BUILTIN_ANIMATIONS.map((c) => JSON.parse(JSON.stringify(c)));
        this.activeClipId = this.clips[0].id;
        this.playing = false;
        this.currentTime = 0;
        this.speed = 1.0;
    }

    getActiveClip() {
        return this.clips.find((c) => c.id === this.activeClipId) || this.clips[0];
    }

    setActiveClip(id) {
        const found = this.clips.find((c) => c.id === id);
        if (found) {
            this.activeClipId = found.id;
            this.currentTime = 0;
            this.sampleAt(0);
        }
    }

    addCustomClip(name) {
        const clip = {
            id: `clip_${Date.now()}`,
            name: name || `Клип ${this.clips.length + 1}`,
            duration: 1.5,
            loop: true,
            keyframes: [
                { time: 0, easing: 'easeInOut', pose: this.rig.getPoseData() },
                { time: 1.5, easing: 'easeInOut', pose: this.rig.getPoseData() }
            ]
        };
        this.clips.push(clip);
        this.activeClipId = clip.id;
        this.currentTime = 0;
        return clip;
    }

    recordKeyframe(time, easing = 'easeInOut') {
        const clip = this.getActiveClip();
        if (!clip) return;
        const t = Math.max(0, Math.min(clip.duration, Math.round(time * 100) / 100));
        const existing = clip.keyframes.find((k) => Math.abs(k.time - t) < 0.03);
        const pose = this.rig.getPoseData();
        if (existing) {
            existing.pose = pose;
            existing.easing = easing;
        } else {
            clip.keyframes.push({ time: t, easing, pose });
            clip.keyframes.sort((a, b) => a.time - b.time);
        }
    }

    deleteKeyframe(idx) {
        const clip = this.getActiveClip();
        if (!clip || clip.keyframes.length <= 1) return;
        clip.keyframes.splice(idx, 1);
    }

    update(dt) {
        if (!this.playing) return;
        const clip = this.getActiveClip();
        if (!clip || clip.duration <= 0) return;

        this.currentTime += dt * this.speed;
        if (this.currentTime >= clip.duration) {
            if (clip.loop) {
                this.currentTime = this.currentTime % clip.duration;
            } else {
                this.currentTime = clip.duration;
                this.playing = false;
            }
        }
        this.sampleAt(this.currentTime);
    }

    sampleAt(timeSec) {
        const clip = this.getActiveClip();
        if (!clip || !clip.keyframes.length) return;
        const kfs = clip.keyframes;
        if (kfs.length === 1) {
            this.rig.applyPoseData(kfs[0].pose, true);
            return;
        }

        const t = Math.max(0, Math.min(clip.duration, timeSec));
        let k0 = kfs[0];
        let k1 = kfs[kfs.length - 1];
        for (let i = 0; i < kfs.length - 1; i++) {
            if (t >= kfs[i].time && t <= kfs[i + 1].time) {
                k0 = kfs[i];
                k1 = kfs[i + 1];
                break;
            }
        }

        const span = Math.max(1e-5, k1.time - k0.time);
        const rawAlpha = Math.max(0, Math.min(1, (t - k0.time) / span));
        const alpha = evaluateEasing(k0.easing || 'easeInOut', rawAlpha);

        for (const j of this.rig.joints) {
            const name = j.userData.baseLabel;
            const e0 = k0.pose[name]?.r || [0, 0, 0];
            const e1 = k1.pose[name]?.r || [0, 0, 0];
            _eA.set(e0[0] || 0, e0[1] || 0, e0[2] || 0);
            _eB.set(e1[0] || 0, e1[1] || 0, e1[2] || 0);
            _qA.setFromEuler(_eA);
            _qB.setFromEuler(_eB);
            _qOut.slerpQuaternions(_qA, _qB, alpha);
            j.rotation.setFromQuaternion(_qOut);

            if (j.userData.isRoot && k0.pose[name]?.p && k1.pose[name]?.p) {
                const p0 = k0.pose[name].p;
                const p1 = k1.pose[name].p;
                j.position.set(
                    p0[0] + (p1[0] - p0[0]) * alpha,
                    p0[1] + (p1[1] - p0[1]) * alpha,
                    p0[2] + (p1[2] - p0[2]) * alpha
                );
            }
        }
    }
}
