#!/usr/bin/env python3
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
META_RE = re.compile(r"<!--\s*novel\s*\n(.*?)\n\s*-->", re.DOTALL | re.IGNORECASE)
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)

CHAPTER_RE = re.compile(
    r"^\s*("
    r"第\s*[0-9一二三四五六七八九十百千万零两]+\s*[章回节卷篇]"
    r"|Chapter\s+\d+"
    r"|序章|序言|序|楔子|引子|尾声|后记|番外"
    r")[^\n]*$",
    re.MULTILINE | re.IGNORECASE,
)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    p.add_argument("--token", default=os.environ.get("GITHUB_TOKEN", ""))
    p.add_argument("--out", default=".")
    p.add_argument("--api", default=API)
    return p.parse_args()


def load_config(path):
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print("  config.json 读取失败: %s" % e)
        return {}


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
            print("HTTP error: %s" % e, file=sys.stderr)
            sys.exit(1)
        except urllib.error.URLError as e:
            print("Network error: %s" % e, file=sys.stderr)
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

    return meta, META_RE.sub(repl, body)


def parse_txt_meta(text):
    meta = {}

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

    cleaned = META_RE.sub(repl, text)
    cleaned = HTML_COMMENT_RE.sub("", cleaned)
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


def read_text_file(path):
    with open(path, "rb") as f:
        raw = f.read()
    for enc in ("utf-8-sig", "utf-8", "gb18030", "gbk", "big5"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def split_chapters(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    chapters = []
    cur_title = None
    cur_lines = []

    def push():
        if cur_title is None and not any(l.strip() for l in cur_lines):
            return
        chapters.append({
            "title": (cur_title or "正文").strip(),
            "body": "\n".join(cur_lines).strip(),
        })

    for line in lines:
        if CHAPTER_RE.match(line):
            push()
            cur_title = line.strip()
            cur_lines = []
        else:
            cur_lines.append(line)
    push()

    return [c for c in chapters if c["body"] or c["title"] != "正文"]


def text_to_html(text):
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    return "\n".join("<p>%s</p>" % html.escape(p) for p in paras)


def build_novels(out_root):
    novels_dir = os.path.join(out_root, "novels")
    if not os.path.isdir(novels_dir):
        return []

    out_dir = os.path.join(novels_dir, "_out")
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    books = []
    txts = sorted(
        f for f in os.listdir(novels_dir)
        if f.lower().endswith(".txt") and os.path.isfile(os.path.join(novels_dir, f))
    )

    print("  novels txt: %d" % len(txts))

    for fname in txts:
        path = os.path.join(novels_dir, fname)
        base = fname[:-4]

        if "-" in base:
            f_title, f_author = base.split("-", 1)
            f_title, f_author = f_title.strip(), f_author.strip()
        else:
            f_title, f_author = base.strip(), "未知"

        try:
            raw_text = read_text_file(path)
        except Exception as e:
            print("  skip %s: %s" % (fname, e))
            continue

        meta, text = parse_txt_meta(raw_text)

        title = (meta.get("title") or f_title).strip()
        author = (meta.get("author") or f_author).strip()
        cover = (meta.get("cover") or "").strip()
        intro = (meta.get("intro") or "").strip()
        tags_str = (meta.get("tags") or "").strip()

        if not title:
            continue

        tags = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else ["txt"]
        if "txt" not in tags:
            tags.append("txt")

        slug = "txt-" + slugify(title)

        chapters = split_chapters(text)
        if not chapters:
            print("  skip %s: 未解析到章节" % fname)
            continue

        mtime = datetime.fromtimestamp(
            os.path.getmtime(path), tz=timezone.utc
        ).strftime("%Y-%m-%d")

        book_dir = os.path.join(out_dir, slug)
        os.makedirs(book_dir, exist_ok=True)

        ch_list = []
        for n, ch in enumerate(chapters, 1):
            rel_file = "novels/_out/%s/%d.html" % (slug, n)
            with open(os.path.join(book_dir, "%d.html" % n), "w", encoding="utf-8") as f:
                f.write(text_to_html(ch["body"]))
            ch_list.append({
                "n": n,
                "title": ch["title"],
                "date": mtime,
                "file": rel_file,
                "source": "txt",
            })

        if intro:
            desc = intro
        else:
            first_body = chapters[0]["body"] if chapters else ""
            plain = re.sub(r"\s+", " ", first_body).strip()
            desc = plain[:80] + ("…" if len(plain) > 80 else "")

        books.append({
            "slug": slug,
            "title": title,
            "author": author,
            "desc": desc,
            "tags": tags,
            "cover": cover,
            "updated": mtime,
            "chapters": ch_list,
        })

    data = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "books": books,
    }

    with open(os.path.join(out_dir, "data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("  novels parsed: %d" % len(books))
    return books


def main():
    args = parse_args()

    if not args.repo or "/" not in args.repo:
        print("Missing repo: set GITHUB_REPOSITORY or use --repo", file=sys.stderr)
        sys.exit(1)

    out_root = os.path.abspath(args.out)

    cfg = load_config(os.path.join(out_root, "config.json"))
    txt_enabled = bool((cfg.get("txt") or {}).get("enabled", False))

    print("Repo: %s" % args.repo)
    print("Out: %s" % out_root)
    print("TXT import: %s" % ("enabled" if txt_enabled else "disabled"))
    print("Fetching issues ...")

    issues = fetch_issues(args.api, args.repo, args.token)
    print("  total: %d" % len(issues))

    chapters_dir = os.path.join(out_root, "chapters")
    if os.path.isdir(chapters_dir):
        shutil.rmtree(chapters_dir)
    os.makedirs(chapters_dir, exist_ok=True)

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

    book_list = []
    for slug in sorted(books.keys()):
        b = books[slug]
        b["chapters"].sort(key=lambda c: c["n"])
        book_list.append(b)

    book_list.sort(key=lambda b: b.get("updated", ""), reverse=True)

    txt_books = []
    if txt_enabled:
        print("Building novels from txt ...")
        txt_books = build_novels(out_root)
    else:
        out_dir = os.path.join(out_root, "novels", "_out")
        if os.path.isdir(out_dir):
            shutil.rmtree(out_dir)
        print("  novels: skipped (config.txt.enabled = false)")

    data = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "repo": args.repo,
        "books": book_list,
    }

    data_path = os.path.join(out_root, "data.js")
    with open(data_path, "w", encoding="utf-8") as f:
        f.write("window.NOVEL_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    total_ch = sum(len(b["chapters"]) for b in book_list)
    print("  issues books: %d, chapters: %d" % (len(book_list), total_ch))
    print("  txt books: %d" % len(txt_books))
    if skipped:
        print("  skipped: %d" % skipped)
    print("Done.")


if __name__ == "__main__":
    main()
