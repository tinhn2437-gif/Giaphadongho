# Hệ thống gia phả trực tuyến

Đây là mã nguồn của một hệ thống gia phả có đăng nhập, phân quyền, quản trị thành viên và lưu trữ trực tuyến. Tài liệu này dùng để bảo trì và bàn giao cho các thế hệ sau.

> **Nguyên tắc bảo mật:** kho mã nguồn không được chứa tên đăng nhập thật, mật khẩu, API Token, khóa bí mật, số điện thoại cá nhân, Cloudflare Account ID, Database ID, bản sao cơ sở dữ liệu hoặc đường dẫn riêng trên máy tính.

## Chức năng chính

- Sơ đồ gia phả nhiều thế hệ, hỗ trợ vợ/chồng và nhiều nhánh con cháu.
- Tìm kiếm tên trực tiếp trong các ô chọn người.
- Xem thông tin cá nhân, ảnh, nghề nghiệp, học vấn, thành tích và phần mộ.
- Tra cứu cách xưng hô dựa trên quan hệ trong gia phả.
- Bảng vàng học vấn, học hàm, học vị và thành tích.
- Xuất danh sách thành viên ra Excel.
- Tài khoản xem, thành viên, trưởng họ, Admin phụ và Admin gốc.
- Thành viên chỉ được đề nghị sửa nhánh gia đình của mình; Admin duyệt trước khi công khai.
- Giao diện riêng cho máy tính và điện thoại.

## Kiến trúc hệ thống

Hệ thống đang dùng:

- **Cloudflare Pages:** phục vụ giao diện và Pages Functions.
- **Cloudflare D1:** lưu gia phả, tài khoản, ảnh và lịch sử duyệt.
- **GitHub:** lưu mã nguồn và lịch sử thay đổi; không lưu dữ liệu gia phả thật.
- **JavaScript thuần:** giao diện không phụ thuộc framework lớn, dễ duy trì lâu dài.

Luồng dữ liệu:

1. Người dùng mở trang và đăng nhập.
2. Pages Functions kiểm tra cookie đã ký.
3. Functions đọc dữ liệu từ D1.
4. Giao diện dựng sơ đồ, danh sách hoặc bảng vàng.
5. Thay đổi của thành viên được lưu thành yêu cầu chờ duyệt.
6. Admin duyệt thì dữ liệu mới được ghi vào gia phả công khai.

## Cấu trúc thư mục

| Đường dẫn | Mục đích |
|---|---|
| `public/app.js` | Giao diện, sơ đồ, tìm kiếm, biểu mẫu và xử lý phía trình duyệt |
| `public/styles.css` | Toàn bộ kiểu hiển thị máy tính và điện thoại |
| `public/images/` | Ảnh nền và tài nguyên giao diện không chứa dữ liệu cá nhân |
| `functions/api/[[path]].js` | API đăng nhập, dữ liệu, phân quyền, ảnh và duyệt thay đổi |
| `functions/uploads/[[path]].js` | Đường dẫn tương thích cho việc truy cập ảnh |
| `cloudflare-schema.sql` | Cấu trúc các bảng D1 trống |
| `tests/` | Kiểm thử học vị, xưng hô và phân quyền |
| `export_static.py` | Chuẩn bị thư mục giao diện trước khi triển khai |
| `wrangler.toml.example` | Cấu hình Cloudflare mẫu, không chứa định danh hệ thống thật |
| `wrangler.toml` | Bản cấu hình riêng trên máy quản trị; đã bị Git bỏ qua |
| `HO-SO-BAN-GIAO-MAU.md` | Mẫu lập hồ sơ bàn giao kín cho người tiếp quản |

## Dữ liệu trong D1

| Bảng | Nội dung |
|---|---|
| `family_data` | Dữ liệu gia phả chính dưới dạng JSON |
| `users` | Tài khoản, vai trò, danh tính và mật khẩu đã băm |
| `photos` | Ảnh đã tải lên |
| `app_settings` | Thiết lập hệ thống và danh tính Admin gốc |
| `family_change_requests` | Yêu cầu sửa đang chờ, đã duyệt hoặc bị từ chối |

Không chỉnh trực tiếp dữ liệu sản xuất bằng tay nếu chưa có bản sao lưu.

## Phân quyền

- **Người xem (`viewer`):** đăng nhập và xem gia phả.
- **Thành viên (`member`):** gửi đề nghị sửa bản thân, vợ/chồng và nhánh con cháu của mình.
- **Trưởng họ (`clan_head`):** chỉnh sửa trực tiếp toàn bộ gia phả nhưng không quản lý tài khoản.
- **Admin (`admin`):** quản lý tài khoản, chỉnh dữ liệu và duyệt yêu cầu.
- **Admin gốc:** quyền cao nhất, không thể bị tài khoản khác xóa hoặc hạ quyền.

