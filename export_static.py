from pathlib import Path
import shutil


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
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

    (OUT_DIR / ".nojekyll").write_text("", encoding="utf-8")

    guide = """# Gia phả dòng họ Nguyễn Hữu - bản public

Đây là phần giao diện để triển khai cùng Cloudflare Pages Functions. Dữ liệu gia phả không được đóng gói vào thư mục public nhằm bảo vệ yêu cầu đăng nhập.

Các file quan trọng:
- index.html
- styles.css
- app.js
- images/
- uploads/
"""
    (OUT_DIR / "README.md").write_text(guide, encoding="utf-8")
    print("Created public export in deploy-public")


if __name__ == "__main__":
    main()
