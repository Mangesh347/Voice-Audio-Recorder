from pathlib import Path
import re

path = Path(r"C:\Users\Lenovo\Projects\fenwick-recorder\popup.css")
text = path.read_text(encoding="utf-8")

pattern = re.compile(r'(html\[data-theme="dark"\][^{]*\{)(.*?)(\})', re.S)


def remap(match: re.Match[str]) -> str:
    head, body, tail = match.group(1), match.group(2), match.group(3)
    body = body.replace("#1D8BE7", "#00BFFF").replace("#1d8be7", "#00BFFF")
    body = re.sub(
        r"rgba\(\s*29\s*,\s*139\s*,\s*231\s*,\s*([\d.]+)\s*\)",
        r"rgba(0, 191, 255, \1)",
        body,
    )
    body = body.replace("#e2ccff", "#00BFFF")
    return head + body + tail


updated, count = pattern.subn(remap, text)
path.write_text(updated, encoding="utf-8")
print(f"dark blocks updated: {count}")
