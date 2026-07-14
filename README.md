
## Chay web

```powershell
cd "D:\KHOA HỌC KĨ THUẬT\web-gia-pha"
python server.py
```

Trang admin can tai khoan va mat khau rieng. Hay dat bang bien moi truong truoc khi chay server:

```powershell
$env:FAMILY_ADMIN_USER="ten_admin"
$env:FAMILY_ADMIN_PASSWORD="mat_khau_manh"
$env:FAMILY_SECRET="chuoi_bi_mat_dai"
python server.py
```

## Danh tinh va phan quyen tren Cloudflare

Moi tai khoan co the duoc gan voi mot nguoi trong gia pha de tinh cach xung ho ca nhan. Cac quyen:

- `admin`: quan ly tai khoan, duyet de nghi va sua toan bo gia pha.
- `clan_head`: Truong ho, sua truc tiep toan bo thong tin gia pha.
- `member`: chi gui de nghi sua ho so cua minh, vo/chong va con; Admin phai duyet moi cong khai.
- `viewer`: chi dang nhap va xem.

Bang `family_change_requests` luu lich su cho duyet/da duyet/tu choi. Tai khoan Admin goc khong the bi xoa hoac ha quyen.

Neu muon tam thoi tat dang nhap trang xem khi chay server:

```powershell
$env:FAMILY_REQUIRE_VIEW_LOGIN="0"
python server.py
```

## Du lieu

- File chinh: `data/family.json`
- Anh ca nhan: `uploads/photos`
- Tai khoan nguoi xem: `data/users.json`

Co the sao luu ca thu muc `web-gia-pha` de giu toan bo web, du lieu va anh.

## Luu anh len Cloudflare R2

Web van luu anh local vao `uploads/photos`. Neu cau hinh Cloudflare R2, khi admin upload anh web se day them anh len R2 va luu link public R2 vao gia pha.

Theo tai lieu Cloudflare R2, R2 ho tro S3-compatible API va endpoint co dang `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Bucket muon hien anh tren web can co public URL/custom domain.

Dat cac bien moi truong truoc khi chay server:

```powershell
$env:R2_ACCOUNT_ID="account_id_cloudflare"
$env:R2_ACCESS_KEY_ID="access_key_id"
$env:R2_SECRET_ACCESS_KEY="secret_access_key"
$env:R2_BUCKET="ten_bucket"
$env:R2_PUBLIC_URL="https://ten-public-domain-hoac-r2-dev"
python server.py
```

Neu chua dien cac bien nay, upload anh van hoat dong bang luu local nhu cu.

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

Luu y: GitHub Pages la ban public static. Nut dang ky/dang nhap tren ban static chi khoa giao dien trong trinh duyet, khong bao mat that su vi file `family.json` van la file tinh. Neu muon bat dang nhap that su khi may tinh tat, can mot backend online nhu Cloudflare Workers/Pages Functions kem database.

## Nhap CSV hang loat

Trong trang admin co nut `Nhap CSV`. Dong dau tien la tieu de cot. Cac cot duoc ho tro:

```csv
fullName,gender,familyRole,birthDate,deathDate,hometown,currentResidence,daughterInLawFather,daughterInLawMother,job,achievements,fatherName,motherName,spouseNames,photo,notes
Nguyen Van A,Nam,Con trai,1970-01-20,,Ha Tinh,Ha Noi,,,Giao vien,"Giao vien gioi cap huyen;Bang khen cap tinh",,,Tran Thi B,,Ghi chu
Tran Thi B,Nu,Con dau,1972-05-12,,Nghe An,Ha Noi,Tran Van C,Le Thi D,Bac si,,,"","Nguyen Van A",,
```

Ngay nen viet theo dang `YYYY-MM-DD`. Cot `familyRole` co the la `Con trai`, `Con gai`, `Con dau`, hoac `Khac`. Cot `achievements` va `spouseNames` co the co nhieu muc, ngan cach bang dau cham phay `;`.
