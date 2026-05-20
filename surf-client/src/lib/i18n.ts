import type { Lang } from '@/stores/langStore';
import { useLangStore } from '@/stores/langStore';

const dict = {
  vi: {
    // --- Navigation ---
    nav_feed: 'Feed',
    nav_surf_clips: 'Surf Clips',
    nav_friends: 'Bạn bè',
    nav_groups: 'Nhóm',
    nav_market: 'Surf Market',
    nav_saved: 'Đã lưu',
    nav_events: 'Sự kiện',
    nav_pages: 'Trang',
    nav_waves: 'Waves',
    nav_explore: 'Khám phá',
    nav_moments: 'Moments',
    nav_live: 'Surf Live',

    // --- Sidebar ---
    sidebar_menu: 'Menu',
    sidebar_navigation: 'Điều hướng',
    sidebar_expand: 'Mở rộng sidebar',
    sidebar_collapse: 'Thu gọn sidebar',
    sidebar_shortcuts: 'Lối tắt của bạn',
    sidebar_no_shortcuts:
      'Chưa có lối tắt. Truy cập Nhóm hoặc Trang để thấy lối tắt xuất hiện ở đây.',

    // --- Header ---
    header_search_placeholder: 'Tìm kiếm...',
    header_profile: 'Trang cá nhân',
    header_settings: 'Cài đặt',
    header_logout: 'Đăng xuất',
    header_theme_light: 'Chế độ sáng',
    header_theme_dark: 'Chế độ tối',
    header_theme_system: 'Theo hệ thống',

    // --- Settings ---
    settings_title: 'Cài đặt',
    settings_subtitle: 'Quản lý tài khoản và quyền riêng tư',
    settings_back: 'Quay lại',

    // --- Language panel ---
    lang_panel_title: 'Ngôn ngữ & Múi giờ',
    lang_panel_desc: 'Chọn ngôn ngữ hiển thị của ứng dụng.',
    lang_vi: 'Tiếng Việt',
    lang_en: 'English (Tiếng Anh)',
    lang_saved_toast: 'Đã lưu ngôn ngữ',

    // --- Common actions ---
    save: 'Lưu',
    cancel: 'Hủy',
    back: 'Quay lại',
    done: 'Xong',
    loading: 'Đang tải...',
    confirm: 'Xác nhận',
    delete: 'Xóa',
    edit: 'Chỉnh sửa',
    close: 'Đóng',
    search: 'Tìm kiếm',
    send: 'Gửi',
    share: 'Chia sẻ',
    like: 'Thích',
    comment: 'Bình luận',
    follow: 'Theo dõi',
    unfollow: 'Bỏ theo dõi',
    add_friend: 'Thêm bạn',
    unfriend: 'Hủy kết bạn',
    block: 'Chặn',
    report: 'Báo cáo',
    post: 'Đăng',

    // --- Feed ---
    feed_empty: 'Chưa có bài đăng nào.',
    feed_load_more: 'Tải thêm',
    feed_whats_on_mind: 'Bạn đang nghĩ gì?',
    feed_photo_video: 'Ảnh/Video',
    feed_feeling: 'Cảm xúc',
    feed_location: 'Vị trí',

    // --- Friends ---
    friends_requests: 'Lời mời kết bạn',
    friends_suggestions: 'Gợi ý kết bạn',
    friends_all: 'Tất cả bạn bè',
    friends_online: 'Đang hoạt động',

    // --- Groups ---
    groups_your_groups: 'Nhóm của bạn',
    groups_discover: 'Khám phá nhóm',
    groups_create: 'Tạo nhóm',

    // --- Notifications ---
    notif_title: 'Thông báo',
    notif_empty: 'Chưa có thông báo.',
    notif_mark_all_read: 'Đánh dấu đã đọc',

    // --- Header dropdown ---
    header_view_all_profiles: 'Xem tất cả trang cá nhân',
    header_settings_privacy: 'Cài đặt và quyền riêng tư',
    header_help_support: 'Trợ giúp và hỗ trợ',
    header_display_accessibility: 'Màn hình và trợ năng',
    header_give_feedback: 'Đóng góp ý kiến',
    header_privacy: 'Quyền riêng tư',
    header_terms: 'Điều khoản',

    // --- Display panel ---
    display_dark_mode: 'Chế độ tối',
    display_dark_mode_desc: 'Điều chỉnh giao diện để giảm độ chói và cho đôi mắt được nghỉ ngơi.',
    display_compact_mode: 'Chế độ Thu gọn',
    display_compact_desc: 'Thu gọn menu để có thêm không gian.',
    display_keyboard: 'Bàn phím',
    display_accessibility_settings: 'Cài đặt trợ năng',
    display_auto_desc: 'Tự động điều chỉnh theo cài đặt hệ thống trên thiết bị của bạn.',
    theme_off: 'Tắt',
    theme_on: 'Bật',
    theme_auto: 'Tự động',

    // --- Settings sidebar sections ---
    section_account: 'Tài khoản',
    section_account_sub: 'Quản lý cài đặt tài khoản và bảo mật.',
    section_privacy: 'Quyền riêng tư',
    section_privacy_sub: 'Kiểm soát ai có thể xem nội dung và hoạt động của bạn.',
    section_personalization: 'Cá nhân hóa',
    section_personalization_sub: 'Làm Surf hoạt động đúng cách bạn muốn.',
    section_content_visibility: 'Ai thấy nội dung của bạn',
    section_content_visibility_sub: 'Chọn ai có thể xem từng loại nội dung.',
    section_notifications: 'Thông báo',
    section_notifications_sub: 'Quản lý tùy chọn thông báo của bạn.',
    section_appearance: 'Giao diện',
    section_appearance_sub: 'Tùy chỉnh giao diện và cảm nhận của ứng dụng.',
    section_support: 'Hỗ trợ & Chính sách',
    section_support_sub: 'Tiêu chuẩn cộng đồng, điều khoản và quyền lợi của bạn.',

    // --- Settings items ---
    item_account_security: 'Bảo mật tài khoản',
    item_delete_account: 'Xóa tài khoản',
    item_language_timezone: 'Ngôn ngữ & Múi giờ',
    item_privacy_checkup: 'Kiểm tra quyền riêng tư',
    item_default_audience: 'Đối tượng xem mặc định',
    item_friend_request_privacy: 'Ai có thể gửi lời mời kết bạn',
    item_emotions_feedback: 'Cảm xúc & phản hồi',
    item_notifications: 'Thông báo & nhắc',
    item_accessibility_display: 'Trợ năng & hiển thị',
    item_media_files: 'Ảnh, video & file',
    item_privacy_settings: 'Cài đặt quyền riêng tư nội dung',
    item_profile_protection: 'Bảo vệ trang cá nhân',
    item_public_info: 'Thông tin công khai',
    item_search_connect: 'Tìm kiếm & Kết nối',
    item_posts_visibility: 'Hiển thị bài đăng',
    item_stories_visibility: 'Hiển thị tin 24h',
    item_clips_visibility: 'Hiển thị Surf Clips',
    item_followers_public: 'Người theo dõi & Nội dung công khai',
    item_tagging_visibility: 'Gắn thẻ & Gợi ý',
    item_block_list: 'Danh sách chặn',
    item_notifications_reminders: 'Thông báo & Nhắc nhở',
    item_media_files2: 'Tệp phương tiện',
    item_policy: 'Chính sách cộng đồng & Điều khoản',
    item_reports: 'Báo cáo vi phạm',

    // --- Settings privacy panel items ---
    sp_settings: 'Cài đặt',
    sp_language: 'Ngôn ngữ & khu vực',
    sp_privacy_review: 'Rà soát quyền riêng tư',
    sp_security: 'Trung tâm bảo mật',
    sp_activity: 'Lịch sử hoạt động',
    sp_content_filter: 'Lọc nội dung',
    sp_panel_title: 'Cài đặt và quyền riêng tư',

    // --- Settings page ---
    settings_no_change: 'Chưa có thay đổi nào',

    // --- FriendsLeftNav ---
    friends_nav_title: 'Bạn bè',
    friends_back_home: 'Quay lại trang chủ',

    // --- Friends page nav items ---
    fnav_home: 'Trang chủ',
    fnav_requests: 'Lời mời kết bạn',
    fnav_suggestions: 'Gợi ý',
    fnav_all: 'Tất cả bạn bè',
    fnav_birthdays: 'Sinh nhật',
    fnav_blocked: 'Danh sách chặn',
    fnav_history: 'Lịch sử tương tác',

    // --- Feed page ---
    feed_free: 'Miễn phí',
    feed_market_boost_desc: 'Mặt hàng đang được quảng bá trên Surf Market.',
    feed_market_explore: 'Khám phá mặt hàng này trên Surf Market.',
    feed_view_in_market: 'Xem trong Market',
    feed_no_posts: 'Chưa có bài viết nào',
    feed_be_first: 'Hãy là người đầu tiên chia sẻ điều gì đó!',
    feed_discover: 'Khám phá',
    feed_all_caught_up: 'Bạn đã xem hết bảng tin 🎉',
    feed_error_building: '⏳ Database đang chuẩn bị... Vui lòng đợi 1-2 phút và reload lại trang!',
    feed_error_load: 'Không thể tải bảng tin. Vui lòng thử lại!',

    // --- Notifications (extended) ---
    notif_tagged: 'đã gắn thẻ bạn trong một bài viết',
    notif_friend_request: 'đã gửi lời mời kết bạn với bạn',
    notif_reaction: 'đã bày tỏ cảm xúc',
    notif_reaction_post: 'với bài viết của bạn',
    notif_comment: 'đã bình luận về bài viết của bạn',
    notif_reply: 'đã trả lời bình luận của bạn',
    notif_comment_reaction: 'đã thả',
    notif_comment_reaction_on: 'vào bình luận của bạn',
    notif_mention: 'đã nhắc đến bạn trong một bình luận',
    notif_default: 'đã thông báo cho bạn',

    // --- Post card ---
    post_reaction_like: 'Thích',
    post_reaction_wave: 'Sóng',
    post_reaction_haha: 'Haha',
    post_reaction_wow: 'Wow',
    post_reaction_sad: 'Buồn',
    post_reaction_cool: 'Tuyệt',
    post_pinned: 'Bài viết đã ghim',
    post_share_title: 'Chia sẻ bài viết',
    post_copy_link: 'Sao chép liên kết',
    post_trash_title: 'Chuyển vào thùng rác?',
    post_trash_desc: 'Bài viết sẽ được chuyển vào thùng rác. Bạn có thể khôi phục trong vòng',
    post_trash_days: '36 ngày',
    post_trash_permanent: 'trước khi bị xóa vĩnh viễn.',
    post_trash_btn: 'Chuyển vào thùng rác',
    post_report_title: 'Báo cáo bài viết',
    post_report_desc: 'Hãy cho chúng tôi biết vấn đề với bài viết này.',
    post_report_placeholder: 'Chọn lý do...',
    post_report_spam: 'Spam',
    post_report_inappropriate: 'Nội dung không phù hợp',
    post_report_misinformation: 'Thông tin sai lệch',
    post_report_hate: 'Ngôn từ thù hận',
    post_report_harassment: 'Quấy rối / Bắt nạt',
    post_report_violence: 'Nội dung bạo lực',
    post_report_copyright: 'Vi phạm bản quyền',
    post_report_other: 'Khác',
    post_report_submit: 'Gửi báo cáo',
    post_report_toast_ok: '✅ Đã gửi báo cáo. Cảm ơn bạn!',
    post_report_toast_dup: '⚠️ Bạn đã báo cáo bài viết này rồi',
    post_report_toast_err: '❌ Không thể gửi báo cáo. Thử lại sau.',
    post_see_more: 'Xem thêm',
    post_see_less: 'Rút gọn',
    post_like_btn: 'Thích',
    post_comment_btn: 'Bình luận',
    post_share_btn: 'Chia sẻ',
    post_comment_policy: 'Bình luận của bạn vi phạm chính sách của chúng tôi.',
    post_share_error: 'Không thể chia sẻ bài viết. Vui lòng thử lại.',
    post_delete_error: 'Không thể xóa bài viết. Vui lòng thử lại.',
    post_editing: 'Đã chỉnh sửa',
    post_group_in: 'trong',
    post_anon: 'Ẩn danh',
    post_just_now: 'vừa xong',
    post_sharing: 'Đang chia sẻ...',
    post_share_now: 'Chia sẻ ngay',
    post_submitting: 'Đang gửi...',
    post_loading: 'Đang tải...',
    post_load_more_comments: 'Xem thêm bình luận',
    post_write_comment: 'Viết bình luận...',
    post_reply: 'Trả lời',
    post_cancel: 'Hủy',
    post_send: 'Gửi',
    post_edited_label: 'Đã chỉnh sửa',
    post_in_group: 'trong',
    post_you: 'Bạn',
    post_save: 'Lưu bài viết',
    post_unsave: 'Bỏ lưu',
    post_edit: 'Chỉnh sửa bài viết',
    post_pin: 'Ghim bài viết',
    post_unpin: 'Bỏ ghim',
    post_delete: 'Xóa bài viết',
    post_report: 'Báo cáo bài viết',
    post_copy_link_short: 'Sao chép liên kết',
    post_anon_you: 'Bạn (Ẩn danh)',
    post_anon_user: 'Người dùng ẩn danh',
    post_shared_from: 'đã chia sẻ bài viết của',
    post_comments_label: 'bình luận',
    post_shares_label: 'lượt chia sẻ',
    post_see_all_comments: 'Xem tất cả',
    post_no_comments: 'Chưa có bình luận nào',
    post_caption_placeholder: 'Nói điều gì đó về bài viết này...',
    post_loading_reactors: 'Đang tải...',
    post_loading_more: 'Xem thêm bình luận',
    post_with: 'cùng với',
    post_feeling: 'đang cảm thấy',
    post_hide_replies: 'Ẩn trả lời',
    post_view_replies: 'Xem',
    post_replies_label: 'trả lời',
    post_like_comment: 'Thích',
    post_at: 'tại',
    post_view_original: 'Xem bài viết gốc',
    post_votes: 'phiếu',
    post_delete_comment: 'Xóa',
    post_comments_header: 'Bình luận',
    post_comment_reactions_title: 'Cảm xúc bình luận',
    post_write_your_comment: 'Viết bình luận của bạn...',

    // --- Video controls ---
    video_rewind: 'Tua lùi 5 giây',
    video_forward: 'Tua tới 5 giây',
    video_fullscreen: 'Xem toàn màn hình',

    // --- Create post ---
    create_placeholder: 'Bạn viết gì đi...',
    create_wave_placeholder: 'Chia sẻ làn sóng cảm xúc của bạn...',
    create_anonymous_short: 'B.viết ẩn danh',
    create_anonymous: 'Đăng ẩn danh',
    create_photo_video: 'Ảnh/video',
    create_poll: 'Thăm dò ý kiến',
    create_photo: 'Ảnh',
    create_add_photo: 'Thêm ảnh',
    create_edit: '✏️ Chỉnh sửa',
    create_feeling_title: 'Bạn đang cảm thấy thế nào?',
    create_feeling_remove: 'Xóa',
    create_location_loading: 'Đang lấy vị trí...',
    create_location_current: 'Vị trí hiện tại',
    create_location_manual: 'Hoặc nhập thủ công ở ô bên trên',
    create_privacy_public: 'Công khai',
    create_privacy_friends: 'Bạn bè',
    create_privacy_only_me: 'Chỉ mình tôi',
    create_privacy_custom: 'Tùy chỉnh',

    // --- Feeling labels ---
    feeling_happy: 'Vui vẻ',
    feeling_love: 'Yêu thích',
    feeling_cool: 'Ngầu',
    feeling_sad: 'Buồn',
    feeling_angry: 'Giận dữ',
    feeling_excited: 'Hào hứng',
    feeling_tired: 'Mệt mỏi',
  },

  en: {
    // --- Navigation ---
    nav_feed: 'Feed',
    nav_surf_clips: 'Surf Clips',
    nav_friends: 'Friends',
    nav_groups: 'Groups',
    nav_market: 'Surf Market',
    nav_saved: 'Saved',
    nav_events: 'Events',
    nav_pages: 'Pages',
    nav_waves: 'Waves',
    nav_explore: 'Explore',
    nav_moments: 'Moments',
    nav_live: 'Surf Live',

    // --- Sidebar ---
    sidebar_menu: 'Menu',
    sidebar_navigation: 'Navigation',
    sidebar_expand: 'Expand sidebar',
    sidebar_collapse: 'Collapse sidebar',
    sidebar_shortcuts: 'Your shortcuts',
    sidebar_no_shortcuts: 'No shortcuts yet. Visit Groups or Pages to see shortcuts appear here.',

    // --- Header ---
    header_search_placeholder: 'Search...',
    header_profile: 'Profile',
    header_settings: 'Settings',
    header_logout: 'Log out',
    header_theme_light: 'Light mode',
    header_theme_dark: 'Dark mode',
    header_theme_system: 'System default',

    // --- Settings ---
    settings_title: 'Settings',
    settings_subtitle: 'Manage your account and privacy',
    settings_back: 'Back',

    // --- Language panel ---
    lang_panel_title: 'Language & Timezone',
    lang_panel_desc: 'Choose the display language of the app.',
    lang_vi: 'Vietnamese (Tiếng Việt)',
    lang_en: 'English',
    lang_saved_toast: 'Language saved',

    // --- Common actions ---
    save: 'Save',
    cancel: 'Cancel',
    back: 'Back',
    done: 'Done',
    loading: 'Loading...',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    search: 'Search',
    send: 'Send',
    share: 'Share',
    like: 'Like',
    comment: 'Comment',
    follow: 'Follow',
    unfollow: 'Unfollow',
    add_friend: 'Add friend',
    unfriend: 'Unfriend',
    block: 'Block',
    report: 'Report',
    post: 'Post',

    // --- Feed ---
    feed_empty: 'No posts yet.',
    feed_load_more: 'Load more',
    feed_whats_on_mind: "What's on your mind?",
    feed_photo_video: 'Photo/Video',
    feed_feeling: 'Feeling',
    feed_location: 'Location',

    // --- Friends ---
    friends_requests: 'Friend requests',
    friends_suggestions: 'People you may know',
    friends_all: 'All friends',
    friends_online: 'Active now',

    // --- Groups ---
    groups_your_groups: 'Your groups',
    groups_discover: 'Discover groups',
    groups_create: 'Create group',

    // --- Notifications ---
    notif_title: 'Notifications',
    notif_empty: 'No notifications yet.',
    notif_mark_all_read: 'Mark all as read',

    // --- Header dropdown ---
    header_view_all_profiles: 'View all profiles',
    header_settings_privacy: 'Settings & privacy',
    header_help_support: 'Help & support',
    header_display_accessibility: 'Display & accessibility',
    header_give_feedback: 'Give feedback',
    header_privacy: 'Privacy',
    header_terms: 'Terms',

    // --- Display panel ---
    display_dark_mode: 'Dark mode',
    display_dark_mode_desc: 'Adjust the appearance to reduce glare and rest your eyes.',
    display_compact_mode: 'Compact mode',
    display_compact_desc: 'Compact the menu to get more space.',
    display_keyboard: 'Keyboard',
    display_accessibility_settings: 'Accessibility settings',
    display_auto_desc: 'Automatically adjusts based on your device system settings.',
    theme_off: 'Off',
    theme_on: 'On',
    theme_auto: 'Automatic',

    // --- Settings sidebar sections ---
    section_account: 'Account',
    section_account_sub: 'Manage your account settings and security.',
    section_privacy: 'Privacy',
    section_privacy_sub: 'Control who can see your content and activity.',
    section_personalization: 'Personalization',
    section_personalization_sub: 'Make Surf work the way you want.',
    section_content_visibility: 'Who can see your content',
    section_content_visibility_sub: 'Choose who can see each type of content.',
    section_notifications: 'Notifications',
    section_notifications_sub: 'Manage your notification preferences.',
    section_appearance: 'Appearance',
    section_appearance_sub: 'Customize the look and feel of the app.',
    section_support: 'Support & Policy',
    section_support_sub: 'Community standards, terms and your rights.',

    // --- Settings items ---
    item_account_security: 'Account security',
    item_delete_account: 'Delete account',
    item_language_timezone: 'Language & Timezone',
    item_privacy_checkup: 'Privacy checkup',
    item_default_audience: 'Default audience',
    item_friend_request_privacy: 'Who can send friend requests',
    item_emotions_feedback: 'Reactions & feedback',
    item_notifications: 'Notifications & reminders',
    item_accessibility_display: 'Accessibility & display',
    item_media_files: 'Photos, video & files',
    item_privacy_settings: 'Content privacy settings',
    item_profile_protection: 'Profile protection',
    item_public_info: 'Public information',
    item_search_connect: 'Search & connect',
    item_posts_visibility: 'Post visibility',
    item_stories_visibility: 'Stories visibility',
    item_clips_visibility: 'Surf Clips visibility',
    item_followers_public: 'Followers & public content',
    item_tagging_visibility: 'Tagging & suggestions',
    item_block_list: 'Block list',
    item_notifications_reminders: 'Notifications & reminders',
    item_media_files2: 'Media files',
    item_policy: 'Community Policy & Terms',
    item_reports: 'Violation Reports',

    // --- Settings privacy panel items ---
    sp_settings: 'Settings',
    sp_language: 'Language & region',
    sp_privacy_review: 'Privacy checkup',
    sp_security: 'Security center',
    sp_activity: 'Activity log',
    sp_content_filter: 'Content filtering',
    sp_panel_title: 'Settings & privacy',

    // --- Settings page ---
    settings_no_change: 'No changes yet',

    // --- FriendsLeftNav ---
    friends_nav_title: 'Friends',
    friends_back_home: 'Back to home',

    // --- Friends page nav items ---
    fnav_home: 'Home',
    fnav_requests: 'Friend requests',
    fnav_suggestions: 'Suggestions',
    fnav_all: 'All friends',
    fnav_birthdays: 'Birthdays',
    fnav_blocked: 'Block list',
    fnav_history: 'Interaction history',

    // --- Feed page ---
    feed_free: 'Free',
    feed_market_boost_desc: 'This item is being promoted on Surf Market.',
    feed_market_explore: 'Explore this item on Surf Market.',
    feed_view_in_market: 'View in Market',
    feed_no_posts: 'No posts yet',
    feed_be_first: 'Be the first to share something!',
    feed_discover: 'Discover',
    feed_all_caught_up: "You're all caught up 🎉",
    feed_error_building: '⏳ Database is preparing... Please wait 1-2 minutes and reload the page!',
    feed_error_load: 'Unable to load feed. Please try again!',

    // --- Notifications ---
    notif_tagged: 'tagged you in a post',
    notif_friend_request: 'sent you a friend request',
    notif_reaction: 'reacted',
    notif_reaction_post: 'to your post',
    notif_comment: 'commented on your post',
    notif_reply: 'replied to your comment',
    notif_comment_reaction: 'reacted',
    notif_comment_reaction_on: 'to your comment',
    notif_mention: 'mentioned you in a comment',
    notif_default: 'sent you a notification',

    // --- Post card ---
    post_reaction_like: 'Love',
    post_reaction_wave: 'Wave',
    post_reaction_haha: 'Haha',
    post_reaction_wow: 'Wow',
    post_reaction_sad: 'Sad',
    post_reaction_cool: 'Cool',
    post_pinned: 'Pinned post',
    post_share_title: 'Share post',
    post_copy_link: 'Copy link',
    post_trash_title: 'Move to trash?',
    post_trash_desc: 'The post will be moved to trash. You can restore it within',
    post_trash_days: '36 days',
    post_trash_permanent: 'before it is permanently deleted.',
    post_trash_btn: 'Move to trash',
    post_report_title: 'Report post',
    post_report_desc: 'Let us know what is wrong with this post.',
    post_report_placeholder: 'Select a reason...',
    post_report_spam: 'Spam',
    post_report_inappropriate: 'Inappropriate content',
    post_report_misinformation: 'Misinformation',
    post_report_hate: 'Hate speech',
    post_report_harassment: 'Harassment / Bullying',
    post_report_violence: 'Violent content',
    post_report_copyright: 'Copyright violation',
    post_report_other: 'Other',
    post_report_submit: 'Submit report',
    post_report_toast_ok: '✅ Report submitted. Thank you!',
    post_report_toast_dup: '⚠️ You have already reported this post',
    post_report_toast_err: '❌ Unable to submit report. Try again later.',
    post_see_more: 'See more',
    post_see_less: 'See less',
    post_like_btn: 'Like',
    post_comment_btn: 'Comment',
    post_share_btn: 'Share',
    post_comment_policy: 'Your comment violates our community policy.',
    post_share_error: 'Unable to share post. Please try again.',
    post_delete_error: 'Unable to delete post. Please try again.',
    post_editing: 'Edited',
    post_group_in: 'in',
    post_anon: 'Anonymous',
    post_just_now: 'just now',
    post_sharing: 'Sharing...',
    post_share_now: 'Share now',
    post_submitting: 'Submitting...',
    post_loading: 'Loading...',
    post_load_more_comments: 'View more comments',
    post_write_comment: 'Write a comment...',
    post_reply: 'Reply',
    post_cancel: 'Cancel',
    post_send: 'Send',
    post_edited_label: 'Edited',
    post_in_group: 'in',
    post_you: 'You',
    post_save: 'Save post',
    post_unsave: 'Unsave',
    post_edit: 'Edit post',
    post_pin: 'Pin post',
    post_unpin: 'Unpin post',
    post_delete: 'Delete post',
    post_report: 'Report post',
    post_copy_link_short: 'Copy link',
    post_anon_you: 'You (Anonymous)',
    post_anon_user: 'Anonymous user',
    post_shared_from: 'shared a post from',
    post_comments_label: 'comments',
    post_shares_label: 'shares',
    post_see_all_comments: 'See all',
    post_no_comments: 'No comments yet',
    post_caption_placeholder: 'Say something about this post...',
    post_loading_reactors: 'Loading...',
    post_loading_more: 'View more comments',
    post_with: 'with',
    post_feeling: 'is feeling',
    post_hide_replies: 'Hide replies',
    post_view_replies: 'View',
    post_replies_label: 'replies',
    post_like_comment: 'Like',
    post_at: 'at',
    post_view_original: 'View original post',
    post_votes: 'votes',
    post_delete_comment: 'Delete',
    post_comments_header: 'Comments',
    post_comment_reactions_title: 'Comment Reactions',
    post_write_your_comment: 'Write your comment...',

    // --- Video controls ---
    video_rewind: 'Rewind 5 seconds',
    video_forward: 'Forward 5 seconds',
    video_fullscreen: 'Full screen',

    // --- Create post ---
    create_placeholder: "What's on your mind?",
    create_wave_placeholder: 'Share a wave of emotion...',
    create_anonymous_short: 'Anonymous',
    create_anonymous: 'Post anonymously',
    create_photo_video: 'Photo/Video',
    create_poll: 'Poll',
    create_photo: 'Photo',
    create_add_photo: 'Add photo',
    create_edit: '✏️ Edit',
    create_feeling_title: 'How are you feeling?',
    create_feeling_remove: 'Remove',
    create_location_loading: 'Getting location...',
    create_location_current: 'Current location',
    create_location_manual: 'Or type manually in the field above',
    create_privacy_public: 'Public',
    create_privacy_friends: 'Friends',
    create_privacy_only_me: 'Only me',
    create_privacy_custom: 'Custom',

    // --- Feeling labels ---
    feeling_happy: 'Happy',
    feeling_love: 'In love',
    feeling_cool: 'Cool',
    feeling_sad: 'Sad',
    feeling_angry: 'Angry',
    feeling_excited: 'Excited',
    feeling_tired: 'Tired',
  },
} satisfies Record<Lang, Record<string, string>>;

