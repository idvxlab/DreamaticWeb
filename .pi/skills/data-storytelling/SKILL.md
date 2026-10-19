---
name: data-storytelling
description: Convert spreadsheet evidence into honest data-driven page sections.
roles: [analyst, designer]
metadata:
  roles: [analyst, designer]
  formats: [xlsx, csv, tsv, pdf]
  tasks: [data-analysis, dashboard]
  permissions: [guidance]
---

Check headers, units, periods, missing cells and formula results before using values. Do not sum incompatible units. Present clear tables with captions or CSS bar charts with textual values. Label filtered or truncated data. Include source labels. State uncertainty instead of manufacturing trends.

## 输入与输出

输入：表格及其单位、期间、来源 ID、缺失/截断标记。

输出及错误处理：Analyst 保持 JSON 契约，Designer 保持完整 HTML；缺单位或期间时标记不确定性。

权限：只提供知识指导，不执行命令、网络请求或本地脚本。未知来源与模型不可见内容不能当作已验证事实。
