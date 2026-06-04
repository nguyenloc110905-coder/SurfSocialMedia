const fs = require('fs');
const path = require('path');

const themeInit = `%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'primaryTextColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'mainBkg': '#ffffff', 'edgeLabelBackground': '#ffffff'}}}%%`;

const diagrams = {
  ADCreatePost: `
flowchart TD
    Start([Bắt đầu]) --> OpenModal[Người dùng mở form Đăng bài]
    OpenModal --> InputData[Nhập nội dung/đính kèm ảnh/video]
    InputData --> Submit[Nhấn nút Đăng bài]
    Submit --> Validate{Kiểm tra tính hợp lệ?}
    Validate -- Không hợp lệ --> ShowError[Hiển thị thông báo lỗi]
    ShowError --> InputData
    Validate -- Hợp lệ --> UploadMedia[Upload Media lên Storage]
    UploadMedia --> SaveDB[Lưu bài viết vào Firestore]
    SaveDB --> SyncTimeline[Cập nhật vào bảng tin Feed]
    SyncTimeline --> Success[Hiển thị thông báo thành công]
    Success --> End([Kết thúc])
  `,
  ADViewFeed: `
flowchart TD
    Start([Bắt đầu]) --> OpenFeed[Truy cập trang Bảng tin]
    OpenFeed --> CallAPI[Gửi yêu cầu lấy bài viết trang 1]
    CallAPI --> ReturnData[Server trả về danh sách bài viết]
    ReturnData --> RenderFeed[Hiển thị bài viết lên màn hình]
    RenderFeed --> Scroll{Người dùng cuộn xuống đáy?}
    Scroll -- Chưa tới đáy --> RenderFeed
    Scroll -- Tới đáy màn hình --> HasMore{Còn bài viết không?}
    HasMore -- Còn --> CallAPINext[Gửi yêu cầu lấy trang tiếp theo]
    CallAPINext --> ReturnData
    HasMore -- Hết --> ShowEnd[Hiển thị trạng thái đã xem hết]
    ShowEnd --> End([Kết thúc])
  `,
  ADInteractPost: `
flowchart TD
    Start([Bắt đầu]) --> ViewPost[Xem một bài viết cụ thể]
    ViewPost --> Action{Loại tương tác?}
    Action -- Thả tim --> CheckLike{Đã like chưa?}
    CheckLike -- Chưa --> AddLike[Tăng số lượt Like và lưu DB]
    CheckLike -- Rồi --> RemoveLike[Giảm số lượt Like và lưu DB]
    AddLike --> CreateNotif[Gửi thông báo cho chủ bài viết]
    RemoveLike --> UpdateUI
    CreateNotif --> UpdateUI[Cập nhật UI tương tác]
    Action -- Bình luận --> InputComment[Nhập nội dung bình luận]
    InputComment --> SaveComment[Lưu bình luận vào DB]
    SaveComment --> CreateNotif2[Gửi thông báo cho chủ bài viết]
    CreateNotif2 --> UpdateUI
    UpdateUI --> End([Kết thúc])
  `,
  ADViewShortVideo: `
flowchart TD
    Start([Bắt đầu]) --> OpenShorts[Mở trang Surf Clips]
    OpenShorts --> LoadInitial[Tải danh sách Video đầu tiên]
    LoadInitial --> AutoPlay[Tự động phát Video đầu tiên]
    AutoPlay --> Action{Hành động của người dùng?}
    Action -- Vuốt lên/xuống --> ChangeVideo[Chuyển sang Video tiếp theo/trước đó]
    ChangeVideo --> AutoPlayNext[Tự động phát Video mới]
    AutoPlayNext --> CheckCache{Gần hết danh sách?}
    CheckCache -- Đúng --> FetchMore[Tải thêm Video nền]
    FetchMore --> AutoPlay
    CheckCache -- Sai --> AutoPlay
    Action -- Nhấn nút Pause/Play --> TogglePlay[Dừng/Phát tiếp video]
    TogglePlay --> Action
    Action -- Rời khỏi trang --> StopVideo[Dừng phát Video]
    StopVideo --> End([Kết thúc])
  `
};

const outputDir = path.join(__dirname, 'Reports', 'Diagram');

async function generateAll() {
  for (const [name, mmd] of Object.entries(diagrams)) {
    console.log("Generating " + name + " (Black & White)...");
    try {
      const fullMmd = themeInit + "\n" + mmd.trim();
      const response = await fetch("https://kroki.io/mermaid/png?bg=ffffff", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: fullMmd
      });
      if (!response.ok) {
        throw new Error("Failed to generate " + name + ": " + response.statusText);
      }
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(path.join(outputDir, name + ".png"), Buffer.from(buffer));
      console.log("Saved " + name + ".png");
    } catch (err) {
      console.error("Error with " + name + ":", err.message);
    }
  }
}

generateAll();
