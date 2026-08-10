import Link from "next/link";
import { LocalizedText } from "./LocaleProvider";

interface FlowNode {
  id: string;
  title: string;
}

function NodeList({ nodes, empty }: { nodes: FlowNode[]; empty: { zh: string; en: string } }) {
  if (!nodes.length) {
    return <span className="mechanism-flow__empty"><LocalizedText zh={empty.zh} en={empty.en} /></span>;
  }
  return (
    <div className="mechanism-flow__nodes">
      {nodes.map((node) => <Link href={`/mechanisms/${node.id}`} key={node.id}><small>{node.id}</small><strong>{node.title}</strong></Link>)}
    </div>
  );
}

export function MechanismFlow({ current, prerequisites, dependents }: {
  current: FlowNode;
  prerequisites: FlowNode[];
  dependents: FlowNode[];
}) {
  return (
    <div className="mechanism-flow" aria-label={`${current.title} dependency graph`}>
      <div className="mechanism-flow__column">
        <span><LocalizedText zh="前置机制" en="Prerequisites" /></span>
        <NodeList nodes={prerequisites} empty={{ zh: "起始节点", en: "Entry node" }} />
      </div>
      <div className="mechanism-flow__arrow" aria-hidden="true">→</div>
      <div className="mechanism-flow__current">
        <span>{current.id}</span>
        <strong>{current.title}</strong>
        <small><LocalizedText zh="当前研究边界" en="Current research boundary" /></small>
      </div>
      <div className="mechanism-flow__arrow" aria-hidden="true">→</div>
      <div className="mechanism-flow__column">
        <span><LocalizedText zh="后继机制" en="Unlocks" /></span>
        <NodeList nodes={dependents} empty={{ zh: "暂无后继", en: "No dependents yet" }} />
      </div>
    </div>
  );
}