Khi tạo tài khoản thành viên hoặc trưởng họ, phải gắn đúng danh tính trong gia phả.

## Dựng lại hệ thống trên Cloudflare

### 1. Chuẩn bị

Cần có Node.js phiên bản đang được hỗ trợ, Git, tài khoản GitHub và tài khoản Cloudflare.

```powershell
git clone <DIA_CHI_KHO_MA_NGUON>
cd <THU_MUC_DU_AN>
npm install
npx wrangler login
Copy-Item wrangler.toml.example wrangler.toml
```

Các giá trị trong dấu `<...>` là chỗ cần thay bằng dữ liệu của người tiếp quản, không phải thông tin thật của hệ thống hiện tại.

### 2. Tạo D1 mới

```powershell
npx wrangler d1 create <TEN_CO_SO_DU_LIEU_MOI>
```

Cloudflare trả về một Database ID. Mở bản `wrangler.toml` vừa sao chép, điền tên Pages project, tên D1 và Database ID. Tệp này chỉ nằm trên máy quản trị và không được Git theo dõi.

Tạo bảng trống:

```powershell
npx wrangler d1 execute <TEN_CO_SO_DU_LIEU_MOI> --remote --file cloudflare-schema.sql
```

### 3. Tạo Pages project

```powershell
npx wrangler pages project create <TEN_DU_AN_PAGES> --production-branch main
```

Trong Cloudflare Dashboard, mở **Pages project → Settings → Variables and Secrets** và tạo ba secret:

- `FAMILY_ADMIN_USER`: tên đăng nhập Admin gốc.
- `FAMILY_ADMIN_PASSWORD`: mật khẩu mạnh và riêng biệt.
- `AUTH_SECRET`: chuỗi ngẫu nhiên dài dùng để ký phiên đăng nhập.

Không ghi giá trị của ba secret này vào GitHub, README, ảnh chụp màn hình hoặc tin nhắn.

### 4. Triển khai

```powershell
python export_static.py
npx wrangler pages deploy deploy-public --project-name <TEN_DU_AN_PAGES>
```

Sau khi triển khai, mở `/admin`, đăng nhập Admin gốc và bắt đầu nhập dữ liệu.

## Chạy kiểm thử trước khi cập nhật

```powershell
npm test
```

Các kiểm thử phải chạy thành công trước khi triển khai. Sau đó kiểm tra thêm:

1. Trang xem yêu cầu đăng nhập.
2. Trang Admin yêu cầu đúng quyền.
3. Tìm kiếm tên hoạt động trên máy tính và điện thoại.
4. Thành viên không sửa được người ngoài nhánh.
5. Phần mộ chỉ hiện khi có ngày mất.
6. Ảnh mở được và không làm tràn giao diện.

## Sao lưu định kỳ

Mã nguồn trên GitHub không phải bản sao dữ liệu. Cần sao lưu D1 riêng:

```powershell
npx wrangler d1 export <TEN_CO_SO_DU_LIEU> --remote --output <TEN_FILE_SAO_LUU>.sql
```

Tệp SQL có thể chứa dữ liệu cá nhân, tài khoản và ảnh. Phải:

- mã hóa tệp trước khi lưu;
- giữ ít nhất hai bản ở hai nơi khác nhau;
- không commit lên GitHub;
- không gửi qua nhóm chat công khai;
- kiểm tra khả năng khôi phục ít nhất mỗi năm một lần.

Nên sao lưu sau mỗi đợt nhập dữ liệu lớn và trước mỗi lần nâng cấp hệ thống.

## Khôi phục khi website bị mất

1. Lấy mã nguồn từ GitHub.
2. Tạo Pages project và D1 mới.
3. Chạy `cloudflare-schema.sql` nếu bản sao không chứa cấu trúc bảng.
4. Nhập bản sao D1 đã giải mã.
5. Thiết lập lại ba secret bảo mật.
6. Cập nhật liên kết D1 trong `wrangler.toml` trên máy quản trị.
7. Triển khai lại và kiểm tra đăng nhập, ảnh, quan hệ, tìm kiếm, phân quyền.

Không khôi phục đè lên dữ liệu đang hoạt động nếu chưa tạo bản sao hiện tại.

## Bàn giao cho thế hệ sau

