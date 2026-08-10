import type { Metadata } from "next";
import { LocalizedText } from "../components/LocaleProvider";
import { SearchExplorer } from "../components/SearchExplorer";
import { buildSearchIndex } from "../lib/search";

export const metadata: Metadata = {
  title: "搜索 / Search",
  description: "跨课程、机制、Agent、Claim、实验和 Trace 搜索公开知识图谱。",
};

export default function SearchPage() {
  const records = buildSearchIndex();

  return (
    <main className="page-shell interior-page search-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">SEARCH · ONE CONTENT GRAPH</span>
        <h1>
          <LocalizedText zh="从一个术语，找到它的" en="From one term to its" />
          <br />
          <LocalizedText zh="课程、证据与运行记录。" en="lessons, evidence, and runs." />
        </h1>
        <p>
          <LocalizedText
            zh="搜索不是文章标题过滤器：它读取中英文内容、源码 locator、稳定 ID、实验变量和 Trace 事件类型。"
            en="This is more than a title filter: it indexes bilingual content, source locators, stable IDs, experiment variables, and trace event types."
          />
        </p>
        <div className="metric-row">
          <span><strong>{records.length}</strong> <LocalizedText zh="公开记录" en="public records" /></span>
          <span><strong>7</strong> <LocalizedText zh="实体类型" en="entity types" /></span>
          <span><strong>2</strong> <LocalizedText zh="内容语言" en="content languages" /></span>
        </div>
      </header>
      <SearchExplorer records={records} />
    </main>
  );
}
