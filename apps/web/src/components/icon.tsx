export default function Icon({
  name,
  className = "icon",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg className={className}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
