"use client";
import { useEffect, useState } from "react";
import { matrixCompanies } from "../matrix-data";
import { researchProducts, researchProductCandidates } from "../research-products.mjs";

type MatrixRecord = { company: string; sourceCompany?: string; products: string[]; deleted?: boolean };
export default function ArticleMatrixPicker({ company }: { company: string }) {
  const [records, setRecords] = useState<MatrixRecord[]>([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/matrix", { cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("matrix"); return response.json(); })
      .then(data => { setRecords(data.items || []); setStatus("ready"); })
      .catch(error => { if (error.name !== "AbortError") setStatus("error"); });
    return () => controller.abort();
  }, [attempt]);
  const selected = researchProducts(company.trim(), matrixCompanies, records);
  const candidates = selected ? [] : researchProductCandidates(company, matrixCompanies, records);
  if (!company.trim() || (status === "ready" && !selected && !candidates.length)) return null;
  return <section className="article-matrix-picker">
    <strong>关联产品矩阵</strong>
    {status === "loading" ? <p role="status">正在读取产品矩阵…</p> : status === "error" ? <p role="alert">矩阵暂时无法加载。<button type="button" onClick={() => setAttempt(attempt + 1)}>重试</button></p> : <>
      {!selected && candidates.length > 0 && <div role="status"><p>匹配到 {candidates.length} 家公司，继续输入以准确关联。</p><div className="article-matrix-preview">{candidates.map((item: MatrixRecord) => <span key={item.sourceCompany}>{item.company}</span>)}</div></div>}
      {selected && <><p>{selected.company} · {selected.products.length} 个产品 · 自动关联</p><div className="article-matrix-preview" aria-label="关联产品预览">{selected.products.map((product: string, index: number) => <span key={index}>{product}</span>)}</div></>}
    </>}
  </section>;
}
