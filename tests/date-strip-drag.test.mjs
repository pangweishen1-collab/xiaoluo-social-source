import test from 'node:test';
import assert from 'node:assert/strict';
import { enableDateStripDrag } from '../app/date-strip-drag.mjs';

function setup() {
  const listeners=new Map(), winListeners=new Map(), classes=new Set(), captures=new Set();
  const viewport={scrollLeft:100,classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)},setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),addEventListener:(n,h)=>listeners.set(n,h),removeEventListener:n=>listeners.delete(n),ownerDocument:{defaultView:{addEventListener:(n,h)=>winListeners.set(n,h),removeEventListener:n=>winListeners.delete(n)}}};
  const cleanup=enableDateStripDrag(viewport);
  const fire=(name,extra={})=>{
    const e={pointerType:'mouse',pointerId:1,button:0,buttons:1,clientX:100,clientY:20,detail:1,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},...extra};
    listeners.get(name)?.(e);return e;
  };
  return {viewport,fire,classes,captures,listeners,winListeners,cleanup};
}

test('mouse dragging scrolls in both directions and suppresses only the release click',()=>{
  const t=setup();t.fire('pointerdown');
  assert.equal(t.fire('pointermove',{clientX:96}).prevented,false);
  assert.equal(t.viewport.scrollLeft,100);
  assert.equal(t.fire('pointermove',{clientX:70}).prevented,true);
  assert.equal(t.viewport.scrollLeft,130);
  assert.ok(t.classes.has('is-dragging'));assert.ok(t.captures.has(1));
  t.fire('pointermove',{clientX:130});assert.equal(t.viewport.scrollLeft,70);
  t.fire('pointerup');assert.equal(t.classes.size,0);assert.equal(t.captures.size,0);
  const click=t.fire('click');assert.equal(click.prevented,true);assert.equal(click.stopped,true);
  assert.equal(t.fire('click').prevented,false);
  t.fire('pointerdown');t.fire('pointerup');assert.equal(t.fire('click').prevented,false);
  t.cleanup();
});

test('touch, vertical gestures, right clicks and modified clicks retain native behavior',()=>{
  for(const start of [{pointerType:'touch'},{pointerType:'pen'},{button:2},{ctrlKey:true},{metaKey:true}]){
    const t=setup();t.fire('pointerdown',start);assert.equal(t.fire('pointermove',{clientX:40}).prevented,false);assert.equal(t.viewport.scrollLeft,100);t.cleanup();
  }
  const t=setup();t.fire('pointerdown');assert.equal(t.fire('pointermove',{clientX:92,clientY:60}).prevented,false);
  assert.equal(t.fire('pointermove',{pointerId:2,clientX:20}).prevented,false);
  assert.equal(t.viewport.scrollLeft,100);t.cleanup();
});

test('interrupted drags, keyboard activation and cleanup never leave a grabbing state',()=>{
  for(const interruption of ['pointercancel','lostpointercapture','blur']){
    const t=setup();t.fire('pointerdown');t.fire('pointermove',{clientX:50});
    if(interruption==='blur')t.winListeners.get('blur')();else t.fire(interruption);
    assert.equal(t.classes.size,0);assert.equal(t.captures.size,0);assert.equal(t.fire('click').prevented,false);t.cleanup();
  }
  const t=setup();t.fire('pointerdown');t.fire('pointermove',{clientX:50});t.fire('pointerup');assert.equal(t.fire('click',{detail:0}).prevented,false);
  t.fire('pointerdown');t.fire('pointermove',{clientX:20});t.cleanup();assert.equal(t.listeners.size,0);assert.equal(t.winListeners.size,0);assert.equal(t.classes.size,0);assert.equal(t.captures.size,0);
});
