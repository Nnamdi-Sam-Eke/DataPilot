export function SparkBar({ values = [], color = "#6c63ff", height = 48 }) {
  const safeValues = (values || [])
    .map(v => Number(v))
    .filter(v => !isNaN(v) && isFinite(v));

  if (safeValues.length === 0) return null;

  const max = Math.max(...safeValues) || 1;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height }}>
      {safeValues.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRadius: "3px 3px 0 0",
            background:
              i === safeValues.length - 1
                ? `linear-gradient(180deg, ${color}, ${color}88)`
                : `${color}44`,
            height: `${(v / max) * 100}%`,
            minHeight: 3,
            transition: "height 0.5s ease",
          }}
        />
      ))}
    </div>
  );
}



export function SparkLine({ values = [], color = "#6c63ff", width = 100, height = 40 }) {
  // ✅ sanitize values
  const safeValues = (values || [])
    .map(v => Number(v))
    .filter(v => !isNaN(v) && isFinite(v));

  // ✅ guard: no data
  if (safeValues.length === 0) {
    return null;
  }

  // ✅ guard: single value
  if (safeValues.length === 1) {
    const y = height / 2;
    return (
      <svg width={width} height={height}>
        <line x1="0" y1={y} x2={width} y2={y} stroke={color} strokeWidth="2" />
      </svg>
    );
  }

  const max = Math.max(...safeValues);
  const min = Math.min(...safeValues);
  const range = max - min || 1;

  const pts = safeValues
    .map((v, i) => {
      const x = (i / (safeValues.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  const area = `M${pts.split(" ").join("L")} L${width},${height} L0,${height} Z`;

  const gradId = `sg${color.replace("#", "").replace(/[(),.%\s]/g, "")}`;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${gradId})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeatmapMini({ size = 8 }) {
  const colors = [
    "rgba(108,99,255,0.08)", "rgba(108,99,255,0.20)", "rgba(108,99,255,0.35)",
    "rgba(108,99,255,0.50)", "rgba(108,99,255,0.70)", "rgba(167,139,250,0.90)",
  ];
  const vals = Array.from({ length: size * size }, (_, i) => {
    const x = Math.sin(i * 9301 + 49297) * 49979;
    return x - Math.floor(x);
  });
  const getColor = (v) => colors[Math.min(Math.floor(v * colors.length), colors.length - 1)];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 2 }}>
      {vals.map((v, i) => (
        <div key={i} style={{ aspectRatio: 1, borderRadius: 2, background: getColor(v) }} />
      ))}
    </div>
  );
}