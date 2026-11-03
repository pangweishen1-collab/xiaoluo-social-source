# China company distribution

## Compact map extent

Rendering now relocates complete rings south of 18°N into a labeled South China Sea islands inset. All rings of the 34 province features remain; the raw GeoJSON is unchanged. The main extent excludes these inset rings to avoid the large empty ocean strip. This is a schematic inset, not a shared-scale geographic position. Desktop SVG height is now 360px with a larger mainland footprint than the earlier full-extent view.

## User confirmation on 2026-09-15

The user explicitly confirmed that both remaining entries, 畅指网络 (Dino / Doki) and 道归道科技 (Gami), are Guangzhou companies. Both are now assigned to 广东省 / 广州 with user-confirmation provenance and no fabricated external source. This supersedes the unresolved status in the earlier research notes below; it does not establish any same-name corporate relationship.

Current built-in totals: 40 classified, 0 unresolved; Guangdong 22, Beijing 8, Hubei 4, Zhejiang 3, Shanghai 2, Fujian 1. Future unrecognized admin additions still default to unknown.

## Follow-up on 2026-09-15: all 19 previously unknown entries checked

17 additional entries now have province/city mappings in `app/company-regions.json`. The user's explicit Guangdong confirmation is retained for Hule, JOYY and Kumai. This is domestic-entity classification, not a claim about global headquarters. Yalla uses its Hangzhou domestic entity; Duoshou uses Guangzhou, with other offices noted rather than counted twice.

Additional corroboration:
- Yalla SEC subsidiary list: https://www.sec.gov/Archives/edgar/data/1794350/000095017022006105/yala-ex8_1.htm
- Lankun Tianhe government list: https://www.thnet.gov.cn/attachment/7/7515/7515654/9352566.pdf
- Duoshou university cooperation/office list: https://news.sisu.edu.cn/cwxw/23085fa841db40cea6cbd71abf07a13e.htm
- Huijing overseas social operations recruitment (Guangzhou, not the unrelated Shaanxi or Hunan entities): https://www.zhipin.com/zhaopin/3ce4199483a2b1ca1nx70tu5EQ~~/
- Elelive recruitment site explicitly presents Elelive and copyrights 小象（广州）商务有限公司; avoid 小象大鹅. https://job-ele.com/

Still unresolved, NOT assigned automatically:
- 畅指网络: https://www.changzhi.top/introduction describes LDPlayer/emulator business and Guangzhou headquarters, but no reliable Dino/Doki linkage was found. Do not use this same-name company's address without resolving the identity.
- 道归道科技: recruitment for 广州道归道信息科技有限公司 was found (overseas voice/party business, Guangzhou Panyu), but the specific Gami connection was not independently established. Candidate: https://www.yupao.com/zhaogong/a76c1351/ . Retain unknown until identity is confirmed.

Result for the current 40 built-in companies: 38 classified, 2 unresolved. Counts are derived at runtime rather than hard-coded.

Prepared 2026-09-15. This is a local draft, not a published change.

- Unit: one currently active matrix company entry, not a product count or office count.
- Geography: domestic entity location at province level. Not global headquarters or markets served.
- `app/company-regions.json` records the evidence and source for every assigned company. Null source means no external link is attached: read `basis` to distinguish user confirmation from classification based only on the existing entity name. Neither implies a verified street address.
- Unmatched/new company entries remain unknown. Existing admin overrides retain location through `sourceCompany`; deleted entries disappear from both totals and map.
- Map totals always cover the full active directory. Search affects the cards; region selection intersects search. Reset clears both filters.
- Basemap downloaded without geometry edits from https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json on 2026-09-15. DataV selector: https://datav.aliyun.com/portal/school/atlas/area_selector . The original asset retains all 35 features. At the user's request, rendering excludes the independent dashed maritime overlay `100000_JD`; all rings of the 34 named province-level features, including islands, remain. Viewbox padding is reduced to 8 units; desktop map height is 420px, with a mobile maximum of 360px.
- The local asset removes runtime reliance on an external map API. No API key, geolocation, or tracking is used. Public-source availability is not a blanket reuse license; confirm applicable map-use requirements before a future public release.
