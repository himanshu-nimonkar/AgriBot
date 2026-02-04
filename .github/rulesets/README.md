# GitHub Repository Rulesets

This directory contains JSON configurations for GitHub Repository Rulesets that protect branches and tags from unauthorized changes.

## Available Rulesets

### 1. Main Branch Protection (`branch-protection.json`)

Protects the `main` and `master` branches with comprehensive rules:

- **Prevents deletion** of the main branch
- **Prevents force pushes** (non-fast-forward updates)
- **Requires pull requests** with:
  - At least 1 approval
  - Dismisses stale reviews when new commits are pushed
  - Requires conversation resolution before merging
- **Requires status checks** (CodeQL must pass)
- **Bypass allowed**: Repository administrators can bypass rules

**Use Case**: Production branch protection for stable releases

---

### 2. Development Branches Protection (`development-branches.json`)

Lighter protection for development branches (`dev`, `develop`, `staging`):

- **Prevents deletion** to maintain history
- **Requires pull requests** with:
  - At least 1 approval
  - Does NOT dismiss stale reviews (more flexible)
  - Does NOT require conversation resolution
- **No required status checks** (faster iteration)
- **Bypass allowed**: Repository administrators can bypass rules

**Use Case**: Active development branches with less strict requirements

---

### 3. Release Tag Protection (`release-tags.json`)

Protects version tags from modification:

- **Prevents deletion** of release tags (`v*`, `release-*`)
- **Prevents updates** (tags are immutable once created)
- **Restricts creation** to authorized users
- **Bypass allowed**: Repository administrators can bypass rules

**Use Case**: Ensures release versions remain immutable

---

## How to Import Rulesets

### Option 1: Via GitHub Web UI

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Rules** → **Rulesets**
3. Click **New ruleset** → **Import a ruleset**
4. Upload one of the JSON files from this directory
5. Click **Create** to activate

### Option 2: Via GitHub CLI

```bash
# Install GitHub CLI if not already installed
# brew install gh (macOS) or see https://cli.github.com

# Authenticate
gh auth login

# Import main branch protection
gh api repos/himanshu-nimonkar/AgriBot/rulesets \
  --method POST \
  --input .github/rulesets/branch-protection.json

# Import development branches protection
gh api repos/himanshu-nimonkar/AgriBot/rulesets \
  --method POST \
  --input .github/rulesets/development-branches.json

# Import release tag protection
gh api repos/himanshu-nimonkar/AgriBot/rulesets \
  --method POST \
  --input .github/rulesets/release-tags.json
```

### Option 3: Manual Configuration

If import doesn't work, manually configure in GitHub UI:

1. **Settings** → **Rules** → **Rulesets** → **New ruleset**
2. Set **Ruleset Name** (e.g., "Main Branch Protection")
3. Set **Enforcement status**: Active
4. Set **Target**: Branch or Tag
5. Add **Target branches/tags** (e.g., `main`, `v*`)
6. Add **Rules** as specified in the JSON files
7. Add **Bypass actors** (Repository admins)
8. Click **Create ruleset**

---

## Ruleset Customization

### Adjust Review Requirements

In `branch-protection.json`, change:
```json
"required_approving_review_count": 2  // Require 2 approvals instead of 1
```

### Add More Status Checks

In `branch-protection.json`, add to `required_status_checks`:
```json
{
  "context": "build / test (push)",
  "integration_id": null
},
{
  "context": "security-scan",
  "integration_id": null
}
```

### Protect More Branches

In `branch-protection.json`, add to `include`:
```json
"refs/heads/production",
"refs/heads/hotfix-*"
```

### Remove Administrator Bypass

Change `bypass_actors` to empty array:
```json
"bypass_actors": []
```

---

## Bypass Actor IDs

- **1**: Organization Admin
- **2**: Repository Admin
- **3**: Maintainer
- **4**: Write
- **5**: Repository Role (Admin by default)

To find your organization/team IDs:
```bash
# List organization teams
gh api orgs/YOUR_ORG/teams

# Get team ID
gh api orgs/YOUR_ORG/teams/TEAM_NAME
```

---

## Testing Rulesets

After importing, test the rules:

1. **Main Branch**:
   ```bash
   # This should be blocked
   git push origin main --force
   
   # This should require PR
   git checkout -b test-branch
   git commit -m "test"
   git push origin test-branch
   # Now create PR via GitHub UI
   ```

2. **Tags**:
   ```bash
   # Create tag (should succeed for admins)
   git tag v1.2.1
   git push origin v1.2.1
   
   # Try to delete (should be blocked)
   git push origin :refs/tags/v1.2.1
   ```

---

## Benefits of Rulesets vs Branch Protection Rules

✅ **More flexible**: Can target multiple branches with patterns  
✅ **Tag protection**: Can protect tags (not possible with old rules)  
✅ **Better UI**: Easier to manage and visualize  
✅ **API support**: Can be managed programmatically  
✅ **Bypass modes**: More granular control over exceptions  

---

## Troubleshooting

### "Ruleset import failed"

- Ensure JSON is valid (use https://jsonlint.com)
- Check that you have admin permissions on the repository
- Verify branch/tag names match your repository structure

### "Status check never completes"

- Remove `required_status_checks` rule temporarily
- Ensure GitHub Actions workflows are configured correctly
- Check workflow names match status check contexts

### "Cannot push to main even with approval"

- Check if required status checks are passing
- Ensure CodeQL workflow is configured and running
- Verify you're not trying to force push

---

## Additional Resources

- [GitHub Rulesets Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub API - Rulesets](https://docs.github.com/en/rest/repos/rules)
- [Branch Protection Best Practices](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)

---

_Last Updated: February 3, 2026_  
_Repository: AgriBot v1.2.0_