README này chỉ chứa hướng dẫn kỹ thuật. Thông tin vận hành thật phải được ghi trong một **hồ sơ bàn giao riêng**, được mã hóa hoặc cất bản giấy kín, gồm:

- người sở hữu tài khoản GitHub;
- người sở hữu tài khoản Cloudflare;
- tên project Pages và D1 đang dùng;
- nơi cất bản sao lưu gần nhất;
- cách lấy quyền truy cập email khôi phục;
- ngày thay mật khẩu/secret gần nhất;
- danh sách người có quyền Admin và trưởng họ.

Dùng [HO-SO-BAN-GIAO-MAU.md](HO-SO-BAN-GIAO-MAU.md) làm danh sách kiểm tra. Hãy sao chép nó thành `HO-SO-BAN-GIAO-RIENG.md`, điền thông tin thật rồi cất ở nơi an toàn. Tên tệp riêng này đã được `.gitignore` chặn để tránh đưa nhầm lên GitHub.

Không ghi mật khẩu hoặc API Token trực tiếp trong hồ sơ nếu hồ sơ không được mã hóa. Cách tốt nhất là dùng trình quản lý mật khẩu có chức năng người thừa kế hoặc khôi phục khẩn cấp.

Mỗi năm nên có ít nhất hai người tin cậy biết quy trình khôi phục, nhưng mỗi người chỉ được cấp đúng quyền cần thiết.

## Mở rộng dữ liệu thành viên

Khi thêm một trường mới, ví dụ nhóm máu hoặc thông tin quân ngũ, cần cập nhật đồng bộ:

1. Giá trị mặc định trong `emptyPerson` ở `public/app.js`.
2. Hàm chuẩn hóa người trong `functions/api/[[path]].js`.
3. Biểu mẫu Admin.
4. Trang xem chi tiết.
5. Danh sách trường mà thành viên được đề nghị sửa.
6. Bản xem trước khi Admin duyệt.
7. Tìm kiếm hoặc xuất Excel nếu trường đó cần tra cứu.
8. Kiểm thử hồi quy.

Không chỉ thêm giao diện mà bỏ quên API, vì dữ liệu có thể bị mất sau lần lưu kế tiếp.

## Nâng cấp hệ thống

Quy trình an toàn:

1. Sao lưu D1.
2. Tạo nhánh Git riêng cho bản nâng cấp.
3. Cập nhật thư viện từng nhóm nhỏ.
4. Chạy `npm test` và kiểm tra giao diện điện thoại/máy tính.
5. Triển khai bản thử trước.
6. Chỉ đưa lên production sau khi dữ liệu và ảnh được xác nhận nguyên vẹn.
7. Ghi rõ thay đổi trong commit Git.

Không nâng cấp trực tiếp trên production khi chưa có phương án quay lại phiên bản trước.

## Thay đổi giao diện hoặc tên dòng họ

- Tên dòng họ nằm trong dữ liệu `familyName` và có thể đặt bằng file JSON nhập từ Admin.
- Ảnh nền nằm trong `public/images/`.
- Màu sắc, kích thước và giao diện điện thoại nằm trong `public/styles.css`.
- Nội dung hướng dẫn đăng nhập và các câu chữ đặc thù nằm trong `public/app.js`.

Trước khi dùng mã nguồn cho một dòng họ khác, phải thay toàn bộ tên người liên hệ, địa danh, tên dòng họ và tạo D1/Pages project riêng.

## Kiểm tra bảo mật trước khi đẩy Git

Trước mỗi lần `git push`, kiểm tra không có:

- mật khẩu hoặc secret;
- API Token;
- file `.env`;
- file sao lưu `.sql`;
- dữ liệu gia phả thật;
- ảnh cá nhân;
- log chứa thông tin đăng nhập;
- `wrangler.toml` đã điền thông tin vận hành nếu repository được chia sẻ công khai.

Nếu một secret từng xuất hiện trong Git hoặc tin nhắn, phải thu hồi và tạo secret mới. Xóa dòng đó khỏi commit mới là chưa đủ vì lịch sử Git vẫn có thể lưu bản cũ.

## Nguyên tắc duy trì lâu dài

- GitHub giữ mã nguồn; D1 giữ dữ liệu; bản sao mã hóa giữ khả năng khôi phục.
- Không phụ thuộc vào duy nhất một người quản trị.
- Không dùng chung tài khoản Admin gốc trong sinh hoạt hằng ngày.
- Cấp quyền theo nhu cầu và thu hồi quyền khi không còn sử dụng.
- Ghi chép mỗi thay đổi quan trọng bằng commit rõ nghĩa.
- Luôn thử khôi phục, không chỉ tạo bản sao rồi để đó.
