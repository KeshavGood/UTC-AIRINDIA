(function () {
      const IST_OFFSET_MIN = 330; // +05:30 in minutes

      const state = {
        direction: 'UTC_TO_IST', // 'UTC_TO_IST' | 'IST_TO_UTC'
        year: 2026,
        month: 11,
        day: 23,
        hours: 12,
        minutes: 0,
        displayHours: 12,
        displayMinutes: 0,
        liveTimer: null
      };

      // DOM elements
      const el = {
        btnSyncNow: document.getElementById('btn-sync-now'),
        skyCanvas: document.getElementById('sky-canvas'),
        liveUtcTime: document.getElementById('live-utc-time'),
        liveUtcDate: document.getElementById('live-utc-date'),
        liveIstTime: document.getElementById('live-ist-time'),
        liveIstDate: document.getElementById('live-ist-date'),
        badgeFrom: document.getElementById('badge-from'),
        badgeTo: document.getElementById('badge-to'),
        directionHint: document.getElementById('direction-hint'),
        btnSwap: document.getElementById('btn-swap'),
        quickInputLabel: document.getElementById('quick-input-label'),
        quickInput: document.getElementById('quick-input'),
        btnParseQuick: document.getElementById('btn-parse-quick'),
        inputDateLabel: document.getElementById('input-date-label'),
        inputTimeLabel: document.getElementById('input-time-label'),
        inputDate: document.getElementById('input-date'),
        inputHour: document.getElementById('input-hour'),
        inputMinute: document.getElementById('input-minute'),
        outputZoneLabel: document.getElementById('output-zone-label'),
        dayShiftBadge: document.getElementById('day-shift-badge'),
        outputTimeMain: document.getElementById('output-time-main'),
        outputDateFull: document.getElementById('output-date-full'),
        btnCopyResult: document.getElementById('btn-copy-result'),
        timeSlider: document.getElementById('time-slider'),
        sliderReadout: document.getElementById('slider-readout'),
        toastContainer: document.getElementById('toast-container')
      };

      const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      function pad(n) {
        return String(n).padStart(2, '0');
      }

      function formatTime(h, m, s) {
        const showSec = typeof s === 'number';
        return showSec ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
      }

      function populateTimeSelects() {
        for (let h = 0; h < 24; h++) {
          const opt = document.createElement('option');
          opt.value = String(h);
          opt.textContent = `${pad(h)} h`;
          el.inputHour.appendChild(opt);
        }
        for (let m = 0; m < 60; m++) {
          const opt = document.createElement('option');
          opt.value = String(m);
          opt.textContent = `${pad(m)} m`;
          el.inputMinute.appendChild(opt);
        }
      }

      function formatDateNice(y, mo, d) {
        const dt = new Date(Date.UTC(y, mo - 1, d));
        return `${WEEKDAYS[dt.getUTCDay()]}, ${pad(d)} ${MONTHS[mo - 1]} ${y}`;
      }

      function toISODate(y, mo, d) {
        return `${y}-${pad(mo)}-${pad(d)}`;
      }

      function showToast(message) {
        const node = document.createElement('div');
        node.className = 'toast-enter px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg border border-slate-700';
        node.textContent = message;
        el.toastContainer.appendChild(node);
        setTimeout(() => {
          node.style.opacity = '0';
          node.style.transition = 'opacity 0.2s ease';
          setTimeout(() => node.remove(), 220);
        }, 2000);
      }

      function copyText(text, successMsg) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast(successMsg || 'Copied to clipboard');
          }).catch(() => fallbackCopy(text, successMsg));
        } else {
          fallbackCopy(text, successMsg);
        }
      }

      function fallbackCopy(text, successMsg) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          showToast(successMsg || 'Copied to clipboard');
        } catch (e) {
          showToast('Unable to copy');
        }
        ta.remove();
      }

      function convertDateTime(y, mo, d, h, m, direction) {
        const baseMs = Date.UTC(y, mo - 1, d, h, m, 0);
        const deltaMin = direction === 'UTC_TO_IST' ? IST_OFFSET_MIN : -IST_OFFSET_MIN;
        const target = new Date(baseMs + deltaMin * 60000);

        const ty = target.getUTCFullYear();
        const tmo = target.getUTCMonth() + 1;
        const td = target.getUTCDate();
        const th = target.getUTCHours();
        const tm = target.getUTCMinutes();

        const startDayMs = Date.UTC(y, mo - 1, d);
        const endDayMs = Date.UTC(ty, tmo - 1, td);
        const dayDiff = Math.round((endDayMs - startDayMs) / 86400000);

        return { year: ty, month: tmo, day: td, hours: th, minutes: tm, dayDiff };
      }

      function parseFlexibleTime(raw) {
        const s = raw.trim().toUpperCase();
        if (!s) return null;

        // Match 12-hour format: e.g. "2:30 PM", "02:30PM", "2 PM"
        const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
        if (m12) {
          let h = parseInt(m12[1], 10);
          const min = m12[2] ? parseInt(m12[2], 10) : 0;
          const mer = m12[3];
          if (h < 1 || h > 12 || min < 0 || min > 59) return null;
          if (mer === 'AM') h = h === 12 ? 0 : h;
          else h = h === 12 ? 12 : h + 12;
          return { hours: h, minutes: min };
        }

        // Match 24-hour with colon: e.g. "14:30", "14:30Z", "09:05 UTC", "9:05"
        const m24c = s.match(/^(\d{1,2}):(\d{2})\s*(Z|UTC|IST)?$/);
        if (m24c) {
          const h = parseInt(m24c[1], 10);
          const min = parseInt(m24c[2], 10);
          if (h < 0 || h > 23 || min < 0 || min > 59) return null;
          return { hours: h, minutes: min };
        }

        // Match 4-digit compact military/aviation: e.g. "1430", "1430Z", "0015UTC"
        const m4 = s.match(/^(\d{2})(\d{2})\s*(Z|UTC|IST)?$/);
        if (m4) {
          const h = parseInt(m4[1], 10);
          const min = parseInt(m4[2], 10);
          if (h < 0 || h > 23 || min < 0 || min > 59) return null;
          return { hours: h, minutes: min };
        }

        return null;
      }

      function syncToNow() {
        const now = new Date();
        if (state.direction === 'UTC_TO_IST') {
          state.year = now.getUTCFullYear();
          state.month = now.getUTCMonth() + 1;
          state.day = now.getUTCDate();
          state.hours = now.getUTCHours();
          state.minutes = now.getUTCMinutes();
        } else {
          const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
          state.year = ist.getUTCFullYear();
          state.month = ist.getUTCMonth() + 1;
          state.day = ist.getUTCDate();
          state.hours = ist.getUTCHours();
          state.minutes = ist.getUTCMinutes();
        }
        state.displayHours = state.hours;
        state.displayMinutes = state.minutes;
        renderConverter();
      }

      function updateLiveClocks() {
        const now = new Date();
        const uy = now.getUTCFullYear();
        const umo = now.getUTCMonth() + 1;
        const ud = now.getUTCDate();
        const uh = now.getUTCHours();
        const um = now.getUTCMinutes();
        const us = now.getUTCSeconds();

        const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
        const iy = ist.getUTCFullYear();
        const imo = ist.getUTCMonth() + 1;
        const id = ist.getUTCDate();
        const ih = ist.getUTCHours();
        const im = ist.getUTCMinutes();
        const isec = ist.getUTCSeconds();

        el.liveUtcTime.textContent = formatTime(uh, um, us);
        el.liveUtcDate.textContent = formatDateNice(uy, umo, ud);

        el.liveIstTime.textContent = formatTime(ih, im, isec);
        el.liveIstDate.textContent = formatDateNice(iy, imo, id);
      }

      function renderConversionPanel(h, m) {
        const isUtcToIst = state.direction === 'UTC_TO_IST';
        const fromZone = isUtcToIst ? 'UTC' : 'IST';
        const toZone = isUtcToIst ? 'IST' : 'UTC';

        const res = convertDateTime(state.year, state.month, state.day, h, m, state.direction);
        const mainFormatted = formatTime(res.hours, res.minutes, null);
        const inputFormatted = formatTime(h, m, null);

        el.outputZoneLabel.textContent = `Converted ${toZone} Time`;
        if (el.outputTimeMain.textContent !== mainFormatted) {
          el.outputTimeMain.textContent = mainFormatted;
          el.outputTimeMain.classList.remove('digit-pop');
          void el.outputTimeMain.offsetWidth;
          el.outputTimeMain.classList.add('digit-pop');
        }
        el.outputDateFull.textContent = formatDateNice(res.year, res.month, res.day);
        el.sliderReadout.textContent = `${inputFormatted} ${fromZone} → ${mainFormatted} ${toZone}`;
        setSkyTargetHour(res.hours + res.minutes / 60);

        if (res.dayDiff === 0) {
          el.dayShiftBadge.textContent = 'Same Day';
          el.dayShiftBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
        } else if (res.dayDiff > 0) {
          el.dayShiftBadge.textContent = '+1 Day (Next Day)';
          el.dayShiftBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/25 text-amber-200 border border-amber-400/40';
        } else {
          el.dayShiftBadge.textContent = '-1 Day (Prev Day)';
          el.dayShiftBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/25 text-rose-200 border border-rose-400/40';
        }

      }

      function renderConverter() {
        const isUtcToIst = state.direction === 'UTC_TO_IST';
        const fromZone = isUtcToIst ? 'UTC' : 'IST';
        const toZone = isUtcToIst ? 'IST' : 'UTC';

        el.badgeFrom.textContent = fromZone;
        el.badgeTo.textContent = toZone;
        el.directionHint.textContent = isUtcToIst ? 'Adding 5 hours 30 minutes' : 'Subtracting 5 hours 30 minutes';

        el.quickInputLabel.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span><span>Quick Type (${fromZone})</span>`;
        el.inputDateLabel.textContent = `Date (${fromZone})`;
        el.inputTimeLabel.textContent = `Time 24h (${fromZone})`;

        el.inputDate.value = toISODate(state.year, state.month, state.day);
        el.inputHour.value = String(state.hours);
        el.inputMinute.value = String(state.minutes);

        state.displayHours = state.hours;
        state.displayMinutes = state.minutes;
        el.timeSlider.value = String(state.hours * 60 + state.minutes);

        renderConversionPanel(state.displayHours, state.displayMinutes);
      }

      // Event Listeners
      el.btnSyncNow.addEventListener('click', () => {
        syncToNow();
        showToast('Synced to current time');
      });

      el.btnSwap.addEventListener('click', () => {
        const res = convertDateTime(state.year, state.month, state.day, state.displayHours, state.displayMinutes, state.direction);
        state.direction = state.direction === 'UTC_TO_IST' ? 'IST_TO_UTC' : 'UTC_TO_IST';
        state.year = res.year;
        state.month = res.month;
        state.day = res.day;
        state.hours = res.hours;
        state.minutes = res.minutes;
        renderConverter();
      });

      el.inputDate.addEventListener('change', () => {
        const parts = el.inputDate.value.split('-').map(Number);
        if (parts.length === 3 && parts.every(n => !Number.isNaN(n))) {
          state.year = parts[0];
          state.month = parts[1];
          state.day = parts[2];
          renderConverter();
        }
      });

      el.inputHour.addEventListener('change', () => {
        state.hours = parseInt(el.inputHour.value, 10) || 0;
        renderConverter();
      });

      el.inputMinute.addEventListener('change', () => {
        state.minutes = parseInt(el.inputMinute.value, 10) || 0;
        renderConverter();
      });

      function applyQuickInput() {
        const parsed = parseFlexibleTime(el.quickInput.value);
        if (!parsed) {
          showToast('Invalid time format (try 14:30 or 1430Z)');
          return;
        }
        state.hours = parsed.hours;
        state.minutes = parsed.minutes;
        showToast(`Applied ${formatTime(parsed.hours, parsed.minutes, null)}`);
        renderConverter();
      }

      el.btnParseQuick.addEventListener('click', applyQuickInput);
      el.quickInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyQuickInput();
        }
      });

      el.timeSlider.addEventListener('input', () => {
        const mins = parseInt(el.timeSlider.value, 10);
        state.displayHours = Math.floor(mins / 60);
        state.displayMinutes = mins % 60;
        renderConversionPanel(state.displayHours, state.displayMinutes);
      });

      el.btnCopyResult.addEventListener('click', () => {
        const fromZone = state.direction === 'UTC_TO_IST' ? 'UTC' : 'IST';
        const toZone = state.direction === 'UTC_TO_IST' ? 'IST' : 'UTC';
        const res = convertDateTime(state.year, state.month, state.day, state.displayHours, state.displayMinutes, state.direction);
        const text = `${formatTime(state.displayHours, state.displayMinutes, null)} ${fromZone} (${formatDateNice(state.year, state.month, state.day)}) = ${formatTime(res.hours, res.minutes, null)} ${toZone} (${formatDateNice(res.year, res.month, res.day)})`;
        copyText(text, 'Conversion copied');
      });

      // ================================================================
      // Animated Alpine Lake Background (Day / Sunset / Aurora Night)
      // Inspired by snow-capped mountains, glowing sun, moon & aurora
      // ================================================================
      const sky = {
        targetHour: 12,
        currentHour: 12,
        rafId: null,
        width: 0,
        height: 0,
        stars: [],
        shootingStars: [],
        clouds: [],
        villageLights: [],
        planes: [],
        lastTime: 0
      };

      function setSkyTargetHour(hourFloat) {
        sky.targetHour = ((hourFloat % 24) + 24) % 24;
        const isNightTheme = sky.targetHour >= 18.8 || sky.targetHour < 6.2;
        document.body.classList.toggle('is-night', isNightTheme);
      }

      function initSkyAssets() {
        sky.stars = [];
        for (let i = 0; i < 150; i++) {
          sky.stars.push({
            x: Math.random(),
            y: Math.random() * 0.62,
            r: 0.6 + Math.random() * 1.6,
            phase: Math.random() * Math.PI * 2,
            speed: 0.8 + Math.random() * 2.2
          });
        }
        sky.clouds = [];
        for (let i = 0; i < 7; i++) {
          sky.clouds.push({
            x: Math.random() * 1.2 - 0.1,
            y: 0.10 + Math.random() * 0.28,
            scale: 0.65 + Math.random() * 0.85,
            speed: 0.004 + Math.random() * 0.007
          });
        }
        sky.villageLights = [];
        for (let i = 0; i < 16; i++) {
          sky.villageLights.push({
            x: 0.34 + Math.random() * 0.32,
            phase: Math.random() * Math.PI * 2
          });
        }
        sky.planes = [createPlane(true)];
      }

      function createPlane(startVisible) {
        const dir = Math.random() > 0.35 ? 1 : -1;
        const speed = 0.22 + Math.random() * 0.14; // fast pass across viewport in ~3-5s
        const y = 0.14 + Math.random() * 0.30;
        const vy = (Math.random() - 0.5) * 0.035;
        const scale = 0.85 + Math.random() * 0.45;
        return {
          x: startVisible ? (dir === 1 ? 0.22 : 0.78) : (dir === 1 ? -0.14 : 1.14),
          y,
          vx: dir * speed,
          vy,
          dir,
          scale,
          trail: [],
          strobePhase: Math.random() * Math.PI * 2
        };
      }

      function drawAeroplane(ctx, plane, w, h, tSec, nightFactor, twilightFactor) {
        const px = plane.x * w;
        const py = plane.y * h;
        const angle = Math.atan2(plane.vy * h, plane.vx * w);

        // Twin fading contrails behind the jet
        if (plane.trail.length > 1) {
          const trailCol = nightFactor > 0.45
            ? [165, 224, 255]
            : (twilightFactor > 0.3 ? [255, 212, 178] : [255, 255, 255]);
          const baseAlpha = nightFactor > 0.45 ? 0.30 : 0.55;
          const nx = -Math.sin(angle);
          const ny = Math.cos(angle);
          const offset = 3.2 * plane.scale;

          [-offset, offset].forEach(off => {
            for (let i = 1; i < plane.trail.length; i++) {
              const p0 = plane.trail[i - 1];
              const p1 = plane.trail[i];
              const frac = i / plane.trail.length;
              ctx.strokeStyle = rgbStr(trailCol, frac * frac * baseAlpha);
              ctx.lineWidth = (0.8 + (1 - frac) * 2.4) * plane.scale;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(p0.x * w + nx * off, p0.y * h + ny * off);
              ctx.lineTo(p1.x * w + nx * off, p1.y * h + ny * off);
              ctx.stroke();
            }
          });
        }

        // Sleek jetliner body oriented along velocity vector
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.scale(plane.scale, plane.scale);

        const bodyDay = [242, 248, 255];
        const bodyNight = [148, 176, 214];
        let bodyCol = lerpRGB(bodyDay, bodyNight, nightFactor);
        bodyCol = lerpRGB(bodyCol, [255, 204, 168], twilightFactor * 0.65);

        const wingDay = [202, 218, 238];
        const wingNight = [96, 124, 166];
        let wingCol = lerpRGB(wingDay, wingNight, nightFactor);
        wingCol = lerpRGB(wingCol, [232, 152, 128], twilightFactor * 0.6);

        // Swept main wings
        ctx.fillStyle = rgbStr(wingCol, 0.95);
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-10, -16);
        ctx.lineTo(-14, -15);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-14, 15);
        ctx.lineTo(-10, 16);
        ctx.closePath();
        ctx.fill();

        // Tail stabilizers
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(-21, -7.5);
        ctx.lineTo(-23, -7);
        ctx.lineTo(-18, 0);
        ctx.lineTo(-23, 7);
        ctx.lineTo(-21, 7.5);
        ctx.closePath();
        ctx.fill();

        // Sleek fuselage
        ctx.fillStyle = rgbStr(bodyCol, 0.98);
        ctx.beginPath();
        ctx.moveTo(19, 0);
        ctx.quadraticCurveTo(13, -3.2, -16, -2.1);
        ctx.lineTo(-21, 0);
        ctx.lineTo(-16, 2.1);
        ctx.quadraticCurveTo(13, 3.2, 19, 0);
        ctx.closePath();
        ctx.fill();

        // Subtle engine glow + night navigation & anti-collision strobe lights
        const strobe = Math.sin(tSec * 9 + plane.strobePhase) > 0.72 ? 1 : 0;
        if (nightFactor > 0.25) {
          // Warm glowing cabin windows strip
          ctx.fillStyle = `rgba(255, 228, 168, ${(0.85 * nightFactor).toFixed(2)})`;
          ctx.fillRect(-6, -0.7, 16, 1.4);

          // Red (port) & Green (starboard) wingtip nav lights
          ctx.fillStyle = `rgba(248, 113, 113, ${(0.95 * nightFactor).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(-11.5, -15.2, 1.9, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(74, 222, 128, ${(0.95 * nightFactor).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(-11.5, 15.2, 1.9, 0, Math.PI * 2);
          ctx.fill();

          // Blinking white anti-collision strobe on nose/tail
          if (strobe) {
            const stGrad = ctx.createRadialGradient(-20, 0, 0.5, -20, 0, 10);
            stGrad.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * nightFactor).toFixed(2)})`);
            stGrad.addColorStop(1, 'rgba(186, 230, 253, 0)');
            ctx.fillStyle = stGrad;
            ctx.beginPath();
            ctx.arc(-20, 0, 10, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (strobe) {
          // Crisp daytime specular glint
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(4, -1, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      function resizeSkyCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        sky.width = window.innerWidth;
        sky.height = window.innerHeight;
        el.skyCanvas.width = Math.floor(sky.width * dpr);
        el.skyCanvas.height = Math.floor(sky.height * dpr);
        const ctx = el.skyCanvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function lerp(a, b, t) {
        return a + (b - a) * t;
      }

      function clamp01(v) {
        return Math.max(0, Math.min(1, v));
      }

      function lerpRGB(c1, c2, t) {
        return [
          Math.round(lerp(c1[0], c2[0], t)),
          Math.round(lerp(c1[1], c2[1], t)),
          Math.round(lerp(c1[2], c2[2], t))
        ];
      }

      function rgbStr(c, a) {
        return a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      }

      // Keyframes across 24h for sky top, mid, horizon colors
      const SKY_KEYS = [
        { h: 0,    top: [7, 13, 30],     mid: [14, 28, 58],    hor: [22, 42, 74] },     // Midnight
        { h: 4.5,  top: [10, 18, 40],    mid: [24, 38, 72],    hor: [54, 58, 92] },     // Pre-dawn
        { h: 6.0,  top: [44, 78, 134],   mid: [198, 128, 114], hor: [252, 198, 132] },  // Sunrise
        { h: 8.5,  top: [38, 128, 212],  mid: [110, 184, 236], hor: [204, 234, 250] },  // Morning
        { h: 12.5, top: [26, 116, 206],  mid: [96, 178, 238],  hor: [202, 234, 252] },  // Midday
        { h: 16.5, top: [46, 112, 186],  mid: [148, 176, 212], hor: [240, 210, 170] },  // Late afternoon
        { h: 18.2, top: [46, 54, 112],   mid: [196, 108, 108], hor: [252, 164, 98] },   // Golden Sunset
        { h: 19.6, top: [18, 22, 54],    mid: [68, 44, 88],    hor: [144, 74, 102] },   // Dusk
        { h: 21.0, top: [8, 15, 36],     mid: [16, 30, 62],    hor: [24, 44, 78] },     // Night
        { h: 24.0, top: [7, 13, 30],     mid: [14, 28, 58],    hor: [22, 42, 74] }      // Wrap midnight
      ];

      function sampleSkyColors(h) {
        let i = 0;
        while (i < SKY_KEYS.length - 2 && h > SKY_KEYS[i + 1].h) i++;
        const k1 = SKY_KEYS[i];
        const k2 = SKY_KEYS[i + 1];
        const t = clamp01((h - k1.h) / Math.max(0.001, k2.h - k1.h));
        return {
          top: lerpRGB(k1.top, k2.top, t),
          mid: lerpRGB(k1.mid, k2.mid, t),
          hor: lerpRGB(k1.hor, k2.hor, t)
        };
      }

      function drawCloud(ctx, cx, cy, scale, color) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.arc(28, -8, 34, 0, Math.PI * 2);
        ctx.arc(62, -2, 26, 0, Math.PI * 2);
        ctx.arc(84, 8, 20, 0, Math.PI * 2);
        ctx.arc(-24, 8, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function drawMountains(ctx, w, h, horizonY, nightFactor, sunsetFactor) {
        // Distant back ridge
        const backColor = lerpRGB([112, 148, 184], [18, 29, 52], nightFactor);
        const backTinted = lerpRGB(backColor, [120, 74, 96], sunsetFactor * 0.55);
        ctx.fillStyle = rgbStr(backTinted);
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(w * 0.14, horizonY - h * 0.19);
        ctx.lineTo(w * 0.28, horizonY - h * 0.08);
        ctx.lineTo(w * 0.42, horizonY - h * 0.16);
        ctx.lineTo(w * 0.56, horizonY - h * 0.07);
        ctx.lineTo(w * 0.72, horizonY - h * 0.21);
        ctx.lineTo(w * 0.87, horizonY - h * 0.11);
        ctx.lineTo(w, horizonY - h * 0.17);
        ctx.lineTo(w, horizonY);
        ctx.closePath();
        ctx.fill();

        // Prominent snow-capped twin mountain ranges (left & right framing central lake valley)
        const midColor = lerpRGB([74, 108, 142], [13, 22, 42], nightFactor);
        const midTinted = lerpRGB(midColor, [84, 52, 74], sunsetFactor * 0.5);
        ctx.fillStyle = rgbStr(midTinted);
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(w * 0.08, horizonY - h * 0.16);
        ctx.lineTo(w * 0.20, horizonY - h * 0.11);
        ctx.lineTo(w * 0.31, horizonY - h * 0.17);
        ctx.lineTo(w * 0.46, horizonY - h * 0.03);
        ctx.lineTo(w * 0.57, horizonY - h * 0.04);
        ctx.lineTo(w * 0.69, horizonY - h * 0.19);
        ctx.lineTo(w * 0.81, horizonY - h * 0.10);
        ctx.lineTo(w * 0.94, horizonY - h * 0.18);
        ctx.lineTo(w, horizonY - h * 0.13);
        ctx.lineTo(w, horizonY);
        ctx.closePath();
        ctx.fill();

        // Snow caps highlights
        const snowCol = lerpRGB([242, 248, 255], [148, 178, 214], nightFactor);
        const snowTinted = lerpRGB(snowCol, [255, 206, 176], sunsetFactor * 0.65);
        ctx.fillStyle = rgbStr(snowTinted, 0.82 - nightFactor * 0.25);
        const peaks = [
          [w * 0.31, horizonY - h * 0.17, 0.045],
          [w * 0.69, horizonY - h * 0.19, 0.055],
          [w * 0.94, horizonY - h * 0.18, 0.045]
        ];
        peaks.forEach(([px, py, spread]) => {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - w * spread, py + h * 0.055);
          ctx.lineTo(px - w * spread * 0.3, py + h * 0.04);
          ctx.lineTo(px + w * spread * 0.25, py + h * 0.052);
          ctx.lineTo(px + w * spread * 0.9, py + h * 0.06);
          ctx.closePath();
          ctx.fill();
        });

        // Foreground pine shoreline silhouettes (left and right banks)
        const pineCol = lerpRGB([28, 56, 48], [6, 12, 22], nightFactor);
        ctx.fillStyle = rgbStr(pineCol);
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(0, horizonY - h * 0.07);
        for (let x = 0; x <= w * 0.32; x += 14) {
          const ridge = (1 - x / (w * 0.32)) * h * 0.065;
          const treeH = ridge + ((x * 13) % 11);
          ctx.lineTo(x + 7, horizonY - treeH);
          ctx.lineTo(x + 14, horizonY - ridge * 0.65);
        }
        ctx.lineTo(w * 0.34, horizonY);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(w, horizonY);
        ctx.lineTo(w, horizonY - h * 0.075);
        for (let x = w; x >= w * 0.68; x -= 14) {
          const ridge = ((x - w * 0.68) / (w * 0.32)) * h * 0.07;
          const treeH = ridge + ((x * 17) % 11);
          ctx.lineTo(x - 7, horizonY - treeH);
          ctx.lineTo(x - 14, horizonY - ridge * 0.65);
        }
        ctx.lineTo(w * 0.66, horizonY);
        ctx.closePath();
        ctx.fill();
      }

      function renderSkyFrame(ts) {
        const ctx = el.skyCanvas.getContext('2d');
        if (!ctx) return;

        const dt = Math.min(0.05, (ts - (sky.lastTime || ts)) / 1000);
        sky.lastTime = ts;
        const tSec = ts / 1000;

        // Smooth shortest-path interpolation of currentHour toward targetHour
        let diff = sky.targetHour - sky.currentHour;
        if (diff > 12) diff -= 24;
        if (diff < -12) diff += 24;
        sky.currentHour = (sky.currentHour + diff * Math.min(1, dt * 8) + 24) % 24;

        const hVal = sky.currentHour;
        const w = sky.width;
        const h = sky.height;
        const horizonY = h * 0.72;

        // Compute day / sunset / night weights
        // Night: 19:30 -> 05:30; Day: 06:30 -> 17:30; Twilight/Sunset around 05:30-07:00 & 17:00-19:30
        const nightFactor = (hVal >= 20 || hVal <= 4.8) ? 1
          : (hVal > 4.8 && hVal < 6.8) ? 1 - (hVal - 4.8) / 2.0
          : (hVal > 18.0 && hVal < 20.0) ? (hVal - 18.0) / 2.0
          : 0;

        const sunriseFactor = Math.max(0, 1 - Math.abs(hVal - 6.1) / 1.4);
        const sunsetFactor = Math.max(0, 1 - Math.abs(hVal - 18.2) / 1.5);
        const twilightFactor = Math.max(sunriseFactor, sunsetFactor);

        // 1. Sky Gradient
        const cols = sampleSkyColors(hVal);
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, rgbStr(cols.top));
        skyGrad.addColorStop(0.58, rgbStr(cols.mid));
        skyGrad.addColorStop(1, rgbStr(cols.hor));
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, horizonY + 2);

        // 2. Stars & Shooting Stars (Night)
        if (nightFactor > 0.05) {
          sky.stars.forEach(st => {
            const tw = 0.45 + 0.55 * Math.sin(tSec * st.speed + st.phase);
            ctx.fillStyle = `rgba(235, 245, 255, ${(tw * nightFactor * 0.9).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
            ctx.fill();
          });

          // Occasional shooting star
          if (Math.random() < 0.015 * nightFactor && sky.shootingStars.length < 3) {
            sky.shootingStars.push({
              x: (0.15 + Math.random() * 0.7) * w,
              y: (0.05 + Math.random() * 0.25) * h,
              vx: -260 - Math.random() * 180,
              vy: 140 + Math.random() * 110,
              life: 1.0
            });
          }
          sky.shootingStars = sky.shootingStars.filter(ss => {
            ss.x += ss.vx * dt;
            ss.y += ss.vy * dt;
            ss.life -= dt * 1.4;
            if (ss.life <= 0) return false;
            const grad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 0.16, ss.y - ss.vy * 0.16);
            grad.addColorStop(0, `rgba(255,255,255,${(ss.life * nightFactor).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(147,197,253,0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(ss.x, ss.y);
            ctx.lineTo(ss.x - ss.vx * 0.16, ss.y - ss.vy * 0.16);
            ctx.stroke();
            return true;
          });
        }

        // 3. Rippling Aurora Borealis Curtains (Night, matching reference video!)
        if (nightFactor > 0.12) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          for (let band = 0; band < 3; band++) {
            const baseY = h * (0.20 + band * 0.08);
            const grad = ctx.createLinearGradient(0, baseY - 90, 0, baseY + 75);
            const alpha = nightFactor * (band === 1 ? 0.36 : 0.25);
            if (band === 2) {
              grad.addColorStop(0, 'rgba(168, 85, 247, 0)');
              grad.addColorStop(0.45, `rgba(168, 85, 247, ${(alpha * 0.9).toFixed(3)})`);
              grad.addColorStop(0.75, `rgba(52, 211, 153, ${(alpha * 0.7).toFixed(3)})`);
              grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
            } else {
              grad.addColorStop(0, 'rgba(52, 211, 153, 0)');
              grad.addColorStop(0.42, `rgba(52, 211, 153, ${alpha.toFixed(3)})`);
              grad.addColorStop(0.78, `rgba(129, 140, 248, ${(alpha * 0.65).toFixed(3)})`);
              grad.addColorStop(1, 'rgba(129, 140, 248, 0)');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, baseY + 80);
            for (let x = 0; x <= w; x += 28) {
              const wave = Math.sin(x * 0.0045 + tSec * (0.45 + band * 0.18) + band * 2.1) * 34
                + Math.cos(x * 0.009 - tSec * 0.32 + band) * 16;
              ctx.lineTo(x, baseY + wave);
            }
            ctx.lineTo(w, baseY + 110);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }

        // 4. Sun (Day & Golden Sunrise/Sunset)
        let sunX = w * 0.5;
        let sunY = horizonY + 120;
        let sunVisible = 0;
        if (hVal >= 5.3 && hVal <= 19.1) {
          const dayProgress = (hVal - 5.3) / (19.1 - 5.3); // 0 -> 1
          sunX = lerp(w * 0.14, w * 0.86, dayProgress);
          const arc = Math.sin(dayProgress * Math.PI);
          sunY = horizonY - arc * (h * 0.50) + h * 0.02;
          sunVisible = clamp01(arc * 2.4);

          const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 170);
          const coreCol = twilightFactor > 0.35 ? 'rgba(255, 214, 140, 0.95)' : 'rgba(255, 252, 232, 0.98)';
          const midCol = twilightFactor > 0.35 ? 'rgba(255, 148, 86, 0.42)' : 'rgba(255, 238, 178, 0.38)';
          sunGlow.addColorStop(0, coreCol);
          sunGlow.addColorStop(0.22, midCol);
          sunGlow.addColorStop(1, 'rgba(255, 220, 150, 0)');
          ctx.fillStyle = sunGlow;
          ctx.beginPath();
          ctx.arc(sunX, sunY, 170, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(255, 253, 242, ${sunVisible.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
          ctx.fill();
        }

        // 5. Luminous Full Moon (Night, upper right like reference video!)
        let moonX = w * 0.78;
        let moonY = h * 0.21;
        if (nightFactor > 0.05) {
          const nightProg = hVal >= 18 ? (hVal - 18) / 12 : (hVal + 6) / 12;
          moonX = lerp(w * 0.82, w * 0.24, clamp01(nightProg));
          moonY = h * (0.24 - Math.sin(clamp01(nightProg) * Math.PI) * 0.09);

          const moonGlow = ctx.createRadialGradient(moonX, moonY, 16, moonX, moonY, 120);
          moonGlow.addColorStop(0, `rgba(226, 240, 255, ${(0.55 * nightFactor).toFixed(3)})`);
          moonGlow.addColorStop(0.4, `rgba(147, 197, 253, ${(0.18 * nightFactor).toFixed(3)})`);
          moonGlow.addColorStop(1, 'rgba(147, 197, 253, 0)');
          ctx.fillStyle = moonGlow;
          ctx.beginPath();
          ctx.arc(moonX, moonY, 120, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(241, 247, 255, ${(0.95 * nightFactor).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
          ctx.fill();

          // Subtle moon craters
          ctx.fillStyle = `rgba(194, 210, 232, ${(0.35 * nightFactor).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(moonX - 8, moonY - 5, 6, 0, Math.PI * 2);
          ctx.arc(moonX + 9, moonY + 6, 8, 0, Math.PI * 2);
          ctx.arc(moonX + 4, moonY - 10, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // 6. Drifting Clouds
        const cloudBase = lerpRGB([255, 255, 255], [34, 48, 76], nightFactor);
        const cloudTinted = lerpRGB(cloudBase, [255, 178, 134], twilightFactor * 0.72);
        const cloudAlpha = lerp(0.84, 0.32, nightFactor);
        sky.clouds.forEach(cl => {
          cl.x += cl.speed * dt;
          if (cl.x > 1.2) cl.x = -0.22;
          drawCloud(ctx, cl.x * w, cl.y * h, cl.scale, rgbStr(cloudTinted, cloudAlpha));
        });

        // 6.5 Fast Aeroplane Flybys (Day contrails / Sunset glow / Night nav & strobe lights)
        for (let i = sky.planes.length - 1; i >= 0; i--) {
          const pl = sky.planes[i];
          pl.x += pl.vx * dt;
          pl.y += pl.vy * dt;
          pl.trail.push({ x: pl.x, y: pl.y });
          if (pl.trail.length > 34) pl.trail.shift();
          drawAeroplane(ctx, pl, w, h, tSec, nightFactor, twilightFactor);
          if ((pl.dir === 1 && pl.x > 1.24) || (pl.dir === -1 && pl.x < -0.24)) {
            sky.planes.splice(i, 1);
          }
        }
        if (sky.planes.length === 0 && Math.random() < 0.03) {
          sky.planes.push(createPlane(false));
        }

        // 7. Snow-Capped Mountains & Pine Shorelines
        drawMountains(ctx, w, h, horizonY, nightFactor, twilightFactor);

        // 8. Mirror Alpine Lake with Shimmering Reflection
        const lakeGrad = ctx.createLinearGradient(0, horizonY, 0, h);
        lakeGrad.addColorStop(0, rgbStr(lerpRGB(cols.hor, cols.mid, 0.35)));
        lakeGrad.addColorStop(0.55, rgbStr(lerpRGB(cols.mid, cols.top, 0.45)));
        lakeGrad.addColorStop(1, rgbStr(lerpRGB(cols.top, [8, 16, 30], 0.5)));
        ctx.fillStyle = lakeGrad;
        ctx.fillRect(0, horizonY, w, h - horizonY);

        // Sun / Moon reflection shimmer column on lake
        const refX = sunVisible > 0.1 ? sunX : moonX;
        const refStrength = sunVisible > 0.1 ? sunVisible * 0.55 : nightFactor * 0.42;
        if (refStrength > 0.05) {
          const refCol = sunVisible > 0.1
            ? (twilightFactor > 0.35 ? [255, 185, 120] : [255, 248, 214])
            : [186, 224, 255];
          for (let row = 0; row < 18; row++) {
            const ry = horizonY + 8 + row * ((h - horizonY) / 19);
            const spread = 14 + row * 3.6 + Math.sin(tSec * 2.5 + row * 0.9) * 8;
            const alpha = refStrength * (1 - row / 20) * 0.75;
            ctx.fillStyle = rgbStr(refCol, alpha);
            ctx.fillRect(refX - spread, ry, spread * 2, 2.2);
          }
        }

        // Aurora reflection shimmer on lake at night
        if (nightFactor > 0.15) {
          for (let row = 0; row < 10; row++) {
            const ry = horizonY + 14 + row * ((h - horizonY) / 11);
            const offset = Math.sin(tSec * 1.4 + row) * 26;
            ctx.fillStyle = `rgba(52, 211, 153, ${(nightFactor * 0.14 * (1 - row / 12)).toFixed(3)})`;
            ctx.fillRect(w * 0.25 + offset, ry, w * 0.42, 3);
          }
        }

        // Distant glowing lakeside village lights at night
        if (nightFactor > 0.2) {
          sky.villageLights.forEach(vl => {
            const glow = 0.65 + 0.35 * Math.sin(tSec * 3.1 + vl.phase);
            const vx = vl.x * w;
            ctx.fillStyle = `rgba(255, 214, 130, ${(glow * nightFactor * 0.9).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(vx, horizonY - 1.5, 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255, 196, 100, ${(glow * nightFactor * 0.35).toFixed(3)})`;
            ctx.fillRect(vx - 1, horizonY + 2, 2, 8);
          });
        }

        sky.rafId = requestAnimationFrame(renderSkyFrame);
      }

      // Initialize
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
      initSkyAssets();
      resizeSkyCanvas();
      window.addEventListener('resize', resizeSkyCanvas);
      populateTimeSelects();
      syncToNow();
      sky.currentHour = sky.targetHour;
      updateLiveClocks();
      if (state.liveTimer) clearInterval(state.liveTimer);
      state.liveTimer = setInterval(updateLiveClocks, 1000);
      if (sky.rafId) cancelAnimationFrame(sky.rafId);
      sky.rafId = requestAnimationFrame(renderSkyFrame);
    })();

// Register Service Worker for offline PWA install support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