export type I18nKey = keyof (typeof dict)['vi'];

/** Map section key → i18n title key */
const SECTION_TITLE_MAP: Record<string, I18nKey> = {
  account: 'section_account',
  privacy: 'section_privacy',
  personalization: 'section_personalization',
  'content-visibility': 'section_content_visibility',
  notifications: 'section_notifications',
  appearance: 'section_appearance',
  support: 'section_support',
};

/** Map section key → i18n subtitle key */
const SECTION_SUB_MAP: Record<string, I18nKey> = {
  account: 'section_account_sub',
  privacy: 'section_privacy_sub',
  personalization: 'section_personalization_sub',
  'content-visibility': 'section_content_visibility_sub',
  notifications: 'section_notifications_sub',
  appearance: 'section_appearance_sub',
  support: 'section_support_sub',
};

/** Map settings item key → i18n label key */
const ITEM_LABEL_MAP: Record<string, I18nKey> = {
  'account-security': 'item_account_security',
  'delete-account': 'item_delete_account',
  'language-timezone': 'item_language_timezone',
  'privacy-checkup': 'item_privacy_checkup',
  'default-audience': 'item_default_audience',
  'friend-request-privacy': 'item_friend_request_privacy',
  'emotions-feedback': 'item_emotions_feedback',
  notifications: 'item_notifications_reminders',
  'accessibility-display': 'item_accessibility_display',
  'media-files': 'item_media_files2',
  'privacy-settings': 'item_privacy_settings',
  'profile-protection': 'item_profile_protection',
  'public-info': 'item_public_info',
  'search-connect': 'item_search_connect',
  'posts-visibility': 'item_posts_visibility',
  'stories-visibility': 'item_stories_visibility',
  'clips-visibility': 'item_clips_visibility',
  'followers-public': 'item_followers_public',
  'tagging-visibility': 'item_tagging_visibility',
  'block-list': 'item_block_list',
  policy: 'item_policy',
  reports: 'item_reports',
};

