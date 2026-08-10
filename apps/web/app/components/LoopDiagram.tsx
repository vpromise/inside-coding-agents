const nodes = [
  { number: "01", label: "Intent", detail: "user.message" },
  { number: "02", label: "Model", detail: "request / response" },
  { number: "03", label: "Policy", detail: "validate / authorize" },
  { number: "04", label: "Tool", detail: "effect / result" },
  { number: "05", label: "Context", detail: "append / prune" },
];

export function LoopDiagram() {
  return (
    <div className="loop-diagram" aria-label="Five-stage agent loop diagram">
      <div className="loop-diagram__orbit" aria-hidden="true" />
      {nodes.map((node, index) => (
        <div className={`loop-node loop-node--${index + 1}`} key={node.number}>
          <span>{node.number}</span>
          <strong>{node.label}</strong>
          <small>{node.detail}</small>
        </div>
      ))}
      <div className="loop-core">
        <span>HARNESS</span>
        <strong>owns the loop</strong>
      </div>
    </div>
  );
}
