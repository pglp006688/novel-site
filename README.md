# Novel-Site

在 GitHub Issues 上写作，用 Actions 自动构建的静态小说网。

写一条 Issue 就是更新一章，推送即发布，无需服务器、无需数据库。

![Build and Deploy](https://github.com/pglp006688/novel-site/actions/workflows/build.yml/badge.svg)

[![Use this template](https://img.shields.io/badge/Use%20this-template-2ea44f?style=for-the-badge&logo=github)](https://github.com/pglp006688/novel-site/generate)
---

## 特性

- **Issue 即章节** —— 标题写 `作品名/作者/章节名`，正文写 Markdown，自动成书
- **自动构建** —— 新建、编辑、关闭 Issue 都会触发 Actions 重新部署
- **书城首页** —— 作品卡片带封面、简介、标签、章节数，支持搜索与排序
- **沉浸阅读** —— 衬线字体、目录侧栏、上一章 / 下一章、键盘左右键翻页
- **自定义封面与简介** —— 在 Issue 正文里写一段 `<!-- novel -->` 元数据块即可
- **亮暗主题** —— 自动跟随系统，手动切换后记忆偏好
- **阅读偏好** —— 字号调节本地保存，刷新不丢失
- **纯静态** —— 部署在 GitHub Pages，零成本、零运维

---

## 快速开始

### 1. 通过模板创建仓库 (https://github.com/pglp006688/novel-site/generate)


### 2. 开启 GitHub Pages

仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

### 3. 开启 Actions 权限

**Settings → Actions → General → Workflow permissions** 选择 **Read and write permissions**，保存。

### 4. 写第一条 Issue

新建 Issue，标题格式：

```
星海拾遗/陆时舟/第一章 漂流物
```

正文随便写一段 Markdown，提交。几秒后 Actions 会自动构建并部署。

### 5. 访问站点

```
https://你的用户名.github.io/你的仓库名/
```

---

## 写作格式

### 标题

每条 Issue 的标题必须是三段式：

```
作品名/作者/章节名
```

**示例：**

```
星海拾遗/陆时舟/第一章 漂流物
星海拾遗/陆时舟/第二章 回声
长安客栈/沈砚/第一章 雨夜来客
```

**规则：**

- 用半角斜杠 `/` 分隔，前后空格会被自动去掉
- 作品名、作者、章节名都不能为空
- 同一作品的所有 Issue，**作品名和作者必须完全一致**
- 章节顺序按 Issue 创建时间升序自动编号
- 不符合格式的 Issue 会被跳过，不影响构建

### 正文

Issue 正文就是章节内容，支持完整 Markdown：

- 标题 `# 一`
- 加粗 `**文字**`、斜体 `*文字*`
- 引用 `> 文字`
- 列表 `- 项目`、`1. 项目`
- 链接 `[文字](url)`
- 图片 `![描述](url)`
- 代码块 ` ``` `
- 分隔线 `---`
- 表格

### 标签

给 Issue 打上的 labels 会成为这部作品的标签。建议同一作品的所有 Issue 打相同的标签。

### 封面与简介

在任意一条该作品的 Issue 正文里（通常放在第一章最前面）加入元数据块：

```markdown
<!-- novel
cover: https://example.com/cover.jpg
intro: 在废弃空间站里，拾荒者捡到了一段不属于任何已知文明的记忆。
-->

头灯熄灭的瞬间，舱壁上的锈迹忽然亮了一下……
```

**规则：**

| 字段 | 说明 |
|------|------|
| `cover` | 封面图 URL，支持完整链接或仓库内相对路径（如 `images/xinghai.jpg`） |
| `intro` | 自定义简介，写一行，长度不限；写了它就不再自动提取正文前 80 字 |

- 元数据块会被构建脚本从正文里移除，阅读页不会看到
- 同一作品多个 Issue 都写了 meta，以最先出现的为准
- 不写 meta 时：封面显示书名首字，简介自动取正文前 80 字

### 许可证
GPLv3
