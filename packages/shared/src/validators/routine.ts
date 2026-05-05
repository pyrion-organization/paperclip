import { z } from "zod";
import {
  PROJECT_STATUSES,
  ISSUE_PRIORITIES,
  ROUTINE_CATCH_UP_POLICIES,
  ROUTINE_CONCURRENCY_POLICIES,
  ROUTINE_EXECUTION_MODES,
  ROUTINE_STATUSES,
  ROUTINE_TRIGGER_CONDITION_TYPES,
  ROUTINE_TRIGGER_SIGNING_MODES,
  ROUTINE_VARIABLE_TYPES,
} from "../constants.js";
import {
  ISSUE_EXECUTION_WORKSPACE_PREFERENCES,
  issueExecutionWorkspaceSettingsSchema,
} from "./issue.js";

const routineVariableValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);

const projectStatusRoutineTriggerConditionSchema = z.object({
  type: z.literal(ROUTINE_TRIGGER_CONDITION_TYPES[0]),
  statuses: z.array(z.enum(PROJECT_STATUSES)).min(1).max(PROJECT_STATUSES.length),
});

const routineTriggerConditionSchema = z.discriminatedUnion("type", [
  projectStatusRoutineTriggerConditionSchema,
]);

export const routineTriggerConditionsSchema = z.array(routineTriggerConditionSchema)
  .max(20)
  .transform((value) => {
    return value.map((condition) => {
      if (condition.type === "project_status") {
        const seenStatuses = new Set(condition.statuses);
        return {
          type: condition.type,
          statuses: PROJECT_STATUSES.filter((status) => seenStatuses.has(status)),
        };
      }
      return condition;
    });
  });

export const routineVariableSchema = z.object({
  name: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().max(120).optional().nullable(),
  type: z.enum(ROUTINE_VARIABLE_TYPES).optional().default("text"),
  defaultValue: routineVariableValueSchema.optional().nullable(),
  required: z.boolean().optional().default(true),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional().default([]),
}).superRefine((value, ctx) => {
  if (value.type === "select" && value.options.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "Select variables require at least one option",
    });
  }
  if (value.type !== "select" && value.options.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "Only select variables can define options",
    });
  }
  if (value.type === "select" && value.defaultValue != null) {
    if (typeof value.defaultValue !== "string" || !value.options.includes(value.defaultValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultValue"],
        message: "Select variable defaults must match one of the allowed options",
      });
    }
  }
});

export const createRoutineSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  parentIssueId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().optional().nullable(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  priority: z.enum(ISSUE_PRIORITIES).optional().default("medium"),
  status: z.enum(ROUTINE_STATUSES).optional().default("active"),
  concurrencyPolicy: z.enum(ROUTINE_CONCURRENCY_POLICIES).optional().default("coalesce_if_active"),
  catchUpPolicy: z.enum(ROUTINE_CATCH_UP_POLICIES).optional().default("skip_missed"),
  variables: z.array(routineVariableSchema).optional().default([]),
  executionMode: z.enum(ROUTINE_EXECUTION_MODES).optional().default("agent"),
  scriptPath: z.string().trim().max(500).optional().nullable(),
  scriptCommandArgs: z.array(z.string().trim().max(500)).max(100).optional().nullable().default([]),
  scriptTimeoutSec: z.number().int().min(1).max(3600).optional().default(60),
  remediationEnabled: z.boolean().optional().default(false),
  remediationAssigneeAgentId: z.string().uuid().optional().nullable(),
  notificationEmail: z.string().email().optional().nullable(),
});

export type CreateRoutine = z.infer<typeof createRoutineSchema>;

export const updateRoutineSchema = createRoutineSchema.partial();
export type UpdateRoutine = z.infer<typeof updateRoutineSchema>;

const baseTriggerSchema = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  enabled: z.boolean().optional().default(true),
  conditions: routineTriggerConditionsSchema.optional().nullable(),
});

