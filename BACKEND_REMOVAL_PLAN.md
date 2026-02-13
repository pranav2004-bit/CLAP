# 🔧 Safe Backend Migration - Removal Plan

**Date**: 2026-02-11  
**Objective**: Remove Next.js API routes and make Django the sole backend  
**Status**: READY TO EXECUTE

---

## 🛡️ SAFETY MEASURES TAKEN

### ✅ Backup Created
- **Branch**: `backup-nextjs-api-routes`
- **Commit**: "BACKUP: Complete state before removing Next.js API routes"
- **Status**: ✅ Committed successfully
- **Recovery**: `git checkout backup-nextjs-api-routes` to restore

---

## 📋 WHAT WILL BE REMOVED

### 1. Next.js API Route Directories

#### Admin API Routes (12 files)
```
app/api/admin/
├── batches/
│   ├── route.ts                    🗑️ REMOVE
│   └── [id]/
│       ├── route.ts                🗑️ REMOVE
│       └── students/route.ts       🗑️ REMOVE
├── students/
│   ├── route.ts                    🗑️ REMOVE
│   └── [id]/
│       ├── route.ts                🗑️ REMOVE
│       └── reset-password/route.ts 🗑️ REMOVE
├── clap-tests/
│   ├── route.ts                    🗑️ REMOVE
│   └── [id]/
│       ├── route.ts                🗑️ REMOVE
│       ├── assign/route.ts         🗑️ REMOVE
│       └── unassign/route.ts       🗑️ REMOVE
└── tests/
    └── [id]/route.ts               🗑️ REMOVE
```

#### Student Portal API Routes (2 files)
```
app/api/student/
├── profile/route.ts                🗑️ REMOVE
└── change-password/route.ts        🗑️ REMOVE
```

#### AI Evaluation API Routes (2 files)
```
app/api/evaluate/
├── speaking/route.ts               🗑️ REMOVE
└── writing/route.ts                🗑️ REMOVE
```

#### Test Attempts API Routes (5 files)
```
app/api/attempts/
└── [id]/route.ts                   🗑️ REMOVE
```

#### Test Management API Routes (2 files)
```
app/api/tests/
└── [id]/route.ts                   🗑️ REMOVE
```

**Total to Remove**: ~25 API route files

---

## ✅ WHAT WILL BE KEPT

### Keep These (Not Backend-Related)
```
app/api/auth/                       ✅ KEEP (NextAuth authentication)
```

### Keep These (Frontend)
```
app/                                ✅ KEEP (All frontend pages)
components/                         ✅ KEEP (All UI components)
lib/api-config.ts                   ✅ KEEP (Django API configuration)
lib/admin-api-client.ts             ✅ KEEP (Updated for Django)
lib/ai-evaluation.ts                ✅ KEEP (Updated for Django)
```

### Keep These (Django Backend)
```
django-backend/                     ✅ KEEP (New backend)
```

---

## 🔍 FILES TO REVIEW (May Need Updates)

### 1. Supabase Client Files
```
lib/supabase.ts                     ⚠️ REVIEW (May still be used by auth)
lib/supabase/                       ⚠️ REVIEW (Check if needed)
```

**Action**: Check if used by NextAuth or other features

### 2. API Utility Files
```
lib/api-utils.ts                    ⚠️ REVIEW (May have old API helpers)
```

**Action**: Remove if only used by old API routes

### 3. Type Definitions
```
types/api.ts                        ⚠️ REVIEW (May have old API types)
```

**Action**: Update to match Django API responses

---

## 📝 REMOVAL STEPS

### Step 1: Remove Admin API Routes
```powershell
Remove-Item -Recurse -Force app/api/admin/batches
Remove-Item -Recurse -Force app/api/admin/students
Remove-Item -Recurse -Force app/api/admin/clap-tests
Remove-Item -Recurse -Force app/api/admin/tests
```

### Step 2: Remove Student Portal API Routes
```powershell
Remove-Item -Recurse -Force app/api/student
```

