// Mouse drag-to-scroll only. Touch and trackpad retain native scrolling.
export function enableDateStripDrag(viewport) {
  let gesture = null;
  let suppressClick = false;
  const finish = (cancelled = false) => {
    if (!gesture) return;
    const { id, dragged } = gesture;
    gesture = null;
    suppressClick = !cancelled && dragged;
    viewport.classList.remove("is-dragging");
    if (viewport.hasPointerCapture?.(id)) viewport.releasePointerCapture(id);
  };
  const down = event => {
    suppressClick = false;
    if (event.pointerType !== "mouse" || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, dragged: false };
  };
  const move = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (event.buttons === 0) { finish(true); return; }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragged) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      gesture.dragged = true;
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    viewport.scrollLeft = gesture.left - dx;
  };
  const up = event => { if (gesture?.id === event.pointerId) finish(); };
  const cancel = () => finish(true);
  const leave = () => { if (gesture && !gesture.dragged) finish(true); };
  const click = event => {
    if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); }
    suppressClick = false;
  };
  const nativeDrag = event => event.preventDefault();
  const listeners = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", cancel], ["lostpointercapture", cancel], ["pointerleave", leave], ["click", click, true], ["dragstart", nativeDrag]];
  listeners.forEach(([name, handler, capture]) => viewport.addEventListener(name, handler, capture || false));
  const win = viewport.ownerDocument?.defaultView;
  win?.addEventListener("blur", cancel);
  return () => {
    finish(true);
    listeners.forEach(([name, handler, capture]) => viewport.removeEventListener(name, handler, capture || false));
    win?.removeEventListener("blur", cancel);
  };
}
