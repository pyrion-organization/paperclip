import { useCallback } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Company } from "@paperclipai/shared";
import { GripVertical } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/classnames";
import { CompanyPatternIcon } from "./CompanyPatternIcon";

interface SidebarCompanySortableListProps {
  companies: Company[];
  onPersistOrder: (ids: string[]) => void;
}

function WorkspaceIcon({ company }: { company: Company }) {
  return (
    <CompanyPatternIcon
      companyName={company.name}
      logoUrl={company.logoUrl}
      brandColor={company.brandColor}
      className="size-5 shrink-0 rounded-md text-[11px]"
    />
  );
}

function SortableCompanyItem({ company }: { company: Company }) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: company.id });

  return (
    <DropdownMenuItem
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      onSelect={(event) => event.preventDefault()}
      className={cn("min-w-0 gap-2 py-2 cursor-grab", isDragging && "opacity-80")}
    >
      <WorkspaceIcon company={company} />
      <span className="min-w-0 flex-1 truncate">{company.name}</span>
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Reorder ${company.name}`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
    </DropdownMenuItem>
  );
}

export function SidebarCompanySortableList({
  companies,
  onPersistOrder,
}: SidebarCompanySortableListProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = companies.map((company) => company.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      onPersistOrder(arrayMove(ids, oldIndex, newIndex));
    },
    [companies, onPersistOrder],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={companies.map((company) => company.id)}
        strategy={verticalListSortingStrategy}
      >
        {companies.map((company) => (
          <SortableCompanyItem key={company.id} company={company} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
