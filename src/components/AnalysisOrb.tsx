/**
 * Small CSS-only 3D orb used as the affordance for full graphical analysis.
 * Decorative by default; the surrounding button supplies the accessible name.
 */
export default function AnalysisOrb({
  size = 22,
  tone = "#F3703F",
  className = "",
}: {
  size?: number;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={`analysis-orb ${className}`}
      style={{ width: size, height: size, ["--orb" as string]: tone }}
      aria-hidden="true"
    >
      <i className="orb-ring orb-ring-a" />
      <i className="orb-ring orb-ring-b" />
      <i className="orb-core" />
      <i className="orb-glint" />
    </span>
  );
}
