/** Shared recommendation identity; placement is controlled by its parent. */
export default function RecommendationBadge({ className = "" }: { className?: string }) {
  return <span className={`recommendation-badge ${className}`.trim()}><img src="/optimized/xiaohongshu-avatar.webp" alt="" width="21" height="21" /><span>小骆力荐</span></span>;
}
