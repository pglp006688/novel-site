#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Novel-Site 构建脚本
-------------------
从 GitHub Issues 拉取小说章节，生成：
  data.js                      作品与章节元数据
  chapters/<slug>/<n>.html     每章正文 HTML

Issue 标题格式：  作品名/作者/章节名
例如：            星海拾遗/陆时舟/第三章 协议之外

用法：
  GITHUB_REPOSITORY=user/repo GITHUB_TOKEN=xxx python3 scripts/build.py
  python3 scripts/build.py --repo user/repo --token xxx --out .
"""

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

API = "https://api.github.com"
USER_AGENT = "Novel-Site-Builder/1.0"

# ------------------------------------------------------------------
# 参数与环境
# ------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Novel-Site 构建脚本")
    p.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""),
                   help="owner/repo，默认取 $GITHUB_REPOSITORY")
    p.add_argument("--token", default=os.environ.get("GITHUB_TOKEN", ""),
                   help="GitHub Token，默认取 $GITHUB_TOKEN")
    p.add_argument("--out", default=".", help="输出根目录，默认当前目录")
    p.add_argument("--api", default=API, help="GitHub API 地址（GitHub Enterprise 可改）")
    return p.parse_args()


# ------------------------------------------------------------------
# HTTP
# ------------------------------------------------------------------
def gh_get(url, token):
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", USER_AGENT)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8")), resp.headers


def fetch_issues(api, repo, token):
    """分页拉取全部 Issue（跳过 Pull Request）。"""
    issues = []
    page = 1
    while True:
        url = ("%s/repos/%s/issues?state=all&per_page=100&page=%d"
               "&sort=created&direction=asc" % (api, repo, page))
        try:
            data, _ = gh_get(url, token)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print("✗ 仓库不存在或无权限：%s" % repo, file=sys.stderr)
            elif e.code == 403:
                print("✗ API 限流或权限不足（可设置 GITHUB_TOKEN）", file=sys.stderr)
            else:
                print("✗ GitHub API 错误：%s" % e, file=sys.stderr)
            sys.exit(1)
        except urllib.error.URLError as e:
            print("✗ 网络错误：%s" % e, file=sys.stderr)
            sys.exit(1)

        if not data:
            break
        for it in data:
            if "pull_request" in it:
                continue
            issues.append(it)
        if len(data) < 100:
            break
        page += 1
    return issues


# ------------------------------------------------------------------
# 工具
# ------------------------------------------------------------------
def slugify(text):
    s = (text or "").strip().lower()
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    if not s:
        s = hashlib.md5((text or "book").encode("utf-8")).hexdigest()[:8]
    return s[:60]


def parse_issue_title(title):
    """解析 '作品名/作者/章节名'，返回 (book, author, chapter) 或 None。"""
    if not title:
        return None
    parts = [p.strip() for p in re.split(r"\s*/\s*", title)]
    if len(parts) < 3:
        return None
    book = parts[0]
    author = parts[1]
    chapter = " / ".join(parts[2:]).strip()
    if not book or not author or not chapter:
        return None
    return book, author, chapter


def iso_date(s):
    """把 GitHub 的时间字符串转成 YYYY-MM-DD。"""
    if not s:
        return ""
    try:
        dt = datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return s[:10]


# ------------------------------------------------------------------
# Markdown → HTML
# ------------------------------------------------------------------
def render_markdown(text):
    try:
        import markdown  # pip install markdown
        md = markdown.Markdown(
            extensions=["extra", "sane_lists", "nl2br", "toc"],
            output_format="html5",
        )
        return md.convert(text or "")
    except ImportError:
        return simple_markdown(text or "")


def simple_markdown(text):
    """无第三方依赖时的降级渲染，覆盖常用语法。"""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out = []
    in_code = False
    in_ul = False
    in_ol = False
    in_quote = False

    def close_lists():
        nonlocal in_ul, in_ol, in_quote
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False
        if in_quote:
            out.append("</blockquote>")
            in_quote = False

    def inline(s):
        s = html.escape(s, quote=False)
        s = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)",
                   r'<img src="\2" alt="\1">', s)
        s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)",
                   r'<a href="\2">\1</a>', s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", s)
        s = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"<em>\1</em>", s)
        return s

    for raw in lines:
        line = raw.rstrip()

        if line.strip().startswith("```"):
            close_lists()
            if in_code:
                out.append("</code></pre>")
                in_code = False
            else:
                out.append("<pre><code>")
                in_code = True
            continue
        if in_code:
            out.append(html.escape(raw))
            continue

        if not line.strip():
            close_lists()
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            close_lists()
            lvl = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (lvl, inline(m.group(2)), lvl))
            continue

        if re.match(r"^\s*([-*_])\s*(\1\s*){2,}$", line):
            close_lists()
            out.append("<hr>")
            continue

        if line.lstrip().startswith(">"):
            if not in_quote:
                close_lists()
                out.append("<blockquote>")
                in_quote = True
            out.append("<p>%s</p>" % inline(line.lstrip()[1:].strip()))
            continue

        m = re.match(r"^\s*[-*+]\s+(.*)$", line)
        if m:
            if in_ol:
                out.append("</ol>")
                in_ol = False
            if in_quote:
                out.append("</blockquote>")
                in_quote = False
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append("<li>%s</li>" % inline(m.group(1)))
            continue

        m = re.match(r"^\s*\d+[.)]\s+(.*)$", line)
        if m:
            if in_ul:
                out.append("</ul>")
                in_ul = False
            if in_quote:
                out.append("</blockquote>")
                in_quote = False
            if not in_ol:
                out.append("<ol>")
                in_ol = True
            out.append("<li>%s</li>" % inline(m.group(1)))
            continue

        close_lists()
        out.append("<p>%s</p>" % inline(line))

    if in_code:
        out.append("</code></pre>")
    close_lists()
    return "\n".join(out)


# ------------------------------------------------------------------
# 主流程
# ------------------------------------------------------------------
def main():
    args = parse_args()

    if not args.repo or "/" not in args.repo:
        print("✗ 缺少仓库信息。请设置 GITHUB_REPOSITORY=owner/repo 或使用 --repo",
              file=sys.stderr)
        sys.exit(1)

    out_root = os.path.abspath(args.out)
    chapters_dir = os.path.join(out_root, "chapters")

    print("→ 仓库：%s" % args.repo)
    print("→ 输出：%s" % out_root)
    print("→ 拉取 Issues ...")

    issues = fetch_issues(args.api, args.repo, args.token)
    print("  共 %d 条 Issue" % len(issues))

    books = {}
    skipped = 0

    for it in issues:
        parsed = parse_issue_title(it.get("title", ""))
        if not parsed:
            skipped += 1
            continue
        book_name, author, chapter_name = parsed

        slug = slugify(book_name)
        book = books.setdefault(slug, {
            "slug": slug,
            "title": book_name,
            "author": author,
            "desc": "",
            "tags": [],
            "cover": "",
            "updated": "",
            "_first_created": it.get("created_at", ""),
            "chapters": [],
        })

        # 简介：取该作品第一条 Issue 正文的前 80 字
        if not book["desc"]:
            body_plain = re.sub(r"[#*`>\-\[\]()!]", "", it.get("body") or "")
            body_plain = re.sub(r"\s+", " ", body_plain).strip()
            if body_plain:
                book["desc"] = body_plain[:80] + ("…" if len(body_plain) > 80 else "")

        # 标签：Issue 的 label
        if not book["tags"]:
            book["tags"] = [lb.get("name", "") for lb in (it.get("labels") or []) if lb.get("name")]

        date = iso_date(it.get("created_at", ""))
        n = len(book["chapters"]) + 1
        rel_file = "chapters/%s/%d.html" % (slug, n)

        book["chapters"].append({
            "n": n,
            "title": chapter_name,
            "date": date,
            "file": rel_file,
            "issue": it.get("number"),
            "url": it.get("html_url", ""),
        })

        body_html = render_markdown(it.get("body") or "")
        target = os.path.join(out_root, rel_file)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(body_html)

        if date > book["updated"]:
            book["updated"] = date

    # 清理旧章节文件
    if os.path.isdir(chapters_dir):
        shutil.rmtree(chapters_dir)
    # 重新写入（上面写过的文件已被删掉，需重写）
    for slug, book in books.items():
        for ch in book["chapters"]:
            # 正文已在上一步写盘，但目录被 rmtree 了，这里重新生成
            pass

    # 重新生成一次章节文件（避免被 rmtree 清掉）
    for it in issues:
        parsed = parse_issue_title(it.get("title", ""))
        if not parsed:
            continue
        book_name = parsed[0]
        slug = slugify(book_name)
        book = books.get(slug)
        if not book:
            continue
        for ch in book["chapters"]:
            if ch.get("issue") == it.get("number"):
                target = os.path.join(out_root, ch["file"])
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as f:
                    f.write(render_markdown(it.get("body") or ""))
                break

    # 排序输出
    book_list = []
    for slug in sorted(books.keys()):
        b = books[slug]
        b.pop("_first_created", None)
        b["chapters"].sort(key=lambda c: c["n"])
        book_list.append(b)

    book_list.sort(key=lambda b: b.get("updated", ""), reverse=True)

    data = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "repo": args.repo,
        "books": book_list,
    }

    data_path = os.path.join(out_root, "data.js")
    with open(data_path, "w", encoding="utf-8") as f:
        f.write("/* 由 scripts/build.py 自动生成，请勿手动编辑 */\n")
        f.write("window.NOVEL_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    total_ch = sum(len(b["chapters"]) for b in book_list)
    print("  作品 %d 部 / 章节 %d 章" % (len(book_list), total_ch))
    if skipped:
        print("  跳过 %d 条不符合「作品名/作者/章节名」的 Issue" % skipped)
    print("✓ 构建完成：%s" % data_path)


if __name__ == "__main__":
    main()
