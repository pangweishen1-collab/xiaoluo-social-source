"use client";

import { useEffect, useRef } from "react";

export default function BusinessQrDialog({ plan, title = "咨询服务", onClose }: { plan: string; title?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const modal = dialog.current;
    modal?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      modal?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, []);
  return <dialog ref={dialog} className="business-qr-dialog" aria-labelledby="business-qr-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <button className="business-qr-close" type="button" aria-label="关闭二维码" onClick={onClose}>×</button>
    <h2 id="business-qr-title">{title}</h2>
    {plan !== title && <p>{plan}</p>}
    <img src="/optimized/wechat-qr.webp" alt="小骆的微信二维码" width="260" height="260" />
    <strong>扫码添加小骆微信</strong>
    <p>请备注「公司＋{plan}」</p>
  </dialog>;
}
