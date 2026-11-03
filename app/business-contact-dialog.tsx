"use client";
import { useEffect, useRef } from "react";
export default function BusinessContactDialog({ topic, onClose }: { topic: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const overflow = document.body.style.overflow;
    el?.showModal(); document.body.style.overflow = "hidden";
    return () => { el?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);
  return <dialog ref={ref} className="business-contact-dialog" aria-labelledby="business-dialog-title" onCancel={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <button className="business-dialog-close" type="button" aria-label="关闭微信二维码" onClick={onClose}>×</button>
    <h2 id="business-dialog-title">微信联系小骆</h2><p>{topic}</p>
    <img src="/optimized/wechat-qr.webp" width="240" height="240" alt="小骆商务合作微信二维码" />
    <p>使用微信扫码，添加时备注<br /><strong>公司名称＋{topic}</strong></p>
  </dialog>;
}
