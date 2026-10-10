"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number; r: number; phase: number; speed: number };

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function LandingConversationFlow() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 1;
    let height = 1;
    let frame = 0;
    let raf = 0;

    const particles: Point[] = Array.from({ length: 44 }, (_, index) => ({
      x: 0,
      y: 0,
      r: index % 5 === 0 ? 2.5 : 1.4,
      phase: (index / 44) * Math.PI * 2,
      speed: 0.00028 + (index % 7) * 0.000025,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (time: number) => {
      const primary = cssVar("--brand-teal", "#00759a");
      const bright = cssVar("--accent", "#0b8bb5");
      const foreground = cssVar("--foreground", "#08171e");

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const orbitX = Math.max(120, width * 0.39);
      const orbitY = Math.max(84, height * 0.32);

      const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.min(width, height) * 0.42);
      glow.addColorStop(0, primary + "2f");
      glow.addColorStop(0.45, bright + "18");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1;
      for (let ring = 0; ring < 3; ring += 1) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, orbitX * (0.45 + ring * 0.2), orbitY * (0.45 + ring * 0.2), -0.18, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8 - 0.5;
        const sx = cx + Math.cos(angle) * orbitX;
        const sy = cy + Math.sin(angle) * orbitY;
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = primary;
        ctx.setLineDash([4, 9]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx + Math.sin(angle) * 40, cy - Math.cos(angle) * 26, cx, cy);
        ctx.stroke();
        ctx.restore();
      }

      particles.forEach((particle, index) => {
        const t = reduced ? particle.phase : particle.phase + time * particle.speed;
        const lane = index % 8;
        const laneAngle = (Math.PI * 2 * lane) / 8 - 0.5;
        const dir = index % 3 === 0 ? -1 : 1;
        const progress = ((t / (Math.PI * 2)) % 1 + 1) % 1;
        const p = dir > 0 ? progress : 1 - progress;
        const sx = cx + Math.cos(laneAngle) * orbitX;
        const sy = cy + Math.sin(laneAngle) * orbitY;
        const bendX = cx + Math.sin(laneAngle) * 42;
        const bendY = cy - Math.cos(laneAngle) * 30;

        const q0x = (1 - p) * sx + p * bendX;
        const q0y = (1 - p) * sy + p * bendY;
        const q1x = (1 - p) * bendX + p * cx;
        const q1y = (1 - p) * bendY + p * cy;
        particle.x = (1 - p) * q0x + p * q1x;
        particle.y = (1 - p) * q0y + p * q1y;

        const alpha = 0.2 + Math.sin(progress * Math.PI) * 0.75;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = index % 4 === 0 ? bright : primary;
        ctx.shadowColor = primary;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      const pulse = reduced ? 1 : 1 + Math.sin(time * 0.0024) * 0.05;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);

      const core = ctx.createRadialGradient(-12, -16, 4, 0, 0, 62);
      core.addColorStop(0, "#42c5eb");
      core.addColorStop(0.48, primary);
      core.addColorStop(1, "#004a66");
      ctx.fillStyle = core;
      ctx.shadowColor = primary;
      ctx.shadowBlur = 32;
      ctx.beginPath();
      ctx.arc(0, 0, 54, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,.68)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 35, -1.15, 1.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 25, 1.8, 4.8);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AI", 0, 1);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = foreground;
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8 - 0.5;
        const x = cx + Math.cos(angle) * orbitX;
        const y = cy + Math.sin(angle) * orbitY;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    if (reduced) draw(0);
    else raf = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-[30px] border border-border/70 bg-card/70 shadow-[0_30px_90px_rgba(0,74,102,.18)] backdrop-blur-xl sm:min-h-[430px]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-4 top-5 max-w-[54%] rounded-2xl border border-border/80 bg-card/90 px-3 py-2.5 shadow-sm backdrop-blur sm:right-6 sm:top-7">
          <p className="text-[10px] font-black text-primary">رسالة داخلة</p>
          <p className="mt-1 text-xs font-bold text-foreground sm:text-sm">عاوز أحجز بكرة الساعة 7</p>
        </div>

        <div className="absolute bottom-6 left-4 max-w-[58%] rounded-2xl border border-primary/15 bg-primary/10 px-3 py-2.5 shadow-sm backdrop-blur sm:bottom-8 sm:left-6">
          <p className="text-[10px] font-black text-primary">DRVO AutoRespond</p>
          <p className="mt-1 text-xs font-bold text-foreground sm:text-sm">متاح 7:15، أحجزهولك؟</p>
        </div>

        <div className="absolute left-4 top-[42%] rounded-full border border-success/20 bg-success-soft px-3 py-1.5 text-[10px] font-black text-success shadow-sm sm:left-7">
          ERP متصل
        </div>

        <div className="absolute bottom-[28%] right-4 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[10px] font-black text-muted-foreground shadow-sm sm:right-7">
          موظف يقدر يستلم
        </div>
      </div>
    </div>
  );
}
