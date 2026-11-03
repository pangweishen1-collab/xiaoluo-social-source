# 行业需求后台收件箱

POST /api/business-inquiries 校验后保存至 D1 business_inquiries，不再发送邮件。
管理模式下，商务首屏「查看需求」打开完整需求弹窗。GET /api/admin/business-inquiries?page=1 复用后台会话认证，每页20条，按提交时间倒序。响应禁止缓存，未登录返回401。
发布前执行 drizzle/0002_business_inquiries.sql 到目标 D1，不在请求中创建表。
历史发送失败的表单没有记录，无法补回。生产迁移与发布需用户明确要求。
