# Web gia pha dong ho

Ung dung gom hai phan:

- Trang xem cong khai: `http://127.0.0.1:8000/`
- Trang admin: `http://127.0.0.1:8000/admin`

## Chay web

```powershell
cd "D:\KHOA HỌC KĨ THUẬT\web-gia-pha"
python server.py
```

Tai khoan mac dinh:

- Tai khoan: `admin`
- Mat khau: `admin123`

Khi dua len may chu that, hay doi bang bien moi truong:

```powershell
$env:FAMILY_ADMIN_USER="ten_admin"
$env:FAMILY_ADMIN_PASSWORD="mat_khau_manh"
$env:FAMILY_SECRET="chuoi_bi_mat_dai"
python server.py
```

## Du lieu

- File chinh: `data/family.json`
- Anh ca nhan: `uploads/photos`

Co the sao luu ca thu muc `web-gia-pha` de giu toan bo web, du lieu va anh.

## Tao ban public de dua len hosting mien phi

Ban public chi de xem, khong co admin. Chay:

```powershell
python export_static.py
```

Thu muc `deploy-public` se duoc tao ra. Co the dua thu muc nay len GitHub Pages hoac Cloudflare Pages de nguoi khac xem duoc ke ca khi may tinh cua ban tat.

## Dua len GitHub Pages de tat may van xem duoc

Repo nay co san workflow `.github/workflows/pages.yml`. Moi lan day code len nhanh `main`, GitHub se tu chay `python export_static.py` va dua thu muc `deploy-public` len GitHub Pages.

Lan dau can vao GitHub repository `Settings -> Pages`, chon nguon `GitHub Actions`. Sau khi workflow chay xong, link public thuong co dang:

```text
https://tinhn2437-gif.github.io/Giaphadongho/
```

Sau moi lan sua du lieu/admin tren may, chay:

```powershell
python export_static.py
git add .
git commit -m "Update family tree"
git push origin main
```

Luu y: GitHub Pages la ban public static, ai co link thi xem duoc. Neu muon bat dang nhap that su khi may tinh tat, can mot backend online nhu Cloudflare Workers/Pages Functions kem database.

## Nhap CSV hang loat

Trong trang admin co nut `Nhap CSV`. Dong dau tien la tieu de cot. Cac cot duoc ho tro:

```csv
fullName,gender,familyRole,birthDate,deathDate,hometown,currentResidence,daughterInLawFather,daughterInLawMother,job,achievements,fatherName,motherName,spouseNames,photo,notes
Nguyen Van A,Nam,Con trai,1970-01-20,,Ha Tinh,Ha Noi,,,Giao vien,"Giao vien gioi cap huyen;Bang khen cap tinh",,,Tran Thi B,,Ghi chu
Tran Thi B,Nu,Con dau,1972-05-12,,Nghe An,Ha Noi,Tran Van C,Le Thi D,Bac si,,,"","Nguyen Van A",,
```

Ngay nen viet theo dang `YYYY-MM-DD`. Cot `familyRole` co the la `Con trai`, `Con gai`, `Con dau`, hoac `Khac`. Cot `achievements` va `spouseNames` co the co nhieu muc, ngan cach bang dau cham phay `;`.
