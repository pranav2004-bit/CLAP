# ✅ STUDENT STATES - Deactivated vs Deleted

**Date**: 2026-02-11 08:08 AM IST  
**Clarification**: Two separate states needed

---

## 🎯 **Your Requirement (Clarified)**

### **Two States for Students**:

1. **Deactivated** (Inactive):
   - ✅ **Visible** in interface
   - ✅ Can be **re-enabled** by admin
   - ❌ **Cannot login** (is_active=False)
   - ✅ Show "Inactive" badge
   - ✅ Show "Activate" button

2. **Deleted**:
   - ❌ **Hidden** from interface
   - ✅ **Data preserved** in database
   - ❌ **Cannot login**
   - ❌ Not shown in list
   - ✅ Can be restored by creating with same student_id

---

## 🔧 **Implementation Options**

### **Option 1: Add `is_deleted` Field** (Recommended)

**Database Migration**:
```sql
ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
```

**Logic**:
```python
# Deactivated student
user.is_active = False  # Can login? No
user.is_deleted = False  # Show in UI? Yes

# Deleted student  
user.is_active = False  # Can login? No
user.is_deleted = True   # Show in UI? No
```

**List Query**:
```python
# Show active + deactivated (not deleted)
students = User.objects.filter(
    role='student',
    is_deleted=False  # Exclude deleted
)
# This returns both active and inactive students
```

---

### **Option 2: Use Status Field** (Alternative)

**Add status field**:
```sql
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
```

**Values**:
- `'active'` - Active student (can login)
- `'inactive'` - Deactivated (visible, cannot login)
- `'deleted'` - Deleted (hidden, cannot login)

**List Query**:
```python
students = User.objects.filter(
    role='student',
    status__in=['active', 'inactive']  # Exclude deleted
)
```

---

### **Option 3: Workaround with Existing Fields** (No Migration)

**Use a convention**:
- **Deactivated**: `is_active=False` + `student_id` unchanged
- **Deleted**: `is_active=False` + `student_id` prefixed with `DELETED_`

**Example**:
```python
# Deactivate
user.is_active = False
user.save()

# Delete
user.is_active = False
user.student_id = f"DELETED_{user.student_id}_{uuid4().hex[:8]}"
user.save()
```

**List Query**:
```python
students = User.objects.filter(
    role='student'
).exclude(
    student_id__startswith='DELETED_'  # Exclude deleted
)
# This returns both active and inactive
```

---

## 📊 **Comparison**

| Option | Pros | Cons | Recommended |
|--------|------|------|-------------|
| **Option 1: is_deleted** | ✅ Clean<br>✅ Clear logic<br>✅ Easy queries | ❌ Needs migration | ⭐⭐⭐⭐⭐ **Best** |
| **Option 2: status** | ✅ Flexible<br>✅ Future-proof | ❌ Needs migration<br>❌ More complex | ⭐⭐⭐⭐ Good |
| **Option 3: Workaround** | ✅ No migration<br>✅ Works now | ❌ Hacky<br>❌ Confusing | ⭐⭐ OK |

---

## 🎯 **Recommended: Option 1 (is_deleted field)**

### **Step 1: Create Migration**

```sql
-- Add is_deleted column to users table
ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

-- Add is_deleted column to batches table (for consistency)
ALTER TABLE batches ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
```

### **Step 2: Update Models**

```python
class User(models.Model):
    # ... existing fields ...
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)  # NEW
```

### **Step 3: Update Logic**

**List Students** (show active + inactive, hide deleted):
```python
students = User.objects.filter(
    role='student',
    is_deleted=False  # Hide deleted
).order_by('-created_at')
# Returns both active and inactive students
```

**Deactivate Student** (visible, cannot login):
```python
user.is_active = False
user.is_deleted = False
user.save()
```

**Delete Student** (hidden, cannot login):
```python
user.is_active = False
user.is_deleted = True
user.save()
```

**Activate Student**:
```python
user.is_active = True
user.is_deleted = False
user.save()
```

---

## 🎊 **User Experience**

### **Student List View**:

```
Students (5):
├─ STU001 [Active] ✅ [Deactivate] [Delete]
├─ STU002 [Inactive] ⚠️ [Activate] [Delete]
├─ STU003 [Active] ✅ [Deactivate] [Delete]
├─ STU004 [Inactive] ⚠️ [Activate] [Delete]
└─ STU005 [Active] ✅ [Deactivate] [Delete]

Hidden (not shown):
└─ STU006 [Deleted] 🔴 (data preserved)
```

---

## 🔧 **Actions**

### **1. Deactivate Button**:
```
Click "Deactivate" on STU001
  ↓
is_active = False
is_deleted = False
  ↓
Shows as "Inactive" with "Activate" button
Student cannot login
```

### **2. Activate Button**:
```
Click "Activate" on STU002
  ↓
is_active = True
is_deleted = False
  ↓
Shows as "Active" with "Deactivate" button
Student can login
```

### **3. Delete Button**:
```
Click "Delete" on STU003
  ↓
is_active = False
is_deleted = True
  ↓
Disappears from list
Student cannot login
Data preserved
```

---

## ❓ **Which Option Do You Want?**

### **Option 1: Add `is_deleted` field** ⭐⭐⭐⭐⭐
- **Pros**: Clean, proper solution
- **Cons**: Needs database migration
- **Time**: 5 minutes to implement

### **Option 2: Use workaround** ⭐⭐
- **Pros**: Works immediately, no migration
- **Cons**: Hacky, confusing
- **Time**: 2 minutes to implement

---

## 🚀 **My Recommendation**

**Use Option 1 (is_deleted field)**

**Why?**
- ✅ Proper, clean solution
- ✅ Easy to understand
- ✅ Future-proof
- ✅ Clear separation of concerns
- ✅ Industry standard

**Migration is simple**:
```sql
ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE batches ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
```

---

## ❓ **Your Decision**

Please confirm which option you prefer:

1. **Option 1**: Add `is_deleted` field (recommended) - I'll create migration
2. **Option 2**: Use workaround (quick fix) - I'll implement now

Let me know and I'll implement it immediately! 🚀