/** Hook lấy hàm dịch theo ngôn ngữ hiện tại */
export function useT() {
  const lang = useLangStore((s) => s.lang);
  return (key: I18nKey): string => dict[lang][key] ?? dict['vi'][key] ?? key;
}

/** Dịch tĩnh (ngoài React component) */
export function t(key: I18nKey, lang: Lang = 'vi'): string {
  return dict[lang][key] ?? dict['vi'][key] ?? key;
}

/** Hook trả về helpers format thời gian tương đối theo ngôn ngữ hiện tại */
export function useTimeFormatter() {
  const lang = useLangStore((s) => s.lang);
  return {
    justNow: lang === 'en' ? 'just now' : 'vừa xong',
    minutesAgo: (n: number) => lang === 'en' ? `${n}m ago` : `${n} phút trước`,
    hoursAgo: (n: number) => lang === 'en' ? `${n}h ago` : `${n} giờ trước`,
    daysAgo: (n: number) => lang === 'en' ? `${n}d ago` : `${n} ngày trước`,
    monthDay: (day: number, month: number) =>
      lang === 'en' ? `${month}/${day}` : `${day} tháng ${month}`,
    monthDayYear: (day: number, month: number, year: number) =>
      lang === 'en' ? `${month}/${day}/${year}` : `${day} tháng ${month}, ${year}`,
  };
}

/**
 * Hook trả về hàm dịch labels của settings sections/items theo key từ settings-constants.
 * tSection('account') → 'Account' | 'Tài khoản'
 * tSectionSub('account') → 'Manage...' | 'Quản lý...'
 * tItem('language-timezone') → 'Language & Timezone' | 'Ngôn ngữ & Múi giờ'
 */
export function useSettingsT() {
  const lang = useLangStore((s) => s.lang);
  const lookup = (key: I18nKey) => dict[lang][key] ?? dict['vi'][key] ?? key;
  return {
    tSection: (sectionKey: string) => {
      const k = SECTION_TITLE_MAP[sectionKey];
      return k ? lookup(k) : sectionKey;
    },
    tSectionSub: (sectionKey: string) => {
      const k = SECTION_SUB_MAP[sectionKey];
      return k ? lookup(k) : undefined;
    },
    tItem: (itemKey: string) => {
      const k = ITEM_LABEL_MAP[itemKey];
      return k ? lookup(k) : itemKey;
    },
  };
}
