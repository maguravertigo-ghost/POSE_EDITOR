import { EASING_TYPES, evaluateEasing } from '../core/animationEngine.js';

export class AnimationEditorUI {
    constructor(engine, onSampled) {
        this.engine = engine;
        this.onSampled = onSampled;

        this.dockEl = document.getElementById('animDock');
        this.clipSelect = document.getElementById('animClipSelect');
        this.btnPlay = document.getElementById('animPlayBtn');
        this.btnStop = document.getElementById('animStopBtn');
        this.btnAddKey = document.getElementById('animAddKey');
        this.btnDelKey = document.getElementById('animDelKey');
        this.btnNewClip = document.getElementById('animNewClip');
        this.scrubber = document.getElementById('animScrubber');
        this.timeLabel = document.getElementById('animTimeLabel');
        this.keyMarkersEl = document.getElementById('animKeyMarkers');
        this.easingSelect = document.getElementById('animEasingSelect');
        this.curveCanvas = document.getElementById('animCurveCanvas');
        this.speedSelect = document.getElementById('animSpeedSelect');

        this.selectedKeyIdx = 0;
        this._bind();
        this.refresh();
    }

    _bind() {
        this.clipSelect.addEventListener('change', () => {
            this.engine.playing = false;
            this.engine.setActiveClip(this.clipSelect.value);
            this.selectedKeyIdx = 0;
            this.refresh();
            if (this.onSampled) this.onSampled();
        });

        this.btnPlay.addEventListener('click', () => {
            this.engine.playing = !this.engine.playing;
            this._updatePlayIcon();
        });

        this.btnStop.addEventListener('click', () => {
            this.engine.playing = false;
            this.engine.currentTime = 0;
            this.engine.sampleAt(0);
            this.refresh();
            if (this.onSampled) this.onSampled();
        });

        this.btnNewClip.addEventListener('click', () => {
            const name = prompt('Название нового клипа:', `Анимация ${this.engine.clips.length + 1}`);
            if (!name) return;
            this.engine.addCustomClip(name);
            this.selectedKeyIdx = 0;
            this.refresh();
        });

        this.btnAddKey.addEventListener('click', () => {
            this.engine.recordKeyframe(this.engine.currentTime, this.easingSelect.value);
            this.refresh();
        });

        this.btnDelKey.addEventListener('click', () => {
            this.engine.deleteKeyframe(this.selectedKeyIdx);
            this.selectedKeyIdx = Math.max(0, this.selectedKeyIdx - 1);
            this.refresh();
        });

        this.scrubber.addEventListener('input', () => {
            const clip = this.engine.getActiveClip();
            if (!clip) return;
            this.engine.playing = false;
            this.engine.currentTime = parseFloat(this.scrubber.value) * clip.duration;
            this.engine.sampleAt(this.engine.currentTime);
            this._updateTimeDisplay();
            this._updatePlayIcon();
            if (this.onSampled) this.onSampled();
        });

        this.easingSelect.addEventListener('change', () => {
            const clip = this.engine.getActiveClip();
            const kf = clip?.keyframes[this.selectedKeyIdx];
            if (kf) kf.easing = this.easingSelect.value;
            this.drawCurvePreview();
        });

        this.speedSelect.addEventListener('change', () => {
            this.engine.speed = parseFloat(this.speedSelect.value) || 1.0;
        });
    }

    _updatePlayIcon() {
        this.btnPlay.innerHTML = `<span class="material-icons sm">${this.engine.playing ? 'pause' : 'play_arrow'}</span>`;
    }

    _updateTimeDisplay() {
        const clip = this.engine.getActiveClip();
        const dur = clip ? clip.duration : 1;
        this.scrubber.value = String(dur > 0 ? this.engine.currentTime / dur : 0);
        this.timeLabel.textContent = `${this.engine.currentTime.toFixed(2)}s / ${dur.toFixed(2)}s`;
    }

    refresh() {
        this.clipSelect.innerHTML = '';
        for (const c of this.engine.clips) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            this.clipSelect.appendChild(opt);
        }
        this.clipSelect.value = this.engine.activeClipId;

        if (this.easingSelect.options.length === 0) {
            for (const [key, info] of Object.entries(EASING_TYPES)) {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = `${info.label} — ${info.desc}`;
                this.easingSelect.appendChild(opt);
            }
        }

        const clip = this.engine.getActiveClip();
        this.keyMarkersEl.innerHTML = '';
        if (clip) {
            clip.keyframes.forEach((kf, idx) => {
                const dot = document.createElement('button');
                dot.className = 'kf-marker' + (idx === this.selectedKeyIdx ? ' active' : '');
                const pct = clip.duration > 0 ? (kf.time / clip.duration) * 100 : 0;
                dot.style.left = `${pct}%`;
                dot.title = `Ключ ${idx + 1}: ${kf.time.toFixed(2)}s (${kf.easing})`;
                dot.addEventListener('click', () => {
                    this.selectedKeyIdx = idx;
                    this.engine.playing = false;
                    this.engine.currentTime = kf.time;
                    this.engine.sampleAt(kf.time);
                    this.refresh();
                    if (this.onSampled) this.onSampled();
                });
                this.keyMarkersEl.appendChild(dot);
            });

            const curKf = clip.keyframes[this.selectedKeyIdx] || clip.keyframes[0];
            if (curKf) this.easingSelect.value = curKf.easing || 'easeInOut';
        }

        this._updateTimeDisplay();
        this._updatePlayIcon();
        this.drawCurvePreview();
    }

    tick() {
        if (this.engine.playing) {
            this._updateTimeDisplay();
        }
    }

    drawCurvePreview() {
        const c = this.curveCanvas;
        if (!c) return;
        const ctx = c.getContext('2d');
        const W = c.width;
        const H = c.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0f131d';
        ctx.fillRect(0, 0, W, H);

        // Baseline box (allowing overshoot/anticipation margin)
        const padX = 6;
        const padY = 10;
        const uw = W - padX * 2;
        const uh = H - padY * 2;

        ctx.strokeStyle = '#242c3d';
        ctx.lineWidth = 1;
        ctx.strokeRect(padX, padY, uw, uh);

        const type = this.easingSelect.value || 'easeInOut';
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const val = evaluateEasing(type, t);
            const x = padX + t * uw;
            const y = padY + (1 - val) * uh;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}
