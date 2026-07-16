# Blockbench MCP Bridge 0.3

MCP server cục bộ cho phép AI điều khiển Blockbench bằng các thao tác có cấu trúc, không chạy JavaScript tùy ý. Server dùng MCP `stdio`; plugin Blockbench kết nối đến server bằng WebSocket chỉ trên loopback.

## Tính năng

- Tạo project Blockbench mới hoặc thêm chi tiết vào project đang mở.
- Sinh pet chibi chất lượng cao từ brief ngắn: fox/wolf/cat/rabbit, bảng màu, phụ kiện, scale và bộ animation.
- Dựng group/bone phân cấp và cube với tọa độ, pivot, rotation, inflate chính xác.
- Box UV hoặc UV riêng cho sáu mặt; gán texture theo tên.
- Tạo texture pixel từ màu nền và các vùng màu, hoặc dùng PNG/base64/đường dẫn cục bộ.
- Tạo animation rotation, position và scale theo keyframe.
- Advanced animation: Molang, pre/post data points, bezier handles và timeline markers để đồng bộ skill.
- Rig preset chuyên nghiệp cho weapon, ModelEngine pet, quadruped pet và humanoid golem.
- Locator/socket cho VFX, projectile, tay, miệng, đầu kiếm và điểm va chạm.
- Display transforms cho item Minecraft ở tay, GUI, ground, head và item frame.
- Texture emissive/additive và vertical animation strip với frame metadata.
- Đặt camera, chụp viewport để AI tự kiểm tra model.
- Chụp turntable tự động ở bốn góc hero/front/side/back.
- Quality report chấm cấu trúc silhouette, độ phân lớp khuôn mặt, đối xứng, rig và animation; luôn yêu cầu kiểm tra ảnh trước khi hoàn tất.
- Audit model, mở project tham khảo, đọc cấu trúc, lưu `.bbmodel` và export theo format hiện tại.

## Cài đặt

Yêu cầu Node.js 20 trở lên và Blockbench 5.0 trở lên.

```powershell
cd C:\Users\user\Documents\pack
npm.cmd install
npm.cmd run build
```

Trong Blockbench:

1. Mở **File > Plugins**.
2. Chọn **Load Plugin from File**.
3. Chọn `C:\Users\user\Documents\pack\blockbench-plugin\blockbench_mcp_bridge.js`.
4. Plugin tự kết nối đến `ws://127.0.0.1:32145` khi MCP server đang chạy.

Đăng ký MCP server trong MCP client bằng cấu hình tương đương file [`mcp-config.example.json`](./mcp-config.example.json). Sau khi client khởi động server, vào **Tools > Connect Blockbench MCP** nếu plugin chưa tự kết nối.

Mặc định bridge dùng `127.0.0.1:32145` và token `blockbench-mcp-local`, khớp với file cấu hình mẫu. Có thể đổi bằng **Tools > Configure Blockbench MCP**. WebSocket chỉ chấp nhận kết nối nội bộ; không đặt host thành `0.0.0.0`.

## MCP tools

- `blockbench_status`: kiểm tra bridge và project hiện tại.
- `blockbench_list_capabilities`: liệt kê format và codec hiện có.
- `blockbench_open_project`: mở `.bbmodel` không nén từ đường dẫn cục bộ.
- `blockbench_create_rig`: tạo rig weapon/pet/quadruped/golem chuẩn hóa.
- `blockbench_create_pet`: dựng pet chibi hoàn chỉnh từ art-direction cấp cao, gồm 40+ cube có tên, 20 bone, texture, socket và animation.
- `blockbench_apply_model`: áp dụng toàn bộ model specification.
- `blockbench_patch_model`: sửa cube/bone hoặc xóa cube theo tên/UUID sau khi xem turntable, có Undo nguyên tử.
- `blockbench_add_animation`: thêm animation nâng cao vào project hiện tại.
- `blockbench_get_project`: đọc bone, cube, texture, animation và giới hạn model.
- `blockbench_audit_model`: kiểm tra geometry, UV, texture, rig, loop và display transforms.
- `blockbench_set_camera`: đặt camera cho bước kiểm tra hình ảnh.
- `blockbench_capture_preview`: chụp viewport trả về cho AI.
- `blockbench_capture_turntable`: tự căn camera và chụp bốn góc để phát hiện khối rời, silhouette gãy hoặc tỷ lệ xấu.
- `blockbench_quality_report`: chấm chất lượng cấu trúc theo profile pet/weapon/golem; đây không thay thế kiểm tra ảnh.
- `blockbench_save_project`: lưu file `.bbmodel` trên Blockbench Desktop.
- `blockbench_export_model`: export bằng codec của format hiện tại.

Quy trình pet nên dùng: `status` → `create_pet` → `capture_turntable` → `quality_report` → sửa theo ảnh → chụp lại → `audit_model` → `save_project`. Với vũ khí/golem: `create_rig` → `apply_model` rồi dùng cùng vòng kiểm tra.

Ví dụ pet cáo:

```json
{
  "name": "Mochi Fox Pro",
  "species": "fox",
  "accessory": "bow",
  "scale": 0.9,
  "animation_set": "full",
  "colors": {
    "primary": "#EF7835",
    "secondary": "#FFF1D6",
    "accent": "#FF8FA8"
  }
}
```

## Model specification

File [`examples/fire_sword.json`](./examples/fire_sword.json) là ví dụ đầy đủ về vũ khí có bone, texture pixel và animation. Các tham chiếu nên dùng `group.id` ổn định thay vì chỉ dùng tên.

Kết quả nghiên cứu ba pack weapon/pet/golem nằm trong [`research/PACK_FINDINGS.md`](./research/PACK_FINDINGS.md). Tài sản mua không được đưa vào repository.

`mode: "replace"` tạo một tab project mới nên không đóng hoặc ghi đè tab cũ. `mode: "append"` thêm nội dung vào project hiện tại và có Undo.

Các giới hạn an toàn:

- `cube.from` phải nhỏ hơn `cube.to` trên cả ba trục.
- Parent, texture và animation bone phải tồn tại.
- Pixel patch không được vượt khỏi kích thước texture.
- Texture pixel patch chỉ áp dụng cho texture được tạo mới; với ảnh có sẵn, gửi PNG/base64 hoàn chỉnh.
- Plugin không cung cấp lệnh thực thi mã tùy ý.

## Phát triển và kiểm thử

```powershell
npm.cmd run check
npm.cmd test
node --check blockbench-plugin\blockbench_mcp_bridge.js
```

Tài liệu tham khảo: [Blockbench Plugin Guide](https://www.blockbench.net/wiki/docs/plugin/), [Blockbench API Reference](https://web.blockbench.net/docs/), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
