from pathlib import Path
import json
import shutil


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_FILE = BASE_DIR / "data" / "family.json"
UPLOADS_DIR = BASE_DIR / "uploads"
OUT_DIR = BASE_DIR / "deploy-public"


def copy_tree(src, dst):
    if not src.exists():
        return
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def main():
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    for name in ["index.html", "styles.css", "app.js"]:
        shutil.copy2(PUBLIC_DIR / name, OUT_DIR / name)

    copy_tree(PUBLIC_DIR / "images", OUT_DIR / "images")
    copy_tree(UPLOADS_DIR, OUT_DIR / "uploads")

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    (OUT_DIR / "family.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUT_DIR / ".nojekyll").write_text("", encoding="utf-8")

    guide = """# Gia phả dòng họ Nguyễn Hữu - bản public

Đây là bản xem công khai dạng static. Có thể đưa nguyên thư mục này lên GitHub Pages, Cloudflare Pages, Netlify hoặc hosting tĩnh khác.

Các file quan trọng:
- index.html
- styles.css
- app.js
- family.json
- images/
- uploads/

Muốn cập nhật dữ liệu: sửa trong web admin ở máy, sau đó chạy lại:

python export_static.py
"""
    (OUT_DIR / "README.md").write_text(guide, encoding="utf-8")
    print("Created public export in deploy-public")


if __name__ == "__main__":
    main()
