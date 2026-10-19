# 网站访问统计

公众端 `analytics.js` 调用 `siteAnalytics`；馆员审核台读取其 `summary`。新建的 `siteAnalyticsCounters`、`siteAnalyticsVisitors`、`siteAnalyticsEvents` 三个集合必须为 `ADMINONLY`。

- PV：网站首页及版权声明页每次可见页面加载／刷新，成功上报后计一次。页面内切换点位、看照片、打开记忆不额外算PV。
- UV：按本域 localStorage 中随机UUID区分浏览器；服务端只存该值的SHA-256散列。累计UV全程去重，每日UV按北京时间分别去重，不能将每日UV相加当累计UV。
- 审核台不加载统计脚本；服务端排除启用中的馆员账号。成功进入审核台会将同域当前浏览器标记为排除。清除 `tuhui-analytics-excluded-v1` 才恢复该浏览器计数。
- 统计脚本不上传IP、姓名、手机号、正文、完整URL、查询参数或来源地址。每次载入生成独立事件ID；三次以内的网络重试复用同一ID，服务器事务同时写入去重回执和计数。
- 数据从首个成功公众访问开始。清缓存／换设备会增加UV；网络失败、存储被禁用、自动化浏览器或提前关闭页面可能漏计。此为运营统计，不能证明真实阅读完毕或严格防刷。
- 每个浏览器每分钟最多计120次；当前小规模网站用单个全局事务计数，出现写冲突时再改成分片计数。回执和每日匿名访客标记随访问量增长，应按实际资源使用评估保留期／TTL方案；清除回执会改变旧事件重放的去重保证。

部署：在本目录运行 `tcb fn deploy siteAnalytics --dir . --install-dependency true`。现有 FUNCTION 安全规则需在保留其他规则的同时增加 `"siteAnalytics":{"invoke":"auth != null"}`，否则网页端返回 `EXCEED_AUTHORITY`。不需要新密钥、不修改现有云函数环境变量。前端通过 GitHub Pages 发布。

验证：仓库根目录运行 `node tests/site-analytics.test.cjs` 和 `node tests/analytics-client.test.cjs`。`tests/analytics-ui.test.cjs` 需要本机8775预览服务，使用模拟统计数据验证审核台桌面／手机布局，不写生产数据。现有 `site-performance.test.cjs` 默认比较旧提交的五块石文案，当前已有已发布文案差异，不属于本次修改。
