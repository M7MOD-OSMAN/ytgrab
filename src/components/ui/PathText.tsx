// Renders a path left-to-right with every segment isolated, so an Arabic
// folder name keeps its own reading order without swapping places with its
// neighbours across the separators.
export function PathText({ path, className = "" }: { path: string; className?: string }) {
  const parts = path.split(/([\\/])/);
  return (
    <span dir="ltr" title={path} className={className}>
      {parts.map((part, i) =>
        part === "\\" || part === "/" ? <span key={i}>{part}</span> : <bdi key={i}>{part}</bdi>
      )}
    </span>
  );
}
