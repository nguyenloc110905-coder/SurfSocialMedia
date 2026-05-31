
const fs = require('fs');
const file = 'surf-mobile/src/components/PostCard.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldStr = \  const [expanded, setExpanded] = useState(false);
  const likeButtonRef = useRef<View>(null);
  const pickerActiveRef = useRef(false);
  const pickerAnchorRef = useRef<PickerAnchor>({ px: 0, py: 0, pw: 0, ph: 0 });
  const hoveredEmojiRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLikePressRef = useRef<() => void>(() => {});
  const handleReactRef = useRef<(e: string) => void>(() => {});

  const handleShare = () => setShowShareModal(true);

  const handleSave = async () => {
    if (!uid) return;
    const next = !saved;
    setSaved(next);
    try {
      if (next) await api.post(\\\\\/api/posts/\\\\\/save\\\\\, {});
      else await api.delete(\\\\\/api/posts/\\\\\/save\\\\\);
    } catch { setSaved(!next); }
  };\;

const newStr = \  const [expanded, setExpanded] = useState(false);
  
  const [showOptions, setShowOptions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportToast, setReportToast] = useState<string | null>(null);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [editContent, setEditContent] = useState(post.content || '');
  const [isEditing, setIsEditing] = useState(false);
  
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const isAuthor = uid === post.authorId;

  const likeButtonRef = useRef<View>(null);
  const pickerActiveRef = useRef(false);
  const pickerAnchorRef = useRef<PickerAnchor>({ px: 0, py: 0, pw: 0, ph: 0 });
  const hoveredEmojiRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLikePressRef = useRef<() => void>(() => {});
  const handleReactRef = useRef<(e: string) => void>(() => {});

  const handleShare = () => setShowShareModal(true);

  const handleSave = async () => {
    if (!uid) return;
    const next = !saved;
    setSaved(next);
    try {
      if (next) await api.post(\\\\\/api/posts/\\\\\/save\\\\\, {});
      else await api.delete(\\\\\/api/posts/\\\\\/save\\\\\);
    } catch { setSaved(!next); }
  };

  const handleReport = async () => {
    if (!reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const reasonText = reportDetails.trim() ? \\\\\\\\\\ - \\\\\\\\\\ : reportReason;
      await api.post(\\\\\/api/posts/\\\\\/report\\\\\, { reason: reasonText });
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
      setReportToast(t('post_report_toast_ok') || 'Ðã g?i báo cáo');
    } catch (e) {
      const msg = e.response?.data?.error || '';
      setReportToast(msg.includes('dã báo cáo') ? (t('post_report_toast_dup') || 'Ðã báo cáo bài vi?t này r?i') : (t('post_report_toast_err') || 'Không th? g?i báo cáo'));
    } finally {
      setReportSubmitting(false);
      setTimeout(() => setReportToast(null), 3000);
    }
  };

  const handleEditSubmit = async () => {
    if (!editContent.trim()) return;
    setIsEditing(true);
    try {
      await api.patch(\\\\\/api/posts/\\\\\\\\\\, { content: editContent.trim(), privacy: post.privacy });
      updatePost({ id: post.id, content: editContent.trim(), isEdited: true });
      setShowEditModal(false);
    } catch (e) {
      alert('Không th? ch?nh s?a bài vi?t.');
    } finally {
      setIsEditing(false);
    }
  };

  const handlePrivacySubmit = async (newPrivacy) => {
    try {
      await api.patch(\\\\\/api/posts/\\\\\\\\\\, { privacy: newPrivacy });
      updatePost({ id: post.id, privacy: newPrivacy });
      setShowPrivacyModal(false);
    } catch (e) {
      alert('Không th? c?p nh?t quy?n riêng tu.');
    }
  };\;

if (content.includes(oldStr)) {
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(file, content);
  console.log('Replaced successfully');
} else {
  console.log('Old string not found');
}

