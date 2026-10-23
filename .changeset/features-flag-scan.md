---
"@marktiderman/genesis-features": patch
---

The flag scan in `checkFeatureOutputs` ignores comments (a flag named in a comment isn't a read) and test files, and takes `scanIgnore` for the flags runtime that defines the accessors. Found running the check against Breakthrough's flags runtime.

Features: feature-registry
