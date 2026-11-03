"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

const inquiryTypes = ["资源入驻", "行业内容合作", "年度合作伙伴", "海外公司注册", "包体上架", "海外支付", "海外小游戏与 SLG", "直播礼物特效与定制", "投流与增长", "其他"];

export default function BusinessInquiryDialog({ initialType, onClose }: { initialType: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState(inquiryTypes.includes(initialType) ? initialType : "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/business-inquiries", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "发送失败，请稍后重试。");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发送失败，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  return <dialog ref={dialog} className="business-inquiry-dialog" aria-labelledby="business-inquiry-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className="business-inquiry-head"><div><p className="eyebrow">BUSINESS INQUIRY</p><h2 id="business-inquiry-title">提交行业需求</h2><p>提供简要信息，方便确认合作方向与后续沟通。</p></div><button type="button" onClick={onClose} aria-label="关闭需求表单">×</button></div>
    {sent ? <div className="business-inquiry-success" role="status"><strong>需求已发送</strong><p>感谢提交，我们会根据你留下的联系方式与你沟通。</p><button className="collab-primary" type="button" onClick={onClose}>完成</button></div> :
      <form onSubmit={(event) => { void submit(event); }}>
        <div className="business-inquiry-fields">
          <label>公司 / 产品<input name="companyProduct" maxLength={100} autoComplete="organization" placeholder="公司或产品名称" required /></label>
          <label>地区<input name="region" maxLength={80} placeholder="目标国家或地区" required /></label>
          <label>需求类型<select name="type" value={type} onChange={(event) => setType(event.target.value)} required><option value="">请选择合作方向</option>{inquiryTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>预算区间<input name="budget" maxLength={80} placeholder="如人民币 1–5 万 / 待沟通" required /></label>
          <label className="business-inquiry-wide">需求描述<textarea name="description" maxLength={1200} rows={4} placeholder="请简述目标、当前情况及希望获得的支持" required /></label>
          <label>预计时间<input name="timeline" maxLength={80} placeholder="如一个月内 / 具体月份" required /></label>
          <label>联系方式<input name="contact" maxLength={160} placeholder="微信、电话或邮箱" required /></label>
          <label className="business-inquiry-trap" aria-hidden="true">网站地址<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <p className="business-inquiry-privacy">信息仅用于联系与评估本次需求，不在网站公开展示。请勿提交未经授权的内部资料。</p>
        {error && <p className="business-inquiry-error" role="alert">{error}</p>}
        <button className="collab-primary business-inquiry-submit" type="submit" disabled={sending}>{sending ? "正在发送…" : "提交行业需求"}</button>
      </form>}
  </dialog>;
}
