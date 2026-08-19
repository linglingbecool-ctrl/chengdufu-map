# 图绘成都：川大馆藏《全图·成都府图》数字导览

这是一个可直接部署到 GitHub Pages 的静态单页网站原型。项目以四川大学图书馆馆藏《清初四川通省山川形胜全图》中的“四川成都府”图为基础，提供古图浏览、点位点击、古今对照和 Citywalk 路线展示。

## 文件结构

```text
.
├── index.html
├── style.css
├── script.js
├── points.json
├── chengdu-map-original.jpg
└── images/
    ├── jiuyanqiao-old.png
    ├── jiuyanqiao-current.jpg
    ├── wuhouci-old.png
    ├── wuhouci-current.jpg
    ├── wenshuyuan-old.png
    ├── wenshuyuan-current.jpg
    ├── qingyanggong-old.png
    ├── qingyanggong-current.jpg
    ├── mancheng-old.png
    ├── mancheng-current.jpg
    ├── hongpailou-old.png
    └── hongpailou-current.svg
```

## 使用方式

1. 当前 `chengdu-map-original.jpg` 直接缩放自馆藏成都府图原始扫描图，不使用建模底图；点位坐标以这张原图为百分比基准。
2. 将后续点位局部图和今景图放入仓库，并在 `points.json` 中更新 `oldImage`、`currentImage`。
3. 在 GitHub 仓库中启用 Pages，部署分支选择 `main` 或 `gh-pages` 的根目录即可。

## 数据维护

点位数据统一写在 `points.json`。六个重点点位与其余原图地名点均可从地图进入公众投稿。每个点位包含：

- `nameAncient`：古图名称
- `nameModern`：今名
- `type`：点位类型
- `status`：存续点、变迁点或不确定点
- `x`、`y`：点位在地图上的百分比坐标
- `quick`：50-80 字快读说明
- `extended`：约 200 字延展说明
- `oldImage`、`currentImage`：古图局部图和今景图路径
- `source`：资料来源或待校核说明

## 说明

本项目为四川大学图书馆古籍特藏资源活化展示项目的网页原型。图片和文字仅用于学习、研究和文化传播；正式发布前应继续核验馆藏图像授权、点位释读依据和现地影像来源。
