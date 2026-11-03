"use client";

import { regionSummary, UNKNOWN_REGION } from "./company-geography.mjs";

type Company = { id: string; company: string; sourceCompany: string };

export default function CompanyRegions({ companies, region, onRegionChange }: { companies: Company[]; region: string; onRegionChange: (region: string) => void }) {
  const summary = regionSummary(companies);
  const selectedLabel = !region ? "全部地区" : region === UNKNOWN_REGION ? "所在地待核实" : region;

  return <section className="company-regions shell" aria-labelledby="company-regions-title">
    <div className="company-regions-heading">
      <div className="company-regions-heading-copy">
        <h2 id="company-regions-title">公司地区分布</h2>
        <p>{summary.located} 家已归类 · {summary.regions.length} 个地区</p>
      </div>
      <div className="company-regions-actions">
        <button type="button" className={`company-region-all${!region ? " is-active" : ""}`} aria-pressed={!region} aria-controls="matrix-company-results" onClick={() => onRegionChange("")}>
          <span>全部地区</span>
          <span className="company-region-all-count">{companies.length} 家</span>
        </button>
      </div>
    </div>

    <div className="company-regions-grid" role="group" aria-label="按地区筛选公司">
      {summary.regions.map(({ name, count }) => {
        const share = summary.located ? Math.round(count / summary.located * 1000) / 10 : 0;
        const shareLabel = Number.isInteger(share) ? String(share) : share.toFixed(1);
        return <button type="button" key={name} className={`company-region-card${region === name ? " is-active" : ""}`} aria-label={`${name}，${count} 家公司，占比 ${shareLabel}%`} aria-pressed={region === name} aria-controls="matrix-company-results" onClick={() => onRegionChange(name)}>
          <span className="company-region-card-top"><span className="company-region-name">{name}</span><span className="company-region-count"><strong>{count}</strong><span>家</span></span></span>
          <span className="company-region-card-bottom"><span className="company-region-meter" aria-hidden="true"><i style={{ width: `${share}%` }} /></span><span>{shareLabel}%</span></span>
        </button>;
      })}
      {(summary.unknown > 0 || region === UNKNOWN_REGION) && <button type="button" className={`company-region-card company-region-unknown${region === UNKNOWN_REGION ? " is-active" : ""}`} aria-pressed={region === UNKNOWN_REGION} aria-controls="matrix-company-results" onClick={() => onRegionChange(UNKNOWN_REGION)}>
        <span className="company-region-card-top"><span className="company-region-name">所在地待核实</span><span className="company-region-count"><strong>{summary.unknown}</strong><span>家</span></span></span>
        <span className="company-region-card-bottom company-region-unknown-note">不计占比</span>
      </button>}
    </div>

    <p className="company-regions-status" role="status">当前查看：{selectedLabel}。按国内主体所在地归类，占比按已归类公司计算。</p>
  </section>;
}
