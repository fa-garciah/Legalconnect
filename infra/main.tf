# Skeleton only. See README.md — the AWS region is a constitution [PENDING] and this
# module deliberately does not hardcode one.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_region" {
  description = "AWS region. Constitution Data Residency is [PENDING]; must appear in the firm's privacy notice under LFPDPPP, and backups must share this jurisdiction."
  type        = string
  # No default on purpose. A default here would quietly make a decision the
  # constitution reserves for the close of Fase 0.
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging or prod."
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "LegalConnect-MX"
      Slice       = "001-tenant-foundation"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

# PostgreSQL 16 — the version Constitution v1.3.0 records the null-safe predicate
# behaviour against. Pinned rather than "latest" so staging cannot silently differ
# from what the rule was verified on.
variable "postgres_version" {
  description = "RDS PostgreSQL engine version."
  type        = string
  default     = "16.4"
}

# Resources are added as the deployment story is specified. Nothing in slice 001 is
# deployable: it authenticates nothing, so no surface may be network-reachable.

# ---------------------------------------------------------------------------
# 003-authentication-mfa, T100 — the TOTP envelope key. FR-016, research.md D5.
# ---------------------------------------------------------------------------
#
# A TOTP secret cannot be hashed: it must be readable on every verification,
# which makes it the most sensitive recoverable material in the database. The
# constitution requires it "encrypted at rest under an application-held key that
# is separate from the database", so that a dump, a restored backup, or read
# access to identity_factor is not sufficient to derive a working second factor.
#
# THIS KEY IS THAT SEPARATION. Everything else in the design is downstream of it
# being genuinely elsewhere.
#
# Access is restricted and audited TO THE SAME STANDARD THIS PROJECT SETS FOR
# PAC/CSD CREDENTIALS (FR-016) — which is the constitution's own comparison, and
# a demanding one: those are the keys with which invoices are issued in a firm's
# name. Recognised Technical Debt item 11 records why the bar is there: the
# control protecting this key is key management, an operational discipline
# rather than a test that can prove itself green forever, and the realistic
# failure is a production backup restored somewhere less protected.
#
# NOT PROVISIONED YET. The AWS account is blocked (constitution, Data Residency
# [PENDING]), so nothing here has been applied. Development and CI run on
# AUTH_KEY_PROVIDER=local, and src/main.ts REFUSES TO BOOT if a deployed
# environment resolves that provider — an assertion, not a warning, with no
# override flag.

resource "aws_kms_key" "totp_envelope" {
  description = "LegalConnect MX — envelope key for TOTP factor secrets (003/FR-016)"

  # Rotation is a re-wrap, not a re-enrollment: identity_factor stores a
  # key_reference alongside each ciphertext precisely so this can rotate without
  # asking every user in the system to register their authenticator again.
  enable_key_rotation = true

  # Long enough to notice an accidental destroy and stop it. A shorter window on
  # this key would mean a mistake becomes an irreversible loss of every second
  # factor in the product before anyone reads the alert.
  deletion_window_in_days = 30

  tags = {
    Purpose   = "totp-envelope"
    Sensitive = "authentication-material"
  }
}

resource "aws_kms_alias" "totp_envelope" {
  name          = "alias/legalconnect-${var.environment}-totp-envelope"
  target_key_id = aws_kms_key.totp_envelope.key_id
}

# The application encrypts and decrypts; it never manages the key. Grants are
# deliberately narrow — no kms:ScheduleKeyDeletion, no kms:PutKeyPolicy — so a
# compromised task role cannot destroy every second factor in the product, only
# use the key for what authentication needs.
data "aws_iam_policy_document" "totp_envelope_use" {
  statement {
    sid       = "AuthenticationLayerMayEncryptAndDecrypt"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:DescribeKey"]
    resources = [aws_kms_key.totp_envelope.arn]
  }
}

output "totp_envelope_key_id" {
  description = "Value for AUTH_KMS_KEY_ID. Pair with AUTH_KEY_PROVIDER=kms."
  value       = aws_kms_key.totp_envelope.key_id
}
