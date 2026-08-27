-- Chạy một lần nếu database đã được tạo trước khi có đăng nhập bằng mật khẩu.
-- Tài khoản cũ sẽ đặt mật khẩu ở lần đăng nhập đầu tiên.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

