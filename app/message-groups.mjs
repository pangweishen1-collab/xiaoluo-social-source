export function groupMessagesByDay(messages) {
  const groups = new Map();
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const message of messages) {
    const valid = typeof message.createdAt === 'number' && Number.isFinite(new Date(message.createdAt).getTime());
    const day = valid ? format.format(new Date(message.createdAt)) : '';
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(message);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, messages: items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) }));
}
