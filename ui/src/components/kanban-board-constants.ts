export const KANBAN_BOARD_HIGH_VOLUME_THRESHOLD = 100;
export const KANBAN_COLUMN_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export type KanbanColumnPageSize = (typeof KANBAN_COLUMN_PAGE_SIZE_OPTIONS)[number];
export const KANBAN_COLUMN_DEFAULT_PAGE_SIZE: KanbanColumnPageSize = 10;
export const KANBAN_COLUMN_INITIAL_VISIBLE_LIMIT = KANBAN_COLUMN_DEFAULT_PAGE_SIZE;
export const KANBAN_COLUMN_REVEAL_INCREMENT = KANBAN_COLUMN_DEFAULT_PAGE_SIZE;
export const KANBAN_COLD_STATUSES = ["backlog", "done", "cancelled"] as const;
