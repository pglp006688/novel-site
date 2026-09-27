#!/usr/bin/env python3
# -*- coding: utf-8 -*-


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

# 匹配 <!-- novel ... --> 元数据块
META_RE = re.compile(r"<!--\s*novel\s*\n(.*?)\n\s*-->", re.DOTALL | re.IGNORECASE)


def parse_args():
    p = argparse.ArgumentParser(description="Novel-Site 构建脚本")
    p.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""),
                   help="owner/repo，默认取 $GITHUB_REPOSITORY")
    p.add_argument("--token", default=os.environ.get("GITHUB_TOKEN", ""),
                   help="GitHub Token，默认取 $GITHUB_TOKEN")
    p.add_argument("--out", default=".", help="输出根目录，默认当前目录")
    p.add_argument("--api", default=API, help="GitHub API 地址")
    return p.parse_args()


def gh_get(url, token):
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", USER_AGENT)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_issues(api, repo, token):
    issues = []
    page = 1
    while True:
        url = ("%s/repos/%s/issues?state=all&per_page=100&page=%d"
               "&sort=created&direction=asc" % (api, repo, page))
        try:
            data = gh_get(url, token)
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


def slugify(text):
    """纯 ASCII slug，避免 URL 编码问题。"""
    s = (text or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if not s:
        s = "book-" + hashlib.md5((text or "book").encode("utf-8")).hexdigest()[:10]
    return s[:60]


def parse_issue_title(title):
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


def parse_novel_meta(body):
    """
    从正文中提取 <!-- novel ... --> 元数据块，返回 (meta_dict, cleaned_body)。
    支持多行，每行格式：key: value
    """
    meta = {}
    if not body:
        return meta, ""

    def repl(m):
        for line in m.group(1).split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                k = k.strip().lower()
                v = v.strip()
                if k and v:
                    meta[k] = v
        return ""

    cleaned = META_RE.sub(repl, body)
    return meta, cleaned


def iso_date(s):
    if not s:
        return ""
    try:
        dt = datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return s[:10]


def render_markdown(text):
    try:
        import markdown
        md = markdown.Markdown(
            extensions=["extra", "sane_lists", "nl2br", "toc"],
            output_format="html5",
        )
        return md.convert(text or "")
    except ImportError:
        return simple_markdown(text or "")


def simple_markdown(text):
    """无第三方依赖时的降级渲染。"""
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
        s = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", r'<img src="\2" alt="\1">', s)
        s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', s)
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


def main():
    args = parse_args()

    if not args.repo or "/" not in args.repo:
        print("✗ 缺少仓库信息。请设置 GITHUB_REPOSITORY=owner/repo 或使用 --repo",
              file=sys.stderr)
        sys.exit(1)

    out_root = os.path.abspath(args.out)

    print("→ 仓库：%s" % args.repo)
    print("→ 输出：%s" % out_root)
    print("→ 拉取 Issues ...")

    issues = fetch_issues(args.api, args.repo, args.token)
    print("  共 %d 条 Issue" % len(issues))

    chapters_dir = os.path.join(out_root, "chapters")
    if os.path.isdir(chapters_dir):
        shutil.rmtree(chapters_dir)
    os.makedirs(chapters_dir, exist_ok=True)

    # ----------------------------------------------------------
    # 第一遍：初始化作品，收集 meta（封面 / 简介 / 标签）
    # ----------------------------------------------------------
    books = {}
    skipped = 0

    for it in issues:
        parsed = parse_issue_title(it.get("title", ""))
        if not parsed:
            skipped += 1
            continue
        book_name, author, _ = parsed
        slug = slugify(book_name)

        if slug not in books:
            books[slug] = {
                "slug": slug,
                "title": book_name,
                "author": author,
                "desc": "",
                "tags": [],
                "cover": "",
                "updated": "",
                "chapters": [],
            }

        b = books[slug]
        meta, _ = parse_novel_meta(it.get("body") or "")

        if meta.get("cover") and not b["cover"]:
            b["cover"] = meta["cover"]
        if meta.get("intro") and not b["desc"]:
            b["desc"] = meta["intro"]
        if not b["tags"]:
            b["tags"] = [lb.get("name", "") for lb in (it.get("labels") or []) if lb.get("name")]

    # ----------------------------------------------------------
    # 第二遍：填充章节，生成 HTML
    # ----------------------------------------------------------
    for it in issues:
        parsed = parse_issue_title(it.get("title", ""))
        if not parsed:
            continue
        book_name, author, chapter_name = parsed
        slug = slugify(book_name)
        book = books.get(slug)
        if not book:
            continue

        body_raw = it.get("body") or ""
        _, cleaned_body = parse_novel_meta(body_raw)

        # 自动简介：仅在用户没有写 intro 时使用
        if not book["desc"]:
            plain = re.sub(r"[#*`>\-\[\]()!]", "", cleaned_body)
            plain = re.sub(r"\s+", " ", plain).strip()
            if plain:
                book["desc"] = plain[:80] + ("…" if len(plain) > 80 else "")

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

        target = os.path.join(out_root, rel_file)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(render_markdown(cleaned_body))

        if date > book["updated"]:
            book["updated"] = date

    # ----------------------------------------------------------
    # 输出
    # ----------------------------------------------------------
    book_list = []
    for slug in sorted(books.keys()):
        b = books[slug]
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
    with_cover = sum(1 for b in book_list if b["cover"])
    print("  作品 %d 部 / 章节 %d 章 / 自定义封面 %d 部"
          % (len(book_list), total_ch, with_cover))
    if skipped:
        print("  跳过 %d 条不符合「作品名/作者/章节名」的 Issue" % skipped)
    print("✓ 构建完成：%s" % data_path)


if __name__ == "__main__":
    main()
