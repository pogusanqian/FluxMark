"""把 Barlow 子集化后以 base64 写进 miniprogram/app.wxss 的 fonts:begin / fonts:end 之间。

用法（需要一个装了 fontTools 的 Python）：

    python assets/fonts/build.py

只处理本目录下的 Barlow-Regular.ttf / Barlow-SemiBold.ttf，输出写进 app.wxss，
不在小程序包里留任何字体文件 —— Skyline 的 @font-face 只认 ttf，而本项目没有后端，
域名也没法进 downloadFile 白名单，字体只能内嵌。

重跑后 app.wxss 里只会变 fonts:begin / fonts:end 之间的内容，其余部分原样保留。
"""

import base64
import os
import tempfile

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
APP_WXSS = os.path.join(REPO, "miniprogram", "app.wxss")

# 正文用的字符集：ASCII 可打印 + 少量常驻标点（· × ° ¥ 连字/破折号 引号 省略号 ‰ € ™）。
# 不带 Latin-1 的重音字母（é ü ñ …）：界面里用不到，公司名真写了也只会让那一个字符回退到
# 系统字体，比让每个用户都多下 20KB 划算。汉字同理，由 font-family 后面的 sans-serif 接管。
UNICODES_TEXT = (
    "U+0020-007E,U+00B7,U+00D7,U+00B0,U+00A5,U+2010-2015,U+2018-201D,U+2026,"
    "U+2030,U+20AC,U+2122"
)

# 阶梯价专用（Medium 只给这张表用）：数字 + 价格里可能出现的符号，4KB 就够
UNICODES_NUMBER = "U+0030-0039,U+002E,U+002C,U+002D,U+002B,U+0025"

# 字体文件、字重、字符集：三档同属一个 family，靠 font-weight 区分。
# 500 那份刻意只留数字，避免为了"稍微粗一点"多下 20KB。
FACES = [
    ("Barlow-Regular.ttf", 400, UNICODES_TEXT),
    ("Barlow-Medium.ttf", 500, UNICODES_NUMBER),
    ("Barlow-SemiBold.ttf", 600, UNICODES_TEXT),
]

BEGIN = "/* fonts:begin */"
END = "/* fonts:end */"


def subset_ttf(src_path, unicodes):
    font = TTFont(src_path)
    options = subset.Options()
    # 只留 ASCII/Latin 里真正用得到的排版特性；ttf 的 hinting 对手机渲染没有意义，
    # 去掉后单档能省三分之一体积
    options.layout_features = ["kern", "liga", "clig", "calt"]
    options.hinting = False
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.drop_tables += ["DSIG"]

    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=subset.parse_unicodes(unicodes))
    sub.subset(font)

    fd, tmp = tempfile.mkstemp(suffix=".ttf")
    os.close(fd)
    try:
        font.save(tmp)
        with open(tmp, "rb") as f:
            return f.read()
    finally:
        os.remove(tmp)


def face_css(weight, ttf_bytes):
    b64 = base64.b64encode(ttf_bytes).decode("ascii")
    # MIME 写 font/ttf，不带 format() —— 少一层解析，Skyline 与 WebView 都认 url()
    return (
        "@font-face {\n"
        '  font-family: "Barlow";\n'
        "  font-style: normal;\n"
        f"  font-weight: {weight};\n"
        f'  src: url("data:font/ttf;base64,{b64}");\n'
        "}\n"
    )


def main():
    blocks = []
    for name, weight, unicodes in FACES:
        ttf = subset_ttf(os.path.join(HERE, name), unicodes)
        blocks.append(face_css(weight, ttf))
        print(f"{name}: {len(ttf)} B ttf -> {len(blocks[-1])} B css")

    with open(APP_WXSS, "r", encoding="utf-8", newline="") as f:
        wxss = f.read()

    begin = wxss.index(BEGIN) + len(BEGIN)
    end = wxss.index(END)
    injected = "\n" + "\n".join(blocks) + "\n"
    wxss = wxss[:begin] + injected + wxss[end:]

    with open(APP_WXSS, "w", encoding="utf-8", newline="") as f:
        f.write(wxss)

    print(f"{APP_WXSS}: {len(wxss)} B")


if __name__ == "__main__":
    main()
