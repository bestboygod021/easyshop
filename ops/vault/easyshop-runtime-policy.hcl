# Vault KV v2, mount: kv. No list, create, update, or delete capabilities.
# Keep each runtime credential at its own exact path so policy review is auditable.
path "kv/data/easyshop/production/JWT_SECRET" {
  capabilities = ["read"]
}

path "kv/data/easyshop/production/AUDIT_LOG_HMAC_KEY_V1" {
  capabilities = ["read"]
}

path "kv/data/easyshop/production/BACKUP_ENCRYPTION_KEY" {
  capabilities = ["read"]
}

path "kv/data/easyshop/production/AI_KEY_ENCRYPTION_KEY_V1" {
  capabilities = ["read"]
}
