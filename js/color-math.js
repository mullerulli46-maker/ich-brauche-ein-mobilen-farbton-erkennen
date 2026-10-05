/**
 * Farb-Mathematik und Farbraum-Konvertierungen für den mobilen Farbton-Erkenner
 * Unterstützt: HEX, RGB, HSL, CMYK, CIE-L*a*b*, CIEDE2000 Delta-E, Farbharmonien,
 * Natürliche Farbbeschreibung und RAL-Farbton-Zuordnung.
 */

const ColorMath = (function () {
  'use strict';

  // Hilfsfunktion: Clamping 0..255
  function clamp(val, min = 0, max = 255) {
    return Math.max(min, Math.min(max, Math.round(val)));
  }

  // RGB zu HEX (#RRGGBB)
  function rgbToHex(r, g, b) {
    const toHex = (n) => clamp(n).toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // HEX zu RGB
  function hexToRgb(hex) {
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      clean = clean.split('').map((c) => c + c).join('');
    }
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  // RGB zu HSL (h: 0-360, s: 0-100%, l: 0-100%)
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatisch
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  // HSL zu RGB
  function hslToRgb(h, s, l) {
    h = (h % 360 + 360) % 360 / 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
      r: clamp(r * 255),
      g: clamp(g * 255),
      b: clamp(b * 255)
    };
  }

  // RGB zu CMYK (c, m, y, k: 0-100%)
  function rgbToCmyk(r, g, b) {
    let rPrime = r / 255;
    let gPrime = g / 255;
    let bPrime = b / 255;
    let k = 1 - Math.max(rPrime, gPrime, bPrime);

    if (k >= 0.999) {
      return { c: 0, m: 0, y: 0, k: 100 };
    }

    let c = (1 - rPrime - k) / (1 - k);
    let m = (1 - gPrime - k) / (1 - k);
    let y = (1 - bPrime - k) / (1 - k);

    return {
      c: Math.round(c * 100),
      m: Math.round(m * 100),
      y: Math.round(y * 100),
      k: Math.round(k * 100)
    };
  }

  // RGB (sRGB D65) zu CIE-L*a*b*
  function rgbToLab(r, g, b) {
    // 1. sRGB zu linearem RGB
    let rL = r / 255;
    let gL = g / 255;
    let bL = b / 255;

    rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
    gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
    bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

    // 2. Lineares RGB zu CIE XYZ (Referenz-Weißpunkt D65)
    let x = (rL * 0.4124 + gL * 0.3576 + bL * 0.1805) * 100;
    let y = (rL * 0.2126 + gL * 0.7152 + bL * 0.0722) * 100;
    let z = (rL * 0.0193 + gL * 0.1192 + bL * 0.9505) * 100;

    // Referenz D65: Xn=95.047, Yn=100.0, Zn=108.883
    let xR = x / 95.047;
    let yR = y / 100.0;
    let zR = z / 108.883;

    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

    let fx = f(xR);
    let fy = f(yR);
    let fz = f(zR);

    let L = 116 * fy - 16;
    let a = 500 * (fx - fy);
    let labB = 200 * (fy - fz);

    return { L, a, b: labB };
  }

  // CIE Delta-E 2000 (CIEDE2000) - modernster & genauester Farbabstand
  function deltaE2000(lab1, lab2) {
    const deg2rad = (deg) => (deg * Math.PI) / 180;
    const rad2deg = (rad) => (rad * 180) / Math.PI;

    const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

    const avgL = (L1 + L2) / 2;
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const avgC = (C1 + C2) / 2;

    const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
    const a1Prime = a1 * (1 + G);
    const a2Prime = a2 * (1 + G);

    const C1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
    const C2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);
    const avgCPrime = (C1Prime + C2Prime) / 2;

    let h1Prime = rad2deg(Math.atan2(b1, a1Prime));
    if (h1Prime < 0) h1Prime += 360;
    let h2Prime = rad2deg(Math.atan2(b2, a2Prime));
    if (h2Prime < 0) h2Prime += 360;

    let avgHPrime = Math.abs(h1Prime - h2Prime) > 180
      ? (h1Prime + h2Prime + 360) / 2
      : (h1Prime + h2Prime) / 2;

    let deltahPrime;
    if (Math.abs(h1Prime - h2Prime) <= 180) {
      deltahPrime = h2Prime - h1Prime;
    } else if (h2Prime <= h1Prime) {
      deltahPrime = h2Prime - h1Prime + 360;
    } else {
      deltahPrime = h2Prime - h1Prime - 360;
    }

    const deltaLPrime = L2 - L1;
    const deltaCPrime = C2Prime - C1Prime;
    const deltaHPrime = 2 * Math.sqrt(C1Prime * C2Prime) * Math.sin(deg2rad(deltahPrime / 2));

    const T =
      1 -
      0.17 * Math.cos(deg2rad(avgHPrime - 30)) +
      0.24 * Math.cos(deg2rad(2 * avgHPrime)) +
      0.32 * Math.cos(deg2rad(3 * avgHPrime + 6)) -
      0.2 * Math.cos(deg2rad(4 * avgHPrime - 63));

    const SL = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
    const SC = 1 + 0.045 * avgCPrime;
    const SH = 1 + 0.015 * avgCPrime * T;

    const deltaTheta = 30 * Math.exp(-Math.pow((avgHPrime - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(avgCPrime, 7) / (Math.pow(avgCPrime, 7) + Math.pow(25, 7)));
    const RT = -RC * Math.sin(deg2rad(2 * deltaTheta));

    const KL = 1;
    const KC = 1;
    const KH = 1;

    const termL = deltaLPrime / (KL * SL);
    const termC = deltaCPrime / (KC * SC);
    const termH = deltaHPrime / (KH * SH);

    return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
  }

  // Finde nächste Farbe aus einer Farbliste (z.B. RAL oder gängige Namen)
  function findClosestColor(targetRgb, palette) {
    if (!palette || palette.length === 0) return null;
    const targetLab = rgbToLab(targetRgb.r, targetRgb.g, targetRgb.b);

    let closest = null;
    let minDelta = Infinity;

    for (const item of palette) {
      const [r, g, b] = item.rgb;
      const itemLab = rgbToLab(r, g, b);
      const dE = deltaE2000(targetLab, itemLab);

      if (dE < minDelta) {
        minDelta = dE;
        closest = item;
      }
    }

    // Similarity Score in %: 0 deltaE = 100%, DeltaE >= 35 = 0%
    const similarity = Math.max(0, Math.min(100, Math.round((1 - minDelta / 35) * 100)));

    return {
      match: closest,
      deltaE: Math.round(minDelta * 10) / 10,
      similarityPercent: similarity
    };
  }

  // Ermittelt die Farbtemperatur (Warm, Kalt, Neutral)
  function getColorTemperature(r, g, b) {
    const hsl = rgbToHsl(r, g, b);
    if (hsl.s < 10) return { label: 'Neutral (Grauton)', type: 'neutral' };
    const h = hsl.h;
    if ((h >= 0 && h <= 65) || (h >= 320 && h <= 360)) {
      return { label: 'Warm (Gelb/Rot-Bereich)', type: 'warm' };
    } else if (h >= 150 && h <= 270) {
      return { label: 'Kühl (Blau/Türkis/Grün-Bereich)', type: 'cool' };
    } else if (h > 65 && h < 150) {
      return { label: 'Frisch / Neutral-Grün', type: 'balanced' };
    } else {
      return { label: 'Nuanciert (Violett/Magenta)', type: 'warm-cool' };
    }
  }

  // Wahrgenommene Helligkeit nach Rec. 601 (0 = Schwarz, 255 = Weiß)
  function getPerceivedBrightness(r, g, b) {
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Textkontrast-Farbe (#000000 oder #FFFFFF)
  function getContrastTextColor(r, g, b) {
    const brightness = getPerceivedBrightness(r, g, b);
    return brightness > 140 ? '#111827' : '#FFFFFF';
  }

  // Natürliche deutsche Farbton-Beschreibung
  function describeColor(r, g, b) {
    const hsl = rgbToHsl(r, g, b);
    const { h, s, l } = hsl;

    // Graustufen / Unbunt
    if (s < 8) {
      if (l > 92) return 'Reines Weiß / Fast Weiß';
      if (l > 75) return 'Sehr helles Lichtgrau';
      if (l > 55) return 'Helles Silbergrau';
      if (l > 35) return 'Mittelgrau';
      if (l > 15) return 'Dunkles Schiefer-/Anthrazitgrau';
      return 'Tiefschwarz / Fast Schwarz';
    }

    // Helligkeits-Präfix
    let lightDesc = '';
    if (l > 85) lightDesc = 'Sehr helles, sanftes';
    else if (l > 70) lightDesc = 'Helles, leichtes';
    else if (l > 45) lightDesc = '';
    else if (l > 25) lightDesc = 'Dunkles, sattes';
    else lightDesc = 'Sehr tiefes, dunkles';

    // Sättigungs-Präfix
    let satDesc = '';
    if (s < 20) satDesc = 'gedecktes, pastelliges';
    else if (s < 45) satDesc = 'dezentes';
    else if (s > 80) satDesc = 'leuchtendes, kräftiges';
    else satDesc = 'klares';

    // Grundfarbton nach Winkel
    let hueName = '';
    if (h < 15 || h >= 348) hueName = 'Rot';
    else if (h < 35) hueName = 'Orangerot / Koralle';
    else if (h < 50) hueName = 'Orange / Bernstein';
    else if (h < 70) hueName = 'Gelb / Gold';
    else if (h < 95) hueName = 'Gelbgrün / Limette';
    else if (h < 150) hueName = 'Grün / Smaragd';
    else if (h < 175) hueName = 'Mintgrün / Meergrün';
    else if (h < 200) hueName = 'Türkis / Petrol';
    else if (h < 225) hueName = 'Himmelblau / Azur';
    else if (h < 260) hueName = 'Blau / Königsblau';
    else if (h < 285) hueName = 'Indigo / Violettblau';
    else if (h < 315) hueName = 'Lila / Purpurviolett';
    else hueName = 'Magenta / Pink';

    // Zusätzliche Braun-Erkennung
    if (h >= 15 && h <= 45 && l < 45 && s > 20) {
      hueName = l < 25 ? 'Dunkelbraun' : 'Warmes Schokobraun';
    }

    const parts = [lightDesc, satDesc, hueName].filter(Boolean);
    const res = parts.join(' ');
    // Erstes Zeichen groß
    return res.charAt(0).toUpperCase() + res.slice(1);
  }

  // Farbharmonien berechnen
  function generateHarmonies(r, g, b) {
    const hsl = rgbToHsl(r, g, b);

    // Komplementär (+180°)
    const compHue = (hsl.h + 180) % 360;
    const compRgb = hslToRgb(compHue, hsl.s, hsl.l);

    // Analog (-30°, +30°)
    const ana1 = hslToRgb((hsl.h - 30 + 360) % 360, hsl.s, hsl.l);
    const ana2 = hslToRgb((hsl.h + 30) % 360, hsl.s, hsl.l);

    // Triadisch (+120°, +240°)
    const tri1 = hslToRgb((hsl.h + 120) % 360, hsl.s, hsl.l);
    const tri2 = hslToRgb((hsl.h + 240) % 360, hsl.s, hsl.l);

    // Split-Komplementär (+150°, +210°)
    const split1 = hslToRgb((hsl.h + 150) % 360, hsl.s, hsl.l);
    const split2 = hslToRgb((hsl.h + 210) % 360, hsl.s, hsl.l);

    // Monochromatisch (verschiedene Helligkeiten)
    const monoLight = hslToRgb(hsl.h, Math.max(10, hsl.s - 20), Math.min(92, hsl.l + 25));
    const monoMid = hslToRgb(hsl.h, hsl.s, hsl.l);
    const monoDark = hslToRgb(hsl.h, Math.min(100, hsl.s + 10), Math.max(12, hsl.l - 25));

    return {
      complementary: {
        title: 'Komplementär',
        colors: [
          { rgb: { r, g, b }, hex: rgbToHex(r, g, b), label: 'Basis' },
          { rgb: compRgb, hex: rgbToHex(compRgb.r, compRgb.g, compRgb.b), label: 'Gegenfarbe' }
        ]
      },
      analogous: {
        title: 'Analog',
        colors: [
          { rgb: ana1, hex: rgbToHex(ana1.r, ana1.g, ana1.b), label: '-30°' },
          { rgb: { r, g, b }, hex: rgbToHex(r, g, b), label: 'Basis' },
          { rgb: ana2, hex: rgbToHex(ana2.r, ana2.g, ana2.b), label: '+30°' }
        ]
      },
      triadic: {
        title: 'Triadisch',
        colors: [
          { rgb: { r, g, b }, hex: rgbToHex(r, g, b), label: 'Basis' },
          { rgb: tri1, hex: rgbToHex(tri1.r, tri1.g, tri1.b), label: '+120°' },
          { rgb: tri2, hex: rgbToHex(tri2.r, tri2.g, tri2.b), label: '+240°' }
        ]
      },
      monochromatic: {
        title: 'Monochrom',
        colors: [
          { rgb: monoLight, hex: rgbToHex(monoLight.r, monoLight.g, monoLight.b), label: 'Hell' },
          { rgb: monoMid, hex: rgbToHex(monoMid.r, monoMid.g, monoMid.b), label: 'Mitte' },
          { rgb: monoDark, hex: rgbToHex(monoDark.r, monoDark.g, monoDark.b), label: 'Dunkel' }
        ]
      }
    };
  }

  return {
    rgbToHex,
    hexToRgb,
    rgbToHsl,
    hslToRgb,
    rgbToCmyk,
    rgbToLab,
    deltaE2000,
    findClosestColor,
    getColorTemperature,
    getPerceivedBrightness,
    getContrastTextColor,
    describeColor,
    generateHarmonies
  };
})();

// Exportieren für Node oder Browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColorMath;
}
