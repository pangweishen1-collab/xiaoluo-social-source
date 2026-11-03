"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import './message-board.css';
import { groupMessagesByDay } from './message-groups.mjs';
type Message = { id: string; nickname: string; content: string; createdAt?: number };
export default function MessageBoard() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitted = useRef(new Set<string>());
  const messageList = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open && messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [open, messages]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previous = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previous; trigger.current?.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    fetch('/api/danmaku', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!Array.isArray(data.messages)) throw Error();
      if (!controller.signal.aborted) setMessages(current => [...current.filter(m => submitted.current.has(m.id) && !data.messages.some((item: Message) => item.id === m.id)), ...data.messages].slice(0, 120));
    }).catch(() => { if (!controller.signal.aborted) setLoadError('留言加载失败，请重试。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, retry]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/danmaku', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: '访客', content: data.get('content') }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '留言失败，请重试。');
      submitted.current.add(result.message.id);
      setMessages(current => [result.message, ...current.filter(m => m.id !== result.message.id)].slice(0, 120));
      (form.elements.namedItem('content') as HTMLTextAreaElement).value = '';
      setNotice('留言已发布。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '网络异常，请重试。'); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="message-board-trigger" ref={trigger} aria-haspopup="dialog" onClick={() => { setError(''); setNotice(''); setOpen(true); }}>留言板</button>
    {open && <dialog ref={dialog} className="message-board-dialog" aria-labelledby="message-board-title" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}>
      <header className="message-board-topbar"><h2 id="message-board-title" className="message-board-sr-only">留言板</h2><button type="button" autoFocus aria-label="关闭留言板" onClick={() => setOpen(false)}>×</button></header>
      <div className="message-board-columns">
      <section ref={messageList} className="message-board-list" aria-label="留言记录" aria-busy={loading}>
        {loading && <p role="status">正在加载留言…</p>}
        {loadError && <p role="alert">{loadError}<button type="button" onClick={() => setRetry(value => value + 1)}>重新加载</button></p>}
        {!loading && !loadError && !messages.length && <p>还没有留言，来留下第一条吧。</p>}
        {groupMessagesByDay(messages).map(group => <div className="message-board-day" key={group.day || 'unknown'}>
          <div className="message-board-meta">{group.day ? <time dateTime={group.day} title="北京时间">{group.day.replaceAll('-', '/')}</time> : <span>日期未记录</span>}</div>
          {group.messages.map((message: Message) => <article key={message.id}><div className="message-board-message"><span className="message-board-avatar" role="img" aria-label="默认访客头像"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span><p>{message.content}</p></div></article>)}
        </div>)}
      </section>
      <form onSubmit={submit}>
        <label>留言内容<textarea name="content" required maxLength={80} rows={3} placeholder="写下想说的话，最多80字" /></label>
        <small>留言公开展示，请勿填写隐私信息。每30秒可发送一次。</small>
        {error && <p role="alert" className="message-board-error">{error}</p>}<p role="status">{notice}</p>
        <button className="message-board-submit" disabled={busy}>{busy ? '提交中…' : '发布留言'}</button>
      </form>
      </div>
    </dialog>}
  </>;
}
