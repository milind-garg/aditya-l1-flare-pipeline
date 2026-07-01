import React, { useEffect, useRef, useState } from "react";

interface ActiveRegion {
  name: string;
  lat: number;  // Latitude in radians (-pi/2 to pi/2)
  lon: number;  // Longitude in radians (-pi to pi)
  class: string;
}

const ACTIVE_REGIONS: ActiveRegion[] = [
  { name: "AR 3241", lat: 0.25, lon: -0.8, class: "X-Class" },
  { name: "AR 3242", lat: -0.15, lon: 0.3, class: "M-Class" },
  { name: "AR 3245", lat: 0.35, lon: 1.2, class: "C-Class" },
];

export default function SolarGlobe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 200, height: 200 });
  const [isLoaded, setIsLoaded] = useState(false);

  // Interaction and Rotation States
  const angleY = useRef(0);
  const tiltX = useRef(0.15); // Approx 8.6 degrees tilt
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const autoRotate = useRef(true);

  // Textures
  const textureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Handle resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(120, width),
        height: Math.max(120, height),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Pre-generate / Load texture
  useEffect(() => {
    // We create a procedural solar texture off-screen
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 512;
    textureCanvas.height = 256;
    const ctx = textureCanvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Draw loaded image onto texture canvas
      ctx.drawImage(img, 0, 0, 512, 256);
      setIsLoaded(true);
    };
    img.onerror = () => {
      // Fallback: Generate procedural solar texture
      generateProceduralTexture(ctx);
      setIsLoaded(true);
    };
    // SDO live solar feed image (304 Angstroms shows gorgeous orange active regions)
    img.src = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg";
    textureCanvasRef.current = textureCanvas;
  }, []);

  // Generate a premium procedural sun texture with granulation and magnetic loops
  const generateProceduralTexture = (ctx: CanvasRenderingContext2D) => {
    const width = 512;
    const height = 256;

    // 1. Dark orange background
    ctx.fillStyle = "#9a3412"; // Deep rust/orange
    ctx.fillRect(0, 0, width, height);

    // 2. Add high-frequency solar granulation (noise)
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);

      // Simple pseudo-random granulation wave
      const n = Math.sin(x * 0.15) * Math.cos(y * 0.15) * 15 + Math.sin(x * 0.5) * 8;
      const brightness = Math.max(-40, Math.min(60, n));

      data[i] = Math.max(0, Math.min(255, 239 + brightness));     // R (bright gold/orange)
      data[i + 1] = Math.max(0, Math.min(255, 115 + brightness * 0.8)); // G
      data[i + 2] = Math.max(0, Math.min(255, 16 + brightness * 0.3));  // B
    }
    ctx.putImageData(imgData, 0, 0);

    // 3. Draw glowing active corona regions
    ctx.shadowBlur = 15;
    ACTIVE_REGIONS.forEach((ar) => {
      // Map spherical lat/lon to cylindrical texture coords
      const tx = ((ar.lon + Math.PI) / (2 * Math.PI)) * width;
      const ty = ((-ar.lat + Math.PI / 2) / Math.PI) * height;

      // Glow backing
      const grad = ctx.createRadialGradient(tx, ty, 5, tx, ty, 45);
      grad.addColorStop(0, "rgba(254, 240, 138, 0.9)"); // Bright yellow
      grad.addColorStop(0.3, "rgba(249, 115, 22, 0.6)"); // Orange
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "#f97316";
      ctx.beginPath();
      ctx.arc(tx, ty, 45, 0, Math.PI * 2);
      ctx.fill();

      // Flare points (hot magnetic loops)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx - 4, ty, 8, Math.PI, 0);
      ctx.arc(tx + 4, ty, 8, Math.PI, 0);
      ctx.stroke();
    });

    ctx.shadowBlur = 0; // Reset
  };

  // Main 3D render loop
  useEffect(() => {
    if (!isLoaded || !canvasRef.current || !textureCanvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const textureCanvas = textureCanvasRef.current;
    const textureCtx = textureCanvas.getContext("2d");
    if (!textureCtx) return;
    const textureWidth = textureCanvas.width;
    const textureHeight = textureCanvas.height;
    const textureData = textureCtx.getImageData(0, 0, textureWidth, textureHeight);

    let animationId: number;

    const render = () => {
      // Auto-rotation when not dragging
      if (autoRotate.current) {
        angleY.current += 0.003;
      }

      // Keep angle in range
      angleY.current = angleY.current % (Math.PI * 2);

      // Setup drawing coordinates
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      const R = Math.floor(Math.min(dimensions.width, dimensions.height) * 0.44);
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;

      // Draw a subtle outer corona glow
      const coronaGrad = ctx.createRadialGradient(cx, cy, R - 5, cx, cy, R + 35);
      coronaGrad.addColorStop(0, "rgba(249, 115, 22, 0.45)");
      coronaGrad.addColorStop(0.3, "rgba(234, 88, 12, 0.15)");
      coronaGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 35, 0, Math.PI * 2);
      ctx.fill();

      // Create output image buffer for the sphere
      const size = R * 2;
      if (size <= 0) return;
      const sphereImg = ctx.createImageData(size, size);
      const sData = sphereImg.data;

      const angle = angleY.current;
      const tilt = tiltX.current;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      // Loop through bounding box of sphere
      for (let sy = 0; sy < size; sy++) {
        const y = sy - R;
        for (let sx = 0; sx < size; sx++) {
          const x = sx - R;
          const distSq = x * x + y * y;

          if (distSq > R * R) continue; // Outside the sphere boundary

          const z = Math.sqrt(R * R - distSq);

          // Unit normals on screen sphere
          const nx = x / R;
          const ny = y / R;
          const nz = z / R;

          // 3D rotation projection:
          // 1. Rotate around X-axis (tilt)
          const ry1 = ny * cosT - nz * sinT;
          const rz1 = ny * sinT + nz * cosT;
          const rx1 = nx;

          // 2. Rotate around Y-axis (spin)
          const rx2 = rx1 * cosA + rz1 * sinA;
          const rz2 = -rx1 * sinA + rz1 * cosA;
          const ry2 = ry1;

          // Convert rotated unit vectors to lat/lon
          const lat = Math.asin(Math.max(-1, Math.min(1, ry2)));
          const lon = Math.atan2(rx2, rz2);

          // Map lat/lon to cylindrical texture coordinate percentages
          const u = (lon + Math.PI) / (2 * Math.PI);
          const v = (-lat + Math.PI / 2) / Math.PI;

          // Sample from source texture (wrapping u)
          const tx = Math.floor((u * textureWidth) % textureWidth);
          const ty = Math.floor(v * (textureHeight - 1));
          const tIdx = (ty * textureWidth + tx) * 4;

          // Shading & Limb Darkening (decrease intensity towards the edge)
          const cosTheta = nz; // Angle relative to view direction
          const limbDarkening = 0.22 + 0.78 * Math.pow(cosTheta, 0.75);

          // Combine texture color and limb darkening
          const sIdx = (sy * size + sx) * 4;
          sData[sIdx] = Math.min(255, textureData.data[tIdx] * limbDarkening);         // R
          sData[sIdx + 1] = Math.min(255, textureData.data[tIdx + 1] * limbDarkening); // G
          sData[sIdx + 2] = Math.min(255, textureData.data[tIdx + 2] * limbDarkening); // B
          sData[sIdx + 3] = 255;                                                      // A
        }
      }

      // Draw the mapped sphere pixels
      const sphereCanvas = document.createElement("canvas");
      sphereCanvas.width = size;
      sphereCanvas.height = size;
      const sphereCtx = sphereCanvas.getContext("2d");
      if (sphereCtx) {
        sphereCtx.putImageData(sphereImg, 0, 0);
        ctx.drawImage(sphereCanvas, cx - R, cy - R);
      }

      // Draw a subtle border to antialias the edge of the sphere
      ctx.strokeStyle = "rgba(249, 115, 22, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // Render glowing active regions (Depth-Tested)
      const pulse = 1 + 0.12 * Math.sin(Date.now() * 0.007);
      ACTIVE_REGIONS.forEach((ar) => {
        // Spherical position vector
        const px = Math.cos(ar.lat) * Math.sin(ar.lon);
        const py = Math.sin(ar.lat);
        const pz = Math.cos(ar.lat) * Math.cos(ar.lon);

        // Apply inverse transformations to project onto screen space
        // 1. Rotate Y by angleY
        const px1 = px * cosA - pz * sinA;
        const pz1 = px * sinA + pz * cosA;
        const py1 = py;

        // 2. Rotate X by tiltX
        const px2 = px1;
        const py2 = py1 * cosT + pz1 * sinT;
        const pz2 = -py1 * sinT + pz1 * cosT;

        // Depth check: only render if on the front hemisphere (pz2 > 0)
        if (pz2 > 0) {
          const sx = cx + px2 * R;
          const sy = cy - py2 * R; // Invert y for canvas space

          // Pulse glow ring
          ctx.strokeStyle = ar.class === "X-Class" ? "#ef4444" : ar.class === "M-Class" ? "#f97316" : "#facc15";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 5 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          // Hot solid center
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI * 2);
          ctx.fill();

          // Label
          ctx.font = "8px 'JetBrains Mono', monospace";
          ctx.fillStyle = "#e5e2e3";
          ctx.shadowColor = "#000";
          ctx.shadowBlur = 3;
          ctx.fillText(ar.name, sx + 8, sy + 3);
          ctx.shadowBlur = 0;
        }
      });

      // Interactive guide ring on hover
      if (!autoRotate.current) {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isLoaded, dimensions]);

  // Drag handlers for manual rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    autoRotate.current = false;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - previousMousePosition.current.x;
    const deltaY = e.clientY - previousMousePosition.current.y;

    angleY.current -= deltaX * 0.007; // Spin
    tiltX.current = Math.max(-0.6, Math.min(0.6, tiltX.current - deltaY * 0.007)); // Pitch

    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    isDragging.current = false;
    // Resume auto-rotation after 3 seconds of inactivity
    setTimeout(() => {
      if (!isDragging.current) {
        autoRotate.current = true;
      }
    }, 3000);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center relative cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full block"
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-2">
          <span className="material-symbols-outlined animate-spin text-primary">sync</span>
          <span className="text-[10px] text-on-surface-variant font-label-caps">CORONAL MAP INGESTION...</span>
        </div>
      )}
      <div className="absolute top-2 right-2 opacity-0 hover:opacity-100 group-hover:opacity-70 transition-opacity bg-black/60 px-2 py-0.5 rounded pointer-events-none text-[8px] font-mono text-sky-400">
        DRAG TO ROTATE
      </div>
    </div>
  );
}
