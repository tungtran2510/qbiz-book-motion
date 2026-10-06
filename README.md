# Qbiz Book Motion 📖✨

> **3D Flipbook Motion & Cinematic Video Mockup Generator**
> Tự động biến tài liệu PDF hoặc hình ảnh thành sách 3D sống động, uốn cong lật trang mượt mà như thực tế và xuất video MP4 1080p có âm thanh lật sách đồng bộ ngay trên trình duyệt (100% Client-Side).

<p align="center">
  <img src="logo.png" alt="Qbiz Book Motion Logo" width="160">
</p>

---

## ✨ Điểm Nổi Bật (Key Features)

1. **Uốn cong vật lý chân thực (Developable Surface Physics):**
   - Lưới 48 cột x 12 hàng bảo toàn chiều dài cung giấy (*inextensible developable surface*).
   - Tự nhiên hóa với góc nhấc trước (*corner peel*), uốn chéo góc (*torsional twist*) và độ võng tự nhiên (*resting curvature*).
   - Loại bỏ hoàn toàn hiện tượng nhấp nháy, giật hình, đâm xuyên lớp (*Z-clipping free*).

2. **Kịch bản chuyển động 10 giây điện ảnh (10s Motion Recipe):**
   - **0.0s – 0.8s:** Bìa sách tĩnh đóng gọn trên mặt bàn Studio.
   - **0.8s – 2.2s:** Mở bìa trước nhẹ nhàng với độ cong tự nhiên, hé lộ Trang 1 & Trang 2.
   - **2.2s – 4.2s:** Dừng đọc Spread 1 ổn định.
   - **4.2s – 5.6s:** Lật tờ ruột động với gia tốc `smootherstep`, hé lộ Trang 3 & Trang 4.
   - **5.6s – 8.4s:** Dừng đọc Spread 2 với độ cong trang thả lỏng mềm mại.
   - **8.4s – 9.8s:** Gập sách đóng bìa lại mượt mà.
   - **9.8s – 10.0s:** Sách đóng hoàn thiện.

3. **Âm thanh lật sách đồng bộ (Synchronized Page Flip Audio):**
   - Âm thanh mở bìa sách (`sound_book_open.wav`).
   - Âm thanh lật trang giấy xào xạc (`sound_page_flip.wav`).
   - Âm thanh gập đóng sách trầm ấm (`sound_book_close.wav`).
   - Tự động ghép vào luồng AAC trong video xuất ra.

4. **Xuất video MP4 1080p cực nhanh (WebCodecs + MP4-Muxer):**
   - Render 300 frames chuẩn 30 FPS, độ phân giải Full HD 1920x1080.
   - Mã hóa H.264 + AAC Stereo trực tiếp bằng phần cứng GPU trong trình duyệt, không cần gửi file lên server.

5. **Đa dạng tỷ lệ khung hình & Camera:**
   - Hỗ trợ các tỷ lệ: 16:9 (Ngang), 9:16 (Dọc TikTok/Reels/Shorts), 1:1 (Vuông), 4:3.
   - Góc nhìn camera: Top View (Từ trên xuống), Product 45°, Reader View.

---

## 🚀 Khởi chạy cục bộ (Local Development)

Yêu cầu: Bất kỳ static HTTP server nào (Python, Node.js http-server, live-server,...).

```bash
# Sử dụng Python có sẵn:
python -m http.server 4179

# Truy cập trình duyệt:
http://localhost:4179
```

---

## ☁️ Triển khai Vercel (Deployment)

Dự án được tối ưu tĩnh 100%, không phụ thuộc backend:

```bash
vercel --prod
```

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

- **Three.js**: Dựng môi trường 3D, chiếu sáng Studio, đổ bóng soft shadow, quản lý mesh uốn cong.
- **PDF.js**: Trích xuất và rasterize các trang PDF thành kết cấu ảnh có độ sắc nét cao.
- **WebCodecs & MP4-Muxer**: Xuất video MP4 chuẩn Full HD 1080p với luồng âm thanh đa kênh.
- **HTML5 Web Audio API**: Tổng hợp và đồng bộ âm thanh chuyển động.

---

© 2026 Qbiz Book Motion. All rights reserved.
