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
