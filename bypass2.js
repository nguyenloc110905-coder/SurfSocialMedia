const fs = require('fs');
const file = 'surf-mobile/src/components/PostCard.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Update the Ellipsis TouchableOpacity
const oldEllipsis = "<TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>\n          <Ionicons name=\"ellipsis-horizontal\" size={18} color={C.subtext} />\n        </TouchableOpacity>";
const newEllipsis = "<TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setShowOptions(true)}>\n          <Ionicons name=\"ellipsis-horizontal\" size={18} color={C.subtext} />\n        </TouchableOpacity>";

// 2. Remove the handleSave button
const oldSaveBtn = "        <TouchableOpacity style={s.actionBtn} onPress={handleSave}>\n          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={21} color={saved ? C.accent : C.subtext} />\n        </TouchableOpacity>\n";
const newSaveBtn = "";

// 3. Add Modals code
const newModals = `
      {/* Options Action Sheet */}
      <Modal visible={showOptions} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={s.modalScrim} activeOpacity={1} onPress={() => setShowOptions(false)} />
        <View style={[s.actionSheet, { backgroundColor: C.card }]}>
          <View style={[s.sheetHandle, { backgroundColor: C.border }]} />
          
          <TouchableOpacity style={s.sheetAction} onPress={() => { setShowOptions(false); handleSave(); }}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={C.text} />
            <Text style={[s.sheetActionText, { color: C.text }]}>{saved ? t('post_unsave') || 'Bỏ lưu' : t('post_save') || 'Lưu bài viết'}</Text>
          </TouchableOpacity>

          {isAuthor ? (
            <>
              <TouchableOpacity style={s.sheetAction} onPress={() => { setShowOptions(false); setShowEditModal(true); }}>
                <Ionicons name="pencil" size={24} color={C.text} />
                <Text style={[s.sheetActionText, { color: C.text }]}>{t('post_edit') || 'Chỉnh sửa bài viết'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetAction} onPress={() => { setShowOptions(false); setShowPrivacyModal(true); }}>
                <Ionicons name="lock-closed-outline" size={24} color={C.text} />
                <Text style={[s.sheetActionText, { color: C.text }]}>{t('privacy') || 'Quyền riêng tư'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={s.sheetAction} onPress={() => { setShowOptions(false); setShowReportModal(true); }}>
              <Ionicons name="flag-outline" size={24} color="#ef4444" />
              <Text style={[s.sheetActionText, { color: '#ef4444' }]}>{t('post_report_title') || 'Báo cáo bài viết'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      {/* Edit Modal Placeholder */}
      <Modal visible={showEditModal} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={[s.fullModal, { backgroundColor: C.card }]}>
          <View style={[s.modalHeader, { borderBottomColor: C.border }]}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}><Ionicons name="close" size={24} color={C.text} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: C.text }]}>{t('post_edit') || 'Chỉnh sửa'}</Text>
            <TouchableOpacity onPress={handleEditSubmit}><Text style={[s.modalSaveBtn, { color: C.accent }]}>{t('save') || 'Lưu'}</Text></TouchableOpacity>
          </View>
          <View style={{ padding: 16 }}>
            <TextInput
              style={[s.editInput, { color: C.text, backgroundColor: C.background }]}
              multiline
              value={editContent}
              onChangeText={setEditContent}
              placeholder="Nhập nội dung..."
              placeholderTextColor={C.subtext}
            />
          </View>
        </View>
      </Modal>

      {/* Privacy Modal Placeholder */}
      <Modal visible={showPrivacyModal} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setShowPrivacyModal(false)}>
        <TouchableOpacity style={s.modalScrim} activeOpacity={1} onPress={() => setShowPrivacyModal(false)} />
        <View style={[s.actionSheet, { backgroundColor: C.card }]}>
          <Text style={[s.modalTitle, { color: C.text, padding: 16 }]}>{t('privacy') || 'Quyền riêng tư'}</Text>
          {['public', 'friends', 'only-me'].map(p => (
            <TouchableOpacity key={p} style={s.sheetAction} onPress={() => handlePrivacySubmit(p)}>
              <Ionicons name={p === 'public' ? 'earth-outline' : p === 'friends' ? 'people-outline' : 'lock-closed-outline'} size={24} color={C.text} />
              <Text style={[s.sheetActionText, { color: C.text }]}>{p}</Text>
              {post.privacy === p && <Ionicons name="checkmark" size={20} color={C.accent} style={{ marginLeft: 'auto' }}/>}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Report Modal Placeholder */}
      <Modal visible={showReportModal} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setShowReportModal(false)}>
        <TouchableOpacity style={s.modalScrim} activeOpacity={1} onPress={() => setShowReportModal(false)} />
        <View style={[s.actionSheet, { backgroundColor: C.card }]}>
          <Text style={[s.modalTitle, { color: C.text, padding: 16 }]}>{t('post_report_title') || 'Báo cáo bài viết'}</Text>
          {['spam', 'inappropriate', 'hate', 'harassment', 'other'].map(r => (
            <TouchableOpacity key={r} style={s.sheetAction} onPress={() => { setReportReason(r); handleReport(); }}>
              <Text style={[s.sheetActionText, { color: C.text }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

    </View>
  );
}
`;

content = content.replace(oldEllipsis, newEllipsis);
content = content.replace(oldSaveBtn, newSaveBtn);
content = content.replace(/    <\/View>\n  \);\n}\n/g, newModals);

fs.writeFileSync(file, content);
console.log('Replaced successfully part 2');
