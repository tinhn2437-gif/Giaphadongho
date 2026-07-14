# Hồ sơ bàn giao hệ thống gia phả

> Đây là mẫu trống. Không điền thông tin thật trực tiếp vào tệp đang được Git theo dõi.

## Cách sử dụng an toàn

1. Sao chép tệp này thành `HO-SO-BAN-GIAO-RIENG.md`.
2. Điền thông tin vận hành vào bản riêng.
3. Mã hóa bản riêng hoặc in ra và cất kín.
4. Không gửi mật khẩu, API Token hoặc bản sao dữ liệu qua nhóm chat.
5. Cập nhật hồ sơ sau mỗi lần đổi người quản trị hoặc đổi tài khoản dịch vụ.

`HO-SO-BAN-GIAO-RIENG.md` đã được `.gitignore` chặn để không bị đẩy lên GitHub.

## 1. Người chịu trách nhiệm

| Nội dung | Thông tin cần ghi trong bản riêng |
|---|---|
| Người quản trị chính | Họ tên và cách liên hệ |
| Người dự phòng thứ nhất | Họ tên và cách liên hệ |
| Người dự phòng thứ hai | Họ tên và cách liên hệ |
| Ngày bàn giao gần nhất | Ngày, tháng, năm |

Ít nhất hai người tin cậy nên biết nơi cất hồ sơ và bản sao lưu.

## 2. Quyền sở hữu dịch vụ

| Dịch vụ | Thông tin cần ghi trong bản riêng |
|---|---|
| GitHub | Chủ tài khoản, repository, email khôi phục |
| Cloudflare | Chủ tài khoản, email khôi phục, Pages project |
| Cloudflare D1 | Tên cơ sở dữ liệu và vị trí cấu hình |
| Tên miền riêng, nếu có | Nhà đăng ký, ngày hết hạn, người thanh toán |

Không ghi mật khẩu trực tiếp nếu hồ sơ chưa được mã hóa. Nên lưu mật khẩu trong trình quản lý mật khẩu có chức năng truy cập khẩn cấp hoặc người thừa kế.

## 3. Thông tin khôi phục

| Nội dung | Thông tin cần ghi trong bản riêng |
|---|---|
| Nơi cất bản sao D1 mới nhất | Ổ lưu trữ hoặc kho mã hóa |
| Ngày tạo bản sao gần nhất | Ngày, tháng, năm |
| Nơi cất mã khôi phục 2FA | Vị trí kín, tách khỏi mật khẩu |
| Người có quyền giải mã bản sao | Họ tên |
| Lần thử khôi phục gần nhất | Ngày và kết quả |

Giữ tối thiểu hai bản sao mã hóa tại hai nơi khác nhau. Không dùng GitHub làm nơi lưu bản sao dữ liệu gia phả.

## 4. Tài khoản quản trị website

Chỉ ghi:

- ai đang giữ vai trò Admin gốc;
- ai là Admin phụ hoặc trưởng họ;
- ngày rà soát quyền gần nhất;
- quy trình thu hồi quyền khi người quản trị thay đổi.

Không ghi mật khẩu thô trong tệp nếu không có mã hóa.

## 5. Quy trình tiếp quản nhanh

1. Xác nhận quyền truy cập GitHub và Cloudflare.
2. Đọc `README.md` từ đầu đến cuối.
3. Tải bản sao D1 mới nhất và kiểm tra khả năng giải mã.
4. Chạy `npm install` và `npm test` trên một máy mới.
5. Tạo bản triển khai thử, không ghi đè production.
6. Kiểm tra đăng nhập, ảnh, quan hệ, phân quyền và giao diện điện thoại.
7. Chỉ nhận quyền quản trị production sau khi hoàn tất các bước trên.

## 6. Lịch bảo trì tối thiểu

| Chu kỳ | Việc cần làm |
|---|---|
| Sau đợt nhập dữ liệu lớn | Sao lưu D1 và kiểm tra tệp sao lưu |
| Hằng quý | Rà soát tài khoản Admin và người đã nghỉ quản trị |
| Hằng năm | Thử khôi phục sang môi trường thử nghiệm |
| Trước mỗi nâng cấp | Sao lưu, chạy kiểm thử và chuẩn bị phương án quay lại |
| Khi lộ secret hoặc token | Thu hồi ngay và tạo giá trị mới |

## 7. Nhật ký bàn giao

| Ngày | Người bàn giao | Người tiếp nhận | Nội dung thay đổi | Đã thử khôi phục |
|---|---|---|---|---|
|  |  |  |  |  |
