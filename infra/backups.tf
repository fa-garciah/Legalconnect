# 024-deployment-pipeline, US4 / FR-013 — where the daily database backups go, and who may touch them.
#
# deploy/scripts/backup.sh writes here; deploy/scripts/restore-check.sh and
# deploy/runbooks/restore.md read from here. Declared rather than clicked, per the constitution's
# "Infrastructure declared as code". NOT APPLIED: the region is still open (spec 024, open question 1)
# and the retention period is the technical lead's call, so neither has a default.
#
# Constitution, Security Constraints: "Backups reside in the same jurisdiction as the primary data."
# var.aws_region must therefore be the EC2 host's region, not merely any region the account can use.

variable "backup_retention_days" {
  description = "Days a database backup is kept before S3 expires it. The technical lead's call; no default on purpose."
  type        = number

  validation {
    condition     = var.backup_retention_days >= 7
    error_message = "Keep at least a week of backups: a defect noticed on Monday may date from last week."
  }
}

# A key of its own rather than the TOTP envelope key: the backup writer must be able to encrypt with
# it, and nothing that writes backups should hold any grant on the key that unwraps second factors.
resource "aws_kms_key" "db_backups" {
  description             = "LegalConnect MX — database backups at rest (024/FR-013)"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  tags = {
    Purpose = "db-backups"
  }
}

resource "aws_kms_alias" "db_backups" {
  name          = "alias/legalconnect-${var.environment}-db-backups"
  target_key_id = aws_kms_key.db_backups.key_id
}

resource "aws_s3_bucket" "db_backups" {
  bucket_prefix = "legalconnect-${var.environment}-db-backups-"

  # A backup bucket that terraform destroy can empty is not a backup.
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "db_backups" {
  bucket                  = aws_s3_bucket.db_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Versioned, so an overwrite or a delete by a compromised writer leaves the previous object behind.
resource "aws_s3_bucket_versioning" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.db_backups.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"
    filter {}

    expiration {
      days = var.backup_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = var.backup_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# TLS only, and nothing unencrypted or encrypted under another key gets in.
data "aws_iam_policy_document" "db_backups_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.db_backups.arn, "${aws_s3_bucket.db_backups.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid       = "DenyObjectsNotUnderTheBackupKey"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.db_backups.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotEqualsIfExists"
      variable = "s3:x-amz-server-side-encryption-aws-kms-key-id"
      values   = [aws_kms_key.db_backups.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  policy = data.aws_iam_policy_document.db_backups_bucket.json
}

# What deploy/scripts/backup.sh needs, and nothing else: it can add a backup, never read, list or
# delete one. Attach to whatever identity runs the schedule (an instance profile or an IAM user —
# undecided, spec 024 open question 2); not attached here for that reason.
data "aws_iam_policy_document" "db_backup_writer" {
  statement {
    sid       = "WriteBackups"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.db_backups.arn}/*"]
  }
  statement {
    sid       = "EncryptBackups"
    actions   = ["kms:GenerateDataKey"]
    resources = [aws_kms_key.db_backups.arn]
  }
}

# What a restore needs (deploy/runbooks/restore.md). Held by people, during an incident — not by the
# host that writes the backups.
data "aws_iam_policy_document" "db_backup_reader" {
  statement {
    sid       = "ReadBackups"
    actions   = ["s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket", "s3:ListBucketVersions"]
    resources = [aws_s3_bucket.db_backups.arn, "${aws_s3_bucket.db_backups.arn}/*"]
  }
  statement {
    sid       = "DecryptBackups"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.db_backups.arn]
  }
}

resource "aws_iam_policy" "db_backup_writer" {
  name   = "legalconnect-${var.environment}-db-backup-writer"
  policy = data.aws_iam_policy_document.db_backup_writer.json
}

resource "aws_iam_policy" "db_backup_reader" {
  name   = "legalconnect-${var.environment}-db-backup-reader"
  policy = data.aws_iam_policy_document.db_backup_reader.json
}

output "db_backup_target" {
  description = "Value for BACKUP_TARGET in deploy/scripts/backup.sh."
  value       = "s3://${aws_s3_bucket.db_backups.bucket}/daily"
}

output "db_backup_kms_key_id" {
  description = "Value for BACKUP_KMS_KEY_ID in deploy/scripts/backup.sh."
  value       = aws_kms_key.db_backups.arn
}
