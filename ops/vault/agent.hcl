vault {
  address = "https://vault.vault.svc:8200"
}

auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role       = "easyshop-runtime"
      token_path = "/var/run/secrets/vault/token"
    }
  }

  # This file lives in an Agent-only memory volume and is never mounted in the API container.
  sink "file" {
    config = {
      path = "/vault/agent-token/.vault-token"
      mode = 0600
    }
  }
}

template {
  source               = "/etc/vault/templates/JWT_SECRET.ctmpl"
  destination          = "/vault/secrets/JWT_SECRET"
  perms                = "0400"
  error_on_missing_key = true
}

template {
  source               = "/etc/vault/templates/AUDIT_LOG_HMAC_KEY_V1.ctmpl"
  destination          = "/vault/secrets/AUDIT_LOG_HMAC_KEY_V1"
  perms                = "0400"
  error_on_missing_key = true
}

template {
  source               = "/etc/vault/templates/BACKUP_ENCRYPTION_KEY.ctmpl"
  destination          = "/vault/secrets/BACKUP_ENCRYPTION_KEY"
  perms                = "0400"
  error_on_missing_key = true
}

template {
  source               = "/etc/vault/templates/AI_KEY_ENCRYPTION_KEY_V1.ctmpl"
  destination          = "/vault/secrets/AI_KEY_ENCRYPTION_KEY_V1"
  perms                = "0400"
  error_on_missing_key = true
}
