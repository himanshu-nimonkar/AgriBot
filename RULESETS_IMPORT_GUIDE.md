# Quick Guide: Import GitHub Rulesets

## 📋 What You Get

Three ready-to-import rulesets for repository protection:

1. **Main Branch Protection** - Comprehensive rules for production
2. **Development Branches** - Lighter rules for active development  
3. **Release Tag Protection** - Immutable version tags

---

## 🚀 Import Steps (2 Minutes)

### Via GitHub Web UI (Easiest)

1. **Go to Repository Settings**:
   ```
   https://github.com/himanshu-nimonkar/AgriBot/settings/rules
   ```

2. **For Each Ruleset**:
   - Click **"New ruleset"** → **"Import a ruleset"**
   - Upload JSON file:
     - `.github/rulesets/branch-protection.json`
     - `.github/rulesets/development-branches.json`
     - `.github/rulesets/release-tags.json`
   - Click **"Create"**

3. **Done!** Your repository is now protected.

---

### Via GitHub CLI (Advanced)

```bash
# Install GitHub CLI (if needed)
brew install gh  # macOS
# or: https://cli.github.com/manual/installation

# Authenticate
gh auth login

# Import all rulesets
cd /Users/himanshunimonkar/Downloads/AgriBot

gh api repos/himanshu-nimonkar/AgriBot/rulesets \
  --method POST \
  --input .github/rulesets/branch-protection.json

gh api repos/himanshu-nimonkar/AgriBot/rulesets \
  --method POST \
  --input .github/rulesets/development-branches.json

gh api repos/himanshu-nimonkar/AgriBot/rulesets \
  --method POST \
  --input .github/rulesets/release-tags.json
```

---

## 📖 What Each Ruleset Does

### Main Branch Protection
- ✅ Prevents deletion of `main`/`master`
- ✅ Blocks force pushes
- ✅ Requires pull request with 1 approval
- ✅ Requires CodeQL status check to pass
- ✅ Dismisses stale reviews on new commits
- ✅ Requires conversation resolution

### Development Branches  
- ✅ Prevents deletion of `dev`/`develop`/`staging`
- ✅ Requires pull request with 1 approval
- ✅ No required status checks (faster iteration)

### Release Tag Protection
- ✅ Prevents deletion of `v*` and `release-*` tags
- ✅ Prevents tag updates (immutable versions)
- ✅ Restricts tag creation to authorized users

---

## ✅ Verify Import

After importing, test that rules work:

```bash
# 1. Try force push (should be blocked)
git push origin main --force
# Expected: Error - force push blocked by ruleset

# 2. Try direct push to main (should be blocked)
git checkout main
echo "test" >> test.txt
git commit -m "test"
git push origin main
# Expected: Error - pull request required

# 3. Create PR (should succeed)
git checkout -b test-branch
echo "test" >> test.txt
git commit -m "test"
git push origin test-branch
# Now create PR via GitHub UI - should work!
```

---

## 🎯 Quick Links

- **Rulesets Page**: https://github.com/himanshu-nimonkar/AgriBot/settings/rules
- **Detailed Documentation**: See `.github/rulesets/README.md`
- **GitHub Docs**: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets

---

## 🔧 Troubleshooting

**"I don't see Import option"**
- Ensure you have Admin permissions on the repository
- Try creating a new ruleset manually and copy/paste JSON content

**"CodeQL status check fails"**
- The CodeQL workflow is already configured in `.github/workflows/`
- Wait for it to run once after merge
- Or temporarily remove the `required_status_checks` rule

**"I want to bypass rules temporarily"**
- As repository admin, you can bypass all rules
- Or temporarily set ruleset enforcement to "Disabled"

---

_For detailed customization options, see `.github/rulesets/README.md`_