### Step 3: Remove AI Evaluation API Routes
```powershell
Remove-Item -Recurse -Force app/api/evaluate
```

### Step 4: Remove Test/Attempt API Routes
```powershell
Remove-Item -Recurse -Force app/api/attempts
Remove-Item -Recurse -Force app/api/tests
```

### Step 5: Clean Up Empty Directories
```powershell
# Remove admin folder if empty
if ((Get-ChildItem app/api/admin).Count -eq 0) {
    Remove-Item app/api/admin
}
```

---

## ✅ VERIFICATION CHECKLIST

After removal, verify:

### Frontend Still Works
- [ ] Dashboard loads correctly
- [ ] Batch management works
- [ ] Student management works
- [ ] CLAP test management works
- [ ] No console errors

### Django Backend Active
- [ ] Django server running on localhost:8000
- [ ] All API endpoints responding
- [ ] Database connection active
- [ ] No errors in Django logs

### No Broken References
- [ ] No import errors
- [ ] No 404 errors for API calls
- [ ] TypeScript compiles without errors
- [ ] Next.js builds successfully

---

## 🔄 ROLLBACK PLAN

If anything goes wrong:

### Option 1: Git Restore
```powershell
git checkout backup-nextjs-api-routes
```

### Option 2: Restore Specific Files
```powershell
git checkout backup-nextjs-api-routes -- app/api/
```

### Option 3: Cherry-pick Specific Folders
```powershell
git checkout backup-nextjs-api-routes -- app/api/admin/batches
```

---

## 📊 IMPACT ASSESSMENT

### Zero Impact (Safe to Remove)
- ✅ Old API routes not being called by frontend
- ✅ Frontend already using Django backend
- ✅ Database unchanged (both use same Supabase)
- ✅ No data loss risk

### Positive Impact
- ✅ Cleaner codebase
- ✅ Less confusion
- ✅ Easier maintenance
- ✅ Faster builds (fewer files)

### Potential Risks (Mitigated)
- ⚠️ Accidental deletion of needed files
  - **Mitigation**: Backup branch created
- ⚠️ Breaking authentication
  - **Mitigation**: Keeping `app/api/auth/`
- ⚠️ Missing dependencies
  - **Mitigation**: Verification checklist

---

## 🎯 EXECUTION ORDER

1. ✅ **Phase 1**: Create backup (DONE)
2. ⏳ **Phase 2**: Remove API route files
3. ⏳ **Phase 3**: Clean up dependencies
4. ⏳ **Phase 4**: Verify application works
5. ⏳ **Phase 5**: Commit changes

---

## 📁 FILES THAT WILL REMAIN

### Frontend
- All pages in `app/`
- All components in `components/`
- All utilities in `lib/` (except old API helpers)
- Updated API client (`lib/api-config.ts`)

### Backend
- Complete Django backend in `django-backend/`
- All Django API endpoints
- Database models
- Settings and configuration

### Configuration
- `.env.local` (may need cleanup)
- `next.config.js`
- `package.json`
- `tsconfig.json`

---

## ✅ SUCCESS CRITERIA

Migration is successful when:

1. ✅ All old Next.js API routes removed
2. ✅ Frontend still works perfectly
3. ✅ Django backend is sole backend
4. ✅ No console errors
5. ✅ No TypeScript errors
6. ✅ Application builds successfully
7. ✅ All features functional

---

## 📞 SUPPORT

### If Issues Occur

1. **Check backup branch**: `git checkout backup-nextjs-api-routes`
2. **Review removal log**: Check this document
3. **Verify Django running**: `http://localhost:8000/api/admin/batches`
4. **Check console logs**: Browser developer tools

### Recovery Commands
```powershell
# Full restore
git checkout backup-nextjs-api-routes

# Restore specific folder
git checkout backup-nextjs-api-routes -- app/api/admin

# View what was removed
git diff backup-nextjs-api-routes main
```

---

**Status**: ✅ READY TO EXECUTE  
**Risk Level**: 🟢 LOW (Backup created)  
**Estimated Time**: 5-10 minutes  
**Reversible**: ✅ YES (via git)