export const createRoutineTriggerSchema = z.discriminatedUnion("kind", [
  baseTriggerSchema.extend({
    kind: z.literal("schedule"),
    cronExpression: z.string().trim().min(1),
    timezone: z.string().trim().min(1).default("UTC"),
  }),
  baseTriggerSchema.extend({
    kind: z.literal("webhook"),
    signingMode: z.enum(ROUTINE_TRIGGER_SIGNING_MODES).optional().default("bearer"),
    replayWindowSec: z.number().int().min(30).max(86_400).optional().default(300),
  }),
  baseTriggerSchema.extend({
    kind: z.literal("api"),
  }),
  baseTriggerSchema.extend({
    kind: z.literal("random_interval"),
    minIntervalSec: z.number().int().min(60).max(604_800),
    maxIntervalSec: z.number().int().min(60).max(604_800),
  }),
  baseTriggerSchema.extend({
    kind: z.literal("random_cron_scheduler"),
    allowedWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().default([0, 1, 2, 3, 4, 5, 6]),
    minTimeOfDayMin: z.number().int().min(0).max(1439).optional().default(540),
    maxTimeOfDayMin: z.number().int().min(0).max(1439).optional().default(1020),
    minDaysAhead: z.number().int().min(0).max(30).optional().default(1),
    maxDaysAhead: z.number().int().min(1).max(30).optional().default(7),
    timezone: z.string().trim().min(1),
  }),
]).superRefine((value, ctx) => {
  if (value.kind === "random_interval" && value.maxIntervalSec < value.minIntervalSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxIntervalSec"],
      message: "maxIntervalSec must be greater than or equal to minIntervalSec",
    });
  }
  if (value.kind === "random_cron_scheduler") {
    if (value.maxTimeOfDayMin < value.minTimeOfDayMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxTimeOfDayMin"],
        message: "maxTimeOfDayMin must be greater than or equal to minTimeOfDayMin",
      });
    }
    if (value.maxDaysAhead < value.minDaysAhead) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDaysAhead"],
        message: "maxDaysAhead must be greater than or equal to minDaysAhead",
      });
    }
  }
});

export type CreateRoutineTrigger = z.infer<typeof createRoutineTriggerSchema>;

export const updateRoutineTriggerSchema = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  enabled: z.boolean().optional(),
  conditions: routineTriggerConditionsSchema.optional().nullable(),
  cronExpression: z.string().trim().min(1).optional().nullable(),
  timezone: z.string().trim().min(1).optional().nullable(),
  signingMode: z.enum(ROUTINE_TRIGGER_SIGNING_MODES).optional().nullable(),
  replayWindowSec: z.number().int().min(30).max(86_400).optional().nullable(),
  minIntervalSec: z.number().int().min(60).max(604_800).optional().nullable(),
  maxIntervalSec: z.number().int().min(60).max(604_800).optional().nullable(),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  minTimeOfDayMin: z.number().int().min(0).max(1439).optional().nullable(),
  maxTimeOfDayMin: z.number().int().min(0).max(1439).optional().nullable(),
  minDaysAhead: z.number().int().min(0).max(30).optional().nullable(),
  maxDaysAhead: z.number().int().min(1).max(30).optional().nullable(),
});

export type UpdateRoutineTrigger = z.infer<typeof updateRoutineTriggerSchema>;

export const runRoutineSchema = z.object({
  triggerId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional().nullable(),
  variables: z.record(routineVariableValueSchema).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().trim().max(255).optional().nullable(),
  source: z.enum(["manual", "api"]).optional().default("manual"),
  executionWorkspaceId: z.string().uuid().optional().nullable(),
  executionWorkspacePreference: z.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional().nullable(),
  executionWorkspaceSettings: issueExecutionWorkspaceSettingsSchema.optional().nullable(),
});

export type RunRoutine = z.infer<typeof runRoutineSchema>;

export const rotateRoutineTriggerSecretSchema = z.object({});
export type RotateRoutineTriggerSecret = z.infer<typeof rotateRoutineTriggerSecretSchema>;
