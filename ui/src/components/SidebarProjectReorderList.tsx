import { useCallback, type ReactNode } from "react";
import {
  DndContext,
  MouseSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "@paperclipai/shared";

import { cn } from "../lib/utils";

type RenderProjectState = {
  isDragging: boolean;
};

type SidebarProjectReorderListProps = {
  projects: Project[];
  onReorder: (projectIds: string[]) => void;
  renderProject: (project: Project, state: RenderProjectState) => ReactNode;
};

function SortableProjectItem({
  project,
  renderProject,
}: {
  project: Project;
  renderProject: SidebarProjectReorderListProps["renderProject"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(isDragging && "opacity-80")}
      {...attributes}
      {...listeners}
    >
      {renderProject(project, { isDragging })}
    </div>
  );
}

export function SidebarProjectReorderList({
  projects,
  onReorder,
  renderProject,
}: SidebarProjectReorderListProps) {
  const sensors = useSensors(
    // Project reordering is intentionally desktop-only; touch should remain tap/scroll behavior.
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = projects.map((project) => project.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      onReorder(arrayMove(ids, oldIndex, newIndex));
    },
    [onReorder, projects],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={projects.map((project) => project.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-0.5">
          {projects.map((project) => (
            <SortableProjectItem
              key={project.id}
              project={project}
              renderProject={renderProject}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
