import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weeklyProducts } from '../app/weekly-products.mjs';
test('matrix omits the retired broadcast while still reloading data after a successful save', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /WeeklyProductBroadcast|updatesRevision|setUpdatesRevision/);
  assert.match(page, /onSaved=\{async \(\) => \{ setEditor\(null\); await load\(\)/);
});
const entry=(date, products, title='更新矩阵：公司A')=>({status:'published',date,title,addedProducts:products,changes:[{type:'矩阵产品'}]});
test('broadcast lays out all entries and only animates measured overflow', () => {
  const source = readFileSync(new URL('../app/weekly-product-broadcast.tsx', import.meta.url), 'utf8');
  assert.match(source, /items.map\(item/);
  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /row.scrollWidth - 32 > box.clientWidth \+ 1/);
  assert.match(source, /distance > 0 && !reduced/);
  assert.match(source, /aria-hidden="true">\{entries\}/);
  assert.doesNotMatch(source, /下一条|setIndex|6000\)/);
});
test('weekly broadcast uses Beijing Monday boundary and groups only confirmed additions',()=>{
  const rows=[entry('2026-09-13T16:00:00Z',['A']),entry('2026-09-20',['a','B']),entry('2026-09-13T15:59:59Z',['old']),entry('2026-09-21',['future']),entry('2026-09-20',null),{...entry('2026-09-20',['draft']),status:'draft'}];
  assert.deepEqual(weeklyProducts(rows,'2026-09-20'),[{company:'公司A',products:['a','B']}]);
  assert.deepEqual(weeklyProducts(rows,'2026-09-21'),[{company:'公司A',products:['future']}]);
  assert.deepEqual(weeklyProducts([],null),[]);
});
