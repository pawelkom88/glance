import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';

const width = 1024;
const height = 1024;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// 1. Pure white background
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, width, height);

const cx = 512;
const cy = 490;
const r = 410;

// 2. Soft realistic studio shadow underneath
ctx.save();
const shadowGrad = ctx.createRadialGradient(cx, 930, 10, cx, 930, 260);
shadowGrad.addColorStop(0, 'rgba(30, 60, 120, 0.35)');
shadowGrad.addColorStop(0.4, 'rgba(30, 60, 120, 0.18)');
shadowGrad.addColorStop(0.8, 'rgba(30, 60, 120, 0.04)');
shadowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
ctx.fillStyle = shadowGrad;
ctx.beginPath();
ctx.ellipse(cx, 930, 280, 45, 0, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// 3. Outer Glass Disc Rim (3D bevel)
ctx.save();
const outerRimGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
outerRimGrad.addColorStop(0, '#7ab8ff');
outerRimGrad.addColorStop(0.3, '#3b8cf8');
outerRimGrad.addColorStop(0.7, '#1b64d4');
outerRimGrad.addColorStop(1, '#0c46a8');

ctx.beginPath();
ctx.arc(cx, cy, r, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(235, 244, 255, 0.6)';
ctx.fill();
ctx.lineWidth = 24;
ctx.strokeStyle = outerRimGrad;
ctx.stroke();
ctx.restore();

// 4. Secondary inner glass refraction ring
ctx.save();
ctx.beginPath();
ctx.arc(cx, cy, r - 32, 0, Math.PI * 2);
ctx.lineWidth = 14;
const innerRimGrad = ctx.createLinearGradient(cx + r, cy - r, cx - r, cy + r);
innerRimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
innerRimGrad.addColorStop(0.5, 'rgba(80, 160, 255, 0.5)');
innerRimGrad.addColorStop(1, 'rgba(10, 60, 160, 0.7)');
ctx.strokeStyle = innerRimGrad;
ctx.stroke();
ctx.restore();

// 5. Dish interior with radial glow
ctx.save();
ctx.beginPath();
ctx.arc(cx, cy, r - 46, 0, Math.PI * 2);
const dishGrad = ctx.createRadialGradient(cx, cy, 60, cx, cy, r - 46);
dishGrad.addColorStop(0, 'rgba(215, 235, 255, 0.95)');
dishGrad.addColorStop(0.6, 'rgba(140, 195, 255, 0.8)');
dishGrad.addColorStop(0.9, 'rgba(60, 140, 240, 0.88)');
dishGrad.addColorStop(1, 'rgba(20, 80, 190, 0.95)');
ctx.fillStyle = dishGrad;
ctx.fill();
ctx.restore();

// 6. Glowing Cyan Concentric Security Rings
ctx.save();
ctx.shadowColor = '#00f0ff';
ctx.shadowBlur = 35;
ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
ctx.lineWidth = 5;
ctx.beginPath();
ctx.arc(cx, cy, 280, 0, Math.PI * 2);
ctx.stroke();

ctx.lineWidth = 3;
ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
ctx.beginPath();
ctx.arc(cx, cy, 330, 0, Math.PI * 2);
ctx.stroke();
ctx.restore();

// 7. 3D Biometric Shield & Direct Encrypted Lock Motif
ctx.save();
ctx.shadowColor = '#00f0ff';
ctx.shadowBlur = 45;

function drawShield(scale = 1) {
  ctx.beginPath();
  const top = cy - 160 * scale;
  const left = cx - 140 * scale;
  const right = cx + 140 * scale;
  const midY = cy + 20 * scale;
  const bottom = cy + 170 * scale;

  ctx.moveTo(cx, top - 15 * scale);
  ctx.quadraticCurveTo(cx + 80 * scale, top - 20 * scale, right, top + 15 * scale);
  ctx.quadraticCurveTo(right + 5 * scale, midY, cx, bottom);
  ctx.quadraticCurveTo(left - 5 * scale, midY, left, top + 15 * scale);
  ctx.quadraticCurveTo(cx - 80 * scale, top - 20 * scale, cx, top - 15 * scale);
  ctx.closePath();
}

drawShield(1.08);
ctx.fillStyle = 'rgba(0, 220, 255, 0.18)';
ctx.fill();
ctx.lineWidth = 8;
ctx.strokeStyle = 'rgba(0, 245, 255, 0.9)';
ctx.stroke();

drawShield(0.96);
const shieldGrad = ctx.createLinearGradient(cx - 100, cy - 150, cx + 100, cy + 150);
shieldGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
shieldGrad.addColorStop(0.4, 'rgba(80, 180, 255, 0.5)');
shieldGrad.addColorStop(1, 'rgba(10, 80, 200, 0.8)');
ctx.fillStyle = shieldGrad;
ctx.fill();
ctx.lineWidth = 4;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
ctx.stroke();
ctx.restore();

// 8. Padlock inside Shield
ctx.save();
ctx.shadowColor = '#ffffff';
ctx.shadowBlur = 25;

// Shackle
ctx.beginPath();
ctx.arc(cx, cy - 30, 48, Math.PI, 0, false);
ctx.lineWidth = 20;
ctx.strokeStyle = '#ffffff';
ctx.lineCap = 'round';
ctx.stroke();

// Lock Body
ctx.beginPath();
ctx.roundRect(cx - 65, cy - 30, 130, 105, 20);
const lockGrad = ctx.createLinearGradient(cx - 65, cy - 30, cx + 65, cy + 75);
lockGrad.addColorStop(0, '#ffffff');
lockGrad.addColorStop(0.5, '#cce6ff');
lockGrad.addColorStop(1, '#70b2ff');
ctx.fillStyle = lockGrad;
ctx.fill();
ctx.lineWidth = 4;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
ctx.stroke();

// Keyhole
ctx.beginPath();
ctx.arc(cx, cy + 10, 14, 0, Math.PI * 2);
ctx.fillStyle = '#0a3578';
ctx.fill();

ctx.beginPath();
ctx.moveTo(cx - 7, cy + 15);
ctx.lineTo(cx + 7, cy + 15);
ctx.lineTo(cx + 10, cy + 45);
ctx.lineTo(cx - 10, cy + 45);
ctx.closePath();
ctx.fillStyle = '#0a3578';
ctx.fill();
ctx.restore();

// 9. Curved Glass Specular Highlight across top of disc
ctx.save();
ctx.beginPath();
ctx.ellipse(cx, cy - 180, 310, 160, 0, Math.PI, 0);
ctx.quadraticCurveTo(cx, cy - 80, cx - 310, cy - 180);
const glassGlint = ctx.createLinearGradient(cx, cy - 340, cx, cy - 80);
glassGlint.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
glassGlint.addColorStop(0.4, 'rgba(255, 255, 255, 0.25)');
glassGlint.addColorStop(1, 'rgba(255, 255, 255, 0)');
ctx.fillStyle = glassGlint;
ctx.fill();
ctx.restore();

const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('landing-page/voice-sync-privacy.png', buffer);
console.log('Saved landing-page/voice-sync-privacy.png');
