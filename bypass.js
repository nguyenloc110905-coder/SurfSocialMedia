const fs = require('fs');
const file = 'surf-mobile/src/components/PostCard.tsx';
let content = fs.readFileSync(file, 'utf8');

const newStr = "\n" +
"  const [showOptions, setShowOptions] = useState(false);\n" +
"  const [showReportModal, setShowReportModal] = useState(false);\n" +
"  const [reportReason, setReportReason] = useState('');\n" +
"  const [reportDetails, setReportDetails] = useState('');\n" +
"  const [reportSubmitting, setReportSubmitting] = useState(false);\n" +
"  const [reportToast, setReportToast] = useState(null);\n" +
"\n" +
"  const [showEditModal, setShowEditModal] = useState(false);\n" +
"  const [editContent, setEditContent] = useState(post.content || '');\n" +
"  const [isEditing, setIsEditing] = useState(false);\n" +
"\n" +
"  const [showPrivacyModal, setShowPrivacyModal] = useState(false);\n" +
"  const isAuthor = uid === post.authorId;\n" +
"\n" +
"  const handleReport = async () => {\n" +
"    if (!reportReason || reportSubmitting) return;\n" +
"    setReportSubmitting(true);\n" +
"    try {\n" +
"      const reasonText = reportDetails.trim() ? reportReason + ' - ' + reportDetails.trim() : reportReason;\n" +
"      await api.post('/api/posts/' + post.id + '/report', { reason: reasonText });\n" +
"      setShowReportModal(false);\n" +
"      setReportReason('');\n" +
"      setReportDetails('');\n" +
"      setReportToast(t('post_report_toast_ok') || 'Đã gửi báo cáo');\n" +
"    } catch (e) {\n" +
"      const msg = e.response?.data?.error || '';\n" +
"      setReportToast(msg.includes('đã báo cáo') ? (t('post_report_toast_dup') || 'Đã báo cáo bài viết này rồi') : (t('post_report_toast_err') || 'Không thể gửi báo cáo'));\n" +
"    } finally {\n" +
"      setReportSubmitting(false);\n" +
"      setTimeout(() => setReportToast(null), 3000);\n" +
"    }\n" +
"  };\n" +
"\n" +
"  const handleEditSubmit = async () => {\n" +
"    if (!editContent.trim()) return;\n" +
"    setIsEditing(true);\n" +
"    try {\n" +
"      await api.patch('/api/posts/' + post.id, { content: editContent.trim(), privacy: post.privacy });\n" +
"      updatePost({ id: post.id, content: editContent.trim(), isEdited: true });\n" +
"      setShowEditModal(false);\n" +
"    } catch (e) {\n" +
"      alert('Không thể chỉnh sửa bài viết.');\n" +
"    } finally {\n" +
"      setIsEditing(false);\n" +
"    }\n" +
"  };\n" +
"\n" +
"  const handlePrivacySubmit = async (newPrivacy) => {\n" +
"    try {\n" +
"      await api.patch('/api/posts/' + post.id, { privacy: newPrivacy });\n" +
"      updatePost({ id: post.id, privacy: newPrivacy });\n" +
"      setShowPrivacyModal(false);\n" +
"    } catch (e) {\n" +
"      alert('Không thể cập nhật quyền riêng tư.');\n" +
"    }\n" +
"  };\n";

content = content.replace(/const MAX_CHARS = 150;/, newStr + '\n  const MAX_CHARS = 150;');
fs.writeFileSync(file, content);
console.log('Replaced successfully');
