# Skeleton only, matching main.tf — the AWS region remains a constitution
# [PENDING] and this module does not commit to one. Not deployable in this slice:
# nothing here may reach a network before slice 003 supplies session and MFA
# handling, and this schedule runs against the same RDS instance from inside the
# private network regardless.
#
# FR-019 requires the removal past 24 months to be "a defined deletion routine" that
# "must NOT be performable ad hoc by the application" — a scheduled task under the
# retention role, distinct from the application's own role, is what makes that literal
# rather than a policy statement nobody enforces. backend/drizzle/retention.sql is
# what it runs; backend/drizzle/0004_audit_partitions.sql is where the actual
# detach-and-drop logic lives, as a SECURITY DEFINER function so the retention role
# does not need to own the table it is pruning.

variable "retention_schedule_expression" {
  description = "EventBridge Scheduler cron/rate expression for the partition-retention run."
  type        = string
  default     = "rate(1 day)"
}

# The retention role's connection string, sourced from Secrets Manager rather than a
# literal — role passwords are never in the repository or in Terraform state as
# plaintext (Constitution, Dependencies and Infrastructure).
variable "retention_database_secret_arn" {
  description = "Secrets Manager ARN holding DATABASE_URL_RETENTION."
  type        = string
}

# A scheduled ECS Fargate task (Target Platform is fixed by the constitution) running
# `psql -f backend/drizzle/retention.sql` against DATABASE_URL_RETENTION. Deliberately
# not defined further here: this slice ships no container image or task definition —
# see infra/README.md's "Do not deploy this slice." Filling in the aws_scheduler_schedule
# / ecs_task_definition resources is follow-up work once a region and image registry
# exist, tracked there rather than stubbed here with placeholder values that would look
# like a real deployment.
