import test from 'node:test';
import assert from 'node:assert/strict';
import { productUpdateDetail, readProductUpdate } from '../shared/product-update.mjs';
import { atlasActivity, activityByType } from '../app/atlas-activity.mjs';
test('product additions count distinct new names rather than list length', () => {
  for (const [after,before,count] of [
    [['A','B','C'],['A','B'],1], [['B','a'],['A','B'],0],
    [['A'],['A','B'],0], [[' A ','a','B'],[],2], [['A'],null,null],
  ]) assert.equal(readProductUpdate(productUpdateDetail(after,before)).productAdditions,count);
  assert.deepEqual(readProductUpdate('产品清单：A、B'),{text:'产品清单：A、B',productAdditions:null});
});
test('product growth reaches badge and weekly totals, deduplicates events and exposes gaps', () => {
  const e={id:'a',status:'published',title:'更新矩阵：A',date:'2026-09-20',changes:[{type:'矩阵产品'}],productAdditions:1};
  const old={...e,id:'old',date:'2026-09-19',productAdditions:null};
  assert.equal(atlasActivity([e,e,old],[]).productAdditions,1);
  const totals=activityByType([e,e,old],[],'2026-09-20');
  assert.equal(totals.week.products,1);
  assert.equal(totals.week.productsPartial,true);
  assert.equal(totals.day.products,1);
});
